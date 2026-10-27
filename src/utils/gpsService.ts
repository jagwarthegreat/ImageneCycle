/**
 * GPS tracking: Capacitor Geolocation on Android, browser Geolocation elsewhere.
 * Bearing / COG, distance, grade, VAM. Auto-pause lives in App (autoPause.ts).
 */

export interface GpsFix {
  lat: number;
  lng: number;
  altitude: number; // meters
  accuracy: number; // meters
  speedKmh: number; // km/h
  heading: number; // degrees 0-360
  timestamp: number;
  vam: number; // m/h, 30s sliding window
  /** Derived lock quality for HUD */
  quality: 'GPS 3D' | 'GPS 2D' | 'Weak' | 'Searching...';
  /** When true, App should update coords/HUD only — do not accumulate ride distance */
  displayOnly?: boolean;
}

export interface GpsTrackingOptions {
  batterySaver?: boolean;
}

import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { correctEllipsoidalAltitude } from './elevationService';
import { smoothedGradeFromHistory } from './smoothedGrade';

export function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function calculateBearingDegrees(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(((lon2 - lon1) * Math.PI) / 180);
  let brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

export function smoothCircularAngles(angles: number[]): number {
  if (angles.length === 0) return 0;
  if (angles.length === 1) return angles[0];
  let sumSin = 0;
  let sumCos = 0;
  for (const a of angles) {
    const rad = (a * Math.PI) / 180;
    sumSin += Math.sin(rad);
    sumCos += Math.cos(rad);
  }
  const avgRad = Math.atan2(sumSin / angles.length, sumCos / angles.length);
  const deg = (avgRad * 180) / Math.PI;
  return (deg + 360) % 360;
}

export function accuracyToQuality(accuracy: number): GpsFix['quality'] {
  if (accuracy < 15) return 'GPS 3D';
  if (accuracy < 40) return 'GPS 2D';
  if (Number.isFinite(accuracy) && accuracy < 500) return 'Weak';
  return 'Searching...';
}

const VAM_WINDOW_MS = 30_000;
const BATTERY_SAVER_INTERVAL_MS = 10_000;
const GPS_TIMEOUT_MS = 25_000;
const WATCH_MAX_AGE_MS = 5_000;
const FAST_FIX_MAX_AGE_MS = 60_000;
const FAST_FIX_TIMEOUT_MS = 5_000;
const WARMUP_MAX_ACC_M = 50;
const TRACKING_MAX_ACC_M = 80;
const MAX_JUMP_KMH = 80;

export const FAST_GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  maximumAge: FAST_FIX_MAX_AGE_MS,
  timeout: FAST_FIX_TIMEOUT_MS
};

type CoordsLike = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  course?: number | null;
  trueHeading?: number | null;
};

function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function deviceHeading(coords: CoordsLike): number | null {
  const candidates = [coords.heading, coords.course ?? null, coords.trueHeading ?? null];
  for (const h of candidates) {
    if (h !== null && h !== undefined && !isNaN(h) && h >= 0) return h;
  }
  return null;
}

class GpsService {
  private watchId: number | null = null;
  private capacitorWatchId: string | null = null;
  private capacitorStartGen = 0;
  private pollIntervalId: number | null = null;
  private prevFix: GpsFix | null = null;
  private altitudeHistory: { alt: number; dist: number }[] = [];
  private altitudeTimeHistory: { alt: number; t: number }[] = [];
  private accumulatedDistMeters: number = 0;
  private slidingVam: number = 0;
  private hasGoodLock = false;
  private headingHistory: number[] = [];
  private lastKnownHeading: number = 0;

  private currentTrackingSessionId: string | null = null;

  private onMovementDetectedCb: ((speedKmh: number) => void) | null = null;
  private persistentMotionListenerAttached = false;

  private onFixCb: ((fix: GpsFix, deltaDist: number, instantGrade: number) => void) | null = null;
  private onErrorCb: ((err: string) => void) | null = null;
  private batterySaver: boolean = false;

  public isSupported(): boolean {
    if (isAndroidNative()) return true;
    return typeof navigator !== 'undefined' && 'geolocation' in navigator;
  }

  public getSlidingVam(): number {
    return this.slidingVam;
  }

  public setTrackingSessionId(id: string | null): void {
    this.currentTrackingSessionId = id;
  }

  public getTrackingSessionId(): string | null {
    return this.currentTrackingSessionId;
  }

  public isSessionValid(activeSessionId: string | null): boolean {
    if (!this.currentTrackingSessionId || !activeSessionId) return false;
    return this.currentTrackingSessionId === activeSessionId;
  }

  public setOnMovementDetected(cb: ((speedKmh: number) => void) | null): void {
    this.onMovementDetectedCb = cb;
    this.initPersistentMovementListener();
  }

  private initPersistentMovementListener(): void {
    if (typeof window === 'undefined') return;
    if (this.persistentMotionListenerAttached) return;
    this.persistentMotionListenerAttached = true;

    try {
      const handleDeviceMotion = (event: DeviceMotionEvent) => {
        const acc = event.acceleration || event.accelerationIncludingGravity;
        if (acc) {
          const x = acc.x ?? 0;
          const y = acc.y ?? 0;
          const z = acc.z ?? 0;
          const mag = Math.sqrt(x * x + y * y + z * z);
          if ((event.acceleration && mag > 1.2) || mag > 12.5) {
            this.onMovementDetectedCb?.(2.0);
          }
        }
      };
      window.addEventListener('devicemotion', handleDeviceMotion, { passive: true });
    } catch {
      /* GPS velocity fallback */
    }
  }

  private geoOptions(maxAge: number) {
    return {
      enableHighAccuracy: true,
      timeout: GPS_TIMEOUT_MS,
      maximumAge: maxAge,
      interval: this.batterySaver ? BATTERY_SAVER_INTERVAL_MS : 1000,
      minimumUpdateInterval: this.batterySaver ? BATTERY_SAVER_INTERVAL_MS : 1000
    };
  }

  public startTracking(
    onFix: (fix: GpsFix, deltaDist: number, instantGrade: number) => void,
    onError: (err: string) => void,
    _onAutoPauseChange?: (paused: boolean) => void,
    options?: GpsTrackingOptions
  ): boolean {
    if (!this.isSupported()) {
      onError('Geolocation API is not supported on this device/browser.');
      return false;
    }

    this.stopTracking(false);
    this.onFixCb = onFix;
    this.onErrorCb = onError;
    this.batterySaver = !!options?.batterySaver;

    if (isAndroidNative()) {
      void this.startCapacitorTracking();
    } else {
      this.startBrowserTracking();
    }

    return true;
  }

  private startBrowserTracking(): void {
    navigator.geolocation.getCurrentPosition(
      (pos) => this.handleCoords(pos.coords, pos.timestamp),
      () => {},
      FAST_GEO_OPTIONS
    );

    if (this.batterySaver) {
      const poll = () => {
        navigator.geolocation.getCurrentPosition(
          (pos) => this.handleCoords(pos.coords, pos.timestamp),
          (err) => this.handleBrowserError(err),
          this.geoOptions(BATTERY_SAVER_INTERVAL_MS)
        );
      };
      poll();
      this.pollIntervalId = window.setInterval(poll, BATTERY_SAVER_INTERVAL_MS);
    } else {
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => this.handleCoords(pos.coords, pos.timestamp),
        (err) => this.handleBrowserError(err),
        this.geoOptions(WATCH_MAX_AGE_MS)
      );
    }
  }

  private async startCapacitorTracking(): Promise<void> {
    const gen = ++this.capacitorStartGen;
    try {
      const warm = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        maximumAge: FAST_FIX_MAX_AGE_MS,
        timeout: FAST_FIX_TIMEOUT_MS
      });
      if (gen !== this.capacitorStartGen) return;
      this.handleCoords(warm.coords as CoordsLike, warm.timestamp);
    } catch {
      /* watch continues */
    }
    if (gen !== this.capacitorStartGen) return;

    if (this.batterySaver) {
      const poll = async () => {
        if (gen !== this.capacitorStartGen) return;
        try {
          const pos = await Geolocation.getCurrentPosition(this.geoOptions(BATTERY_SAVER_INTERVAL_MS));
          if (gen !== this.capacitorStartGen) return;
          this.handleCoords(pos.coords as CoordsLike, pos.timestamp);
        } catch (err) {
          if (gen === this.capacitorStartGen) this.handleCapacitorError(err);
        }
      };
      void poll();
      this.pollIntervalId = window.setInterval(() => void poll(), BATTERY_SAVER_INTERVAL_MS);
      return;
    }

    try {
      const id = await Geolocation.watchPosition(
        this.geoOptions(WATCH_MAX_AGE_MS),
        (pos, err) => {
          if (gen !== this.capacitorStartGen) return;
          if (err || !pos) {
            this.handleCapacitorError(err);
            return;
          }
          this.handleCoords(pos.coords as CoordsLike, pos.timestamp);
        }
      );
      if (gen !== this.capacitorStartGen) {
        void Geolocation.clearWatch({ id });
        return;
      }
      this.capacitorWatchId = id;
    } catch (err) {
      if (gen === this.capacitorStartGen) this.handleCapacitorError(err);
    }
  }

  private updateSlidingVam(alt: number, now: number): number {
    this.altitudeTimeHistory.push({ alt, t: now });
    const cutoff = now - VAM_WINDOW_MS;
    while (this.altitudeTimeHistory.length > 0 && this.altitudeTimeHistory[0].t < cutoff) {
      this.altitudeTimeHistory.shift();
    }

    if (this.altitudeTimeHistory.length < 2) {
      this.slidingVam = 0;
      return 0;
    }

    let ascent = 0;
    for (let i = 1; i < this.altitudeTimeHistory.length; i++) {
      const d = this.altitudeTimeHistory[i].alt - this.altitudeTimeHistory[i - 1].alt;
      if (d > 0) ascent += d;
    }

    const oldest = this.altitudeTimeHistory[0];
    const windowSec = Math.max(1, (now - oldest.t) / 1000);
    this.slidingVam = Math.round((ascent / windowSec) * 3600);
    return this.slidingVam;
  }

  private resolveHeading(coords: CoordsLike, speedKmh: number, deltaDist: number, lat: number, lng: number): number {
    let heading = this.lastKnownHeading;
    if (this.prevFix && (speedKmh >= 2.0 || deltaDist >= 1.5)) {
      const instantaneousBearing = calculateBearingDegrees(this.prevFix.lat, this.prevFix.lng, lat, lng);
      this.headingHistory.push(instantaneousBearing);
      if (this.headingHistory.length > 3) this.headingHistory.shift();
      heading = smoothCircularAngles(this.headingHistory);
      this.lastKnownHeading = heading;
    } else {
      const dh = deviceHeading(coords);
      if (dh !== null) {
        heading = dh;
        this.lastKnownHeading = heading;
      }
    }
    return heading;
  }

  private handleCoords(coords: CoordsLike, timestamp: number) {
    const now = timestamp || Date.now();
    const lat = coords.latitude;
    const lng = coords.longitude;
    const rawAlt = coords.altitude ?? 0;
    const alt = rawAlt > 0 ? correctEllipsoidalAltitude(lat, lng, rawAlt) : 0;
    const acc = coords.accuracy ?? 999;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    const deviceSpeedKmh =
      coords.speed !== null && !isNaN(coords.speed) && coords.speed >= 0
        ? coords.speed * 3.6
        : null;

    const maxAcc = this.hasGoodLock ? TRACKING_MAX_ACC_M : WARMUP_MAX_ACC_M;
    if (acc > maxAcc) {
      let speedKmh = deviceSpeedKmh ?? 0;
      // HUD speed from haversine even on weak fixes (odometer stays 0 via deltaDist).
      if (deviceSpeedKmh === null && this.prevFix) {
        const dtSeconds = Math.max(0.2, (now - this.prevFix.timestamp) / 1000);
        const rawDist = haversineDistanceMeters(this.prevFix.lat, this.prevFix.lng, lat, lng);
        const impliedKmh = (rawDist / dtSeconds) * 3.6;
        if (impliedKmh <= MAX_JUMP_KMH && rawDist > 0.5) {
          speedKmh = impliedKmh;
        }
      }
      const heading = this.resolveHeading(coords, speedKmh, 0, lat, lng);
      this.onFixCb?.(
        {
          lat,
          lng,
          altitude: alt,
          accuracy: acc,
          speedKmh: Math.round(speedKmh * 10) / 10,
          heading: Math.round(heading),
          timestamp: now,
          vam: this.slidingVam,
          quality: accuracyToQuality(acc),
          displayOnly: true
        },
        0,
        0
      );
      return;
    }
    this.hasGoodLock = true;

    let deltaDist = 0;
    let speedKmh = 0;

    if (this.prevFix) {
      const dtSeconds = Math.max(0.2, (now - this.prevFix.timestamp) / 1000);
      const rawDist = haversineDistanceMeters(this.prevFix.lat, this.prevFix.lng, lat, lng);
      const impliedKmh = (rawDist / dtSeconds) * 3.6;

      if (impliedKmh > MAX_JUMP_KMH && acc > 25) {
        return;
      }

      // Odometer: noise gate only (keep distance from GPS jitter).
      if (rawDist > Math.max(1.5, acc * 0.15)) {
        deltaDist = rawDist;
        this.accumulatedDistMeters += deltaDist;
      }

      // HUD speed: prefer device speed; else derive from raw haversine even below odometer gate.
      if (deviceSpeedKmh !== null) {
        speedKmh = deviceSpeedKmh;
      } else if (rawDist > 0.5 && dtSeconds > 0) {
        speedKmh = impliedKmh;
      }
    } else if (deviceSpeedKmh !== null) {
      speedKmh = deviceSpeedKmh;
    }

    const heading = this.resolveHeading(coords, speedKmh, deltaDist, lat, lng);

    if (speedKmh >= 3.0 || deltaDist >= 1.5) {
      this.onMovementDetectedCb?.(speedKmh);
    }

    this.altitudeHistory.push({ alt, dist: this.accumulatedDistMeters });
    const maxSpanM = 100;
    while (
      this.altitudeHistory.length > 40 ||
      (this.altitudeHistory.length > 2 &&
        this.accumulatedDistMeters - this.altitudeHistory[0].dist > maxSpanM)
    ) {
      this.altitudeHistory.shift();
    }

    const instantGrade = smoothedGradeFromHistory(this.altitudeHistory);
    const vam = this.updateSlidingVam(alt, now);

    const fix: GpsFix = {
      lat,
      lng,
      altitude: alt,
      accuracy: acc,
      speedKmh: Math.round(speedKmh * 10) / 10,
      heading: Math.round(heading),
      timestamp: now,
      vam,
      quality: accuracyToQuality(acc)
    };

    this.prevFix = fix;
    this.onFixCb?.(fix, deltaDist, Math.round(instantGrade * 10) / 10);
  }

  private handleBrowserError(err: GeolocationPositionError) {
    let msg = 'GPS Error';
    switch (err.code) {
      case err.PERMISSION_DENIED:
        msg = 'GPS permission denied. Please allow location access in your browser settings.';
        break;
      case err.POSITION_UNAVAILABLE:
        msg = 'GPS position unavailable. Ensure Location/GPS is turned on.';
        break;
      case err.TIMEOUT:
        msg = 'GPS acquisition timed out. Searching for satellite fix...';
        break;
    }
    this.onErrorCb?.(msg);
  }

  private handleCapacitorError(err: unknown) {
    const msg = err && typeof err === 'object' && 'message' in err
      ? String((err as { message: string }).message)
      : 'GPS position unavailable.';
    this.onErrorCb?.(msg || 'GPS Error');
  }

  public stopTracking(resetLock = true, clearSession = false) {
    this.capacitorStartGen += 1;
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.capacitorWatchId !== null) {
      void Geolocation.clearWatch({ id: this.capacitorWatchId });
      this.capacitorWatchId = null;
    }
    if (this.pollIntervalId !== null) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
    if (resetLock) {
      this.hasGoodLock = false;
    }
    if (clearSession) {
      this.currentTrackingSessionId = null;
    }
    this.onFixCb = null;
    this.onErrorCb = null;
  }

  public resetDistance() {
    this.accumulatedDistMeters = 0;
    this.prevFix = null;
    this.altitudeHistory = [];
    this.altitudeTimeHistory = [];
    this.slidingVam = 0;
    this.hasGoodLock = false;
    this.headingHistory = [];
    this.lastKnownHeading = 0;
  }
}

export const gpsService = new GpsService();
