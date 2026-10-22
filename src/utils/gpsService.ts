/**
 * Real Production GPS Tracking Service using Browser Geolocation API
 * Handles high-accuracy coordinate acquisition, noise filtering,
 * bearing calculation, geodesic distance accumulation, smoothed grade estimation,
 * Auto-Pause, Battery Saver (10s polling), and 30s sliding-window VAM.
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

export function accuracyToQuality(accuracy: number): GpsFix['quality'] {
  if (accuracy < 15) return 'GPS 3D';
  if (accuracy < 40) return 'GPS 2D';
  if (Number.isFinite(accuracy) && accuracy < 500) return 'Weak';
  return 'Searching...';
}

const VAM_WINDOW_MS = 30_000;
const BATTERY_SAVER_INTERVAL_MS = 10_000;
const GPS_TIMEOUT_MS = 25_000;
/** Accept briefly cached high-accuracy fixes so watch is not cold every time */
const WATCH_MAX_AGE_MS = 5_000;
/** Network / A-GPS warm fix for instant HUD (displayOnly until accuracy improves) */
const FAST_FIX_MAX_AGE_MS = 60_000;
const FAST_FIX_TIMEOUT_MS = 5_000;
const WARMUP_MAX_ACC_M = 50;
const TRACKING_MAX_ACC_M = 80;
const MAX_JUMP_KMH = 80;

/** Low-accuracy cached options for instant first paint */
export const FAST_GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  maximumAge: FAST_FIX_MAX_AGE_MS,
  timeout: FAST_FIX_TIMEOUT_MS
};

class GpsService {
  private watchId: number | null = null;
  private pollIntervalId: number | null = null;
  private prevFix: GpsFix | null = null;
  private altitudeHistory: { alt: number; dist: number }[] = [];
  private altitudeTimeHistory: { alt: number; t: number }[] = [];
  private accumulatedDistMeters: number = 0;
  private slidingVam: number = 0;
  private hasGoodLock = false;

  // Auto-Pause state & timer
  private lowSpeedStartTime: number | null = null;
  private isAutoPaused: boolean = false;
  private autoPauseCheckInterval: number | null = null;
  private onAutoPauseChange: ((paused: boolean) => void) | null = null;

  private onFixCb: ((fix: GpsFix, deltaDist: number, instantGrade: number) => void) | null = null;
  private onErrorCb: ((err: string) => void) | null = null;
  private batterySaver: boolean = false;

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'geolocation' in navigator;
  }

  public getSlidingVam(): number {
    return this.slidingVam;
  }

  private geoOptions(maxAge: number): PositionOptions {
    return {
      enableHighAccuracy: true,
      timeout: GPS_TIMEOUT_MS,
      maximumAge: maxAge
    };
  }

  public startTracking(
    onFix: (fix: GpsFix, deltaDist: number, instantGrade: number) => void,
    onError: (err: string) => void,
    onAutoPauseChange?: (paused: boolean) => void,
    options?: GpsTrackingOptions
  ): boolean {
    if (!this.isSupported()) {
      onError('Geolocation API is not supported on this device/browser.');
      return false;
    }

    this.stopTracking();
    this.onFixCb = onFix;
    this.onErrorCb = onError;
    this.onAutoPauseChange = onAutoPauseChange || null;
    this.lowSpeedStartTime = null;
    this.isAutoPaused = false;
    this.hasGoodLock = false;
    this.batterySaver = !!options?.batterySaver;

    this.autoPauseCheckInterval = window.setInterval(() => {
      if (this.lowSpeedStartTime && !this.isAutoPaused) {
        if (Date.now() - this.lowSpeedStartTime >= 5000) {
          this.isAutoPaused = true;
          this.onAutoPauseChange?.(true);
        }
      }
    }, 1000);

    // Instant warm path: network/A-GPS cache (displayOnly if accuracy still poor)
    navigator.geolocation.getCurrentPosition(
      (pos) => this.handlePosition(pos),
      () => {
        /* ignore — watch/poll continues */
      },
      FAST_GEO_OPTIONS
    );

    if (this.batterySaver) {
      const poll = () => {
        navigator.geolocation.getCurrentPosition(
          (pos) => this.handlePosition(pos),
          (err) => this.handleError(err),
          this.geoOptions(BATTERY_SAVER_INTERVAL_MS)
        );
      };
      poll();
      this.pollIntervalId = window.setInterval(poll, BATTERY_SAVER_INTERVAL_MS);
    } else {
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => this.handlePosition(pos),
        (err) => this.handleError(err),
        this.geoOptions(WATCH_MAX_AGE_MS)
      );
    }

    return true;
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

  private handlePosition(pos: GeolocationPosition) {
    const coords = pos.coords;
    const now = pos.timestamp;
    const lat = coords.latitude;
    const lng = coords.longitude;
    const alt = coords.altitude ?? 0;
    const acc = coords.accuracy ?? 999;

    // Warm-up: need a decent fix before accepting tracking; then allow slightly looser
    const maxAcc = this.hasGoodLock ? TRACKING_MAX_ACC_M : WARMUP_MAX_ACC_M;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }
    if (acc > maxAcc) {
      // HUD: show Weak (±m) instead of silent Searching — do not accumulate distance
      this.onFixCb?.(
        {
          lat,
          lng,
          altitude: alt,
          accuracy: acc,
          speedKmh: 0,
          heading: coords.heading ?? 0,
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
    let heading = coords.heading ?? 0;

    if (this.prevFix) {
      const dtSeconds = Math.max(0.2, (now - this.prevFix.timestamp) / 1000);
      const rawDist = haversineDistanceMeters(this.prevFix.lat, this.prevFix.lng, lat, lng);
      const impliedKmh = (rawDist / dtSeconds) * 3.6;

      // Drop impossible jumps when accuracy is weak
      if (impliedKmh > MAX_JUMP_KMH && acc > 25) {
        return;
      }

      if (rawDist > Math.max(1.5, acc * 0.15)) {
        deltaDist = rawDist;
        this.accumulatedDistMeters += deltaDist;

        if (coords.heading === null || isNaN(coords.heading)) {
          heading = calculateBearingDegrees(this.prevFix.lat, this.prevFix.lng, lat, lng);
        }
      }

      if (coords.speed !== null && !isNaN(coords.speed) && coords.speed >= 0) {
        speedKmh = coords.speed * 3.6;
      } else if (deltaDist > 0 && dtSeconds > 0) {
        speedKmh = (deltaDist / dtSeconds) * 3.6;
      }
    }

    if (speedKmh < 0.5) {
      if (!this.lowSpeedStartTime) {
        this.lowSpeedStartTime = Date.now();
      } else if (Date.now() - this.lowSpeedStartTime >= 5000 && !this.isAutoPaused) {
        this.isAutoPaused = true;
        this.onAutoPauseChange?.(true);
      }
    } else if (speedKmh >= 1.0 || deltaDist > 1.8) {
      this.lowSpeedStartTime = null;
      if (this.isAutoPaused) {
        this.isAutoPaused = false;
        this.onAutoPauseChange?.(false);
      }
    }

    this.altitudeHistory.push({ alt, dist: this.accumulatedDistMeters });
    if (this.altitudeHistory.length > 8) {
      this.altitudeHistory.shift();
    }

    let instantGrade = 0;
    if (this.altitudeHistory.length >= 2) {
      const oldest = this.altitudeHistory[0];
      const spanDist = this.accumulatedDistMeters - oldest.dist;
      const spanEle = alt - oldest.alt;
      if (spanDist >= 8) {
        instantGrade = (spanEle / spanDist) * 100;
        instantGrade = Math.max(-25, Math.min(30, instantGrade));
      }
    }

    const vam = this.updateSlidingVam(alt, now);
    const quality = accuracyToQuality(acc);

    const fix: GpsFix = {
      lat,
      lng,
      altitude: alt,
      accuracy: acc,
      speedKmh: Math.round(speedKmh * 10) / 10,
      heading: Math.round(heading),
      timestamp: now,
      vam,
      quality
    };

    this.prevFix = fix;
    this.onFixCb?.(fix, deltaDist, Math.round(instantGrade * 10) / 10);
  }

  private handleError(err: GeolocationPositionError) {
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

  public stopTracking() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.pollIntervalId !== null) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
    if (this.autoPauseCheckInterval !== null) {
      clearInterval(this.autoPauseCheckInterval);
      this.autoPauseCheckInterval = null;
    }
    this.lowSpeedStartTime = null;
    this.isAutoPaused = false;
    this.hasGoodLock = false;
    this.onFixCb = null;
    this.onErrorCb = null;
  }

  public resetDistance() {
    this.accumulatedDistMeters = 0;
    this.prevFix = null;
    this.altitudeHistory = [];
    this.altitudeTimeHistory = [];
    this.slidingVam = 0;
    this.lowSpeedStartTime = null;
    this.isAutoPaused = false;
    this.hasGoodLock = false;
  }
}

export const gpsService = new GpsService();
