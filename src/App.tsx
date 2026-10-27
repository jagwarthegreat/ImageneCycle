import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { RouteData, RoutePoint, ClimbSegment, RideMetrics, BleDeviceStatus, GpsStatus, RideHistoryItem, ActiveRideSession, AutoLapAlert, BreadcrumbPoint, RouteTurn } from './types/cycling';
import { parseGpxRoute } from './data/routes';
import { calculateClimbProLiveState } from './utils/climbProEngine';
import { bleManager } from './utils/bleManager';
import { antManager } from './utils/antManager';
import { gpsService, GpsFix, accuracyToQuality, FAST_GEO_OPTIONS } from './utils/gpsService';
import { bikeBeeper } from './utils/audioAlerts';
import { rideNarrator } from './utils/rideNarrator';
import { shouldAppendWeakBreadcrumb, shouldStitchBreadcrumb } from './utils/breadcrumbContinuity';
import { getNextTurn } from './utils/routeEncode';
import { getPowerZoneInfo, getHeartRateZoneInfo } from './utils/powerZones';
import { loadRideHistory, saveRideToHistory, deleteRideFromHistory, clearRideHistory, loadActiveSession, saveActiveSession, clearActiveSession } from './utils/rideHistory';
import { fetchLiveWeather, WeatherData } from './services/weatherService';
import { captureStravaRedirectTokens, isStravaConnected } from './utils/stravaAuth';
import { loadUserRoutes, loadUserRoutesAsync, saveUserRoute, deleteUserRoute } from './utils/routeLibrary';
import {
  probeOfflineMapAvailable,
  reconcileMapPacksInstalledFlag,
  isMapPacksInstalledFlag
} from './utils/offlineMap';
import { freeRideClimbRecorder } from './utils/freeRideClimbRecorder';
import { getRouteElevation, correctEllipsoidalAltitude, fetchDemElevation } from './utils/elevationService';
import { MageneDevice } from './components/MageneDevice';
import { MenuSheet } from './components/MenuSheet';
import { BleSensorModal } from './components/BleSensorModal';
import { ClimbManualInputModal } from './components/ClimbManualInputModal';
import { RideSummaryModal } from './components/RideSummaryModal';
import {
  stopRecordingNotification,
  syncRecordingNotification,
  bindRecordingNotificationActions
} from './utils/recordingForeground';
import { evaluateAutoPause, type AutoPauseState } from './utils/autoPause';
import {
  ensureRideLocationPermissions,
  openRideLocationSettings,
  waitForAppVisible
} from './utils/locationPermissions';
import { StartActivityPrompt } from './components/StartActivityPrompt';
import { RouteBuilderModal } from './components/RouteBuilderModal';
import { DownloadMapsModal } from './components/DownloadMapsModal';
import { MapsStorageModal } from './components/MapsStorageModal';

interface MonotonicSessionBuffer {
  id: string;
  distanceMeters: number;
  totalAscentMeters: number;
  ridingTime: number;
  saddleTime: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  currentElevation: number;
  currentGrade: number;
  vam: number;
  calories: number;
  breadcrumbs: BreadcrumbPoint[];
  routeName: string;
  routeId: string;
  startedAt: number;
  status: 'recording' | 'paused' | 'completed';
}

export default function App() {
  // User routes (localStorage) + optional active planned course
  const [routes, setRoutes] = useState<RouteData[]>(() => loadUserRoutes());
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const id = localStorage.getItem('magene-selected-route-id');
      if (!id) return null;
      const list = loadUserRoutes();
      return list.some(r => r.id === id) ? id : null;
    } catch {
      return null;
    }
  });
  const [isRouteBuilderOpen, setIsRouteBuilderOpen] = useState(false);
  const [freeClimbTick, setFreeClimbTick] = useState(0);
  const [fitRouteToken, setFitRouteToken] = useState(0);
  const [offlineMapAvailable, setOfflineMapAvailable] = useState<boolean | null>(null);
  const [isDownloadMapsOpen, setIsDownloadMapsOpen] = useState(false);
  const [isMapsStorageOpen, setIsMapsStorageOpen] = useState(false);
  const [basemapToken, setBasemapToken] = useState(0);

  const activeRoute = useMemo<RouteData | null>(() => {
    if (!selectedRouteId) return null;
    return routes.find(r => r.id === selectedRouteId) || null;
  }, [routes, selectedRouteId]);

  // Active Activity Session State (Persisted in localStorage)
  // Idle on load: no auto-record. Orphan session → RESUME (paused), not recording.
  const [activeSession, setActiveSession] = useState<ActiveRideSession | null>(() => loadActiveSession());
  const sessionBufferRef = useRef<MonotonicSessionBuffer | null>(null);
  if (sessionBufferRef.current === null) {
    const s = loadActiveSession();
    if (s) {
      sessionBufferRef.current = {
        id: s.id,
        distanceMeters: s.distanceMeters,
        totalAscentMeters: s.totalAscentMeters,
        ridingTime: s.ridingTime,
        saddleTime: s.saddleTime,
        maxSpeedKmh: s.maxSpeedKmh,
        avgSpeedKmh: s.avgSpeedKmh,
        currentElevation: s.currentElevation,
        currentGrade: s.currentGrade,
        vam: s.vam,
        calories: s.calories,
        breadcrumbs: s.breadcrumbs || [],
        routeName: s.routeName,
        routeId: s.routeId,
        startedAt: s.startedAt,
        status: s.status
      };
      gpsService.setTrackingSessionId(s.id);
    }
  }
  const [ridingTime, setRidingTime] = useState<number>(() => {
    const s = loadActiveSession();
    return s ? s.ridingTime : 0;
  });
  const [saddleTime, setSaddleTime] = useState<number>(() => {
    const s = loadActiveSession();
    return s ? s.saddleTime : 0;
  });

  // Production Ride State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(() => !!loadActiveSession());
  const [isAutoPaused, setIsAutoPaused] = useState<boolean>(false);
  const [timeElapsed, setTimeElapsed] = useState<number>(() => {
    const s = loadActiveSession();
    return s ? s.ridingTime : 0;
  });
  const [distanceTraveled, setDistanceTraveled] = useState<number>(() => {
    const s = loadActiveSession();
    return s ? s.distanceMeters : 0;
  });
  const [speed, setSpeed] = useState<number>(0);
  const [maxSpeed, setMaxSpeed] = useState<number>(() => {
    const s = loadActiveSession();
    return s ? s.maxSpeedKmh : 0;
  });
  const [currentElevation, setCurrentElevation] = useState<number>(() => {
    const s = loadActiveSession();
    return s ? s.currentElevation : 0;
  });

  // Lock initial elevation to active route starting elevation
  useEffect(() => {
    if (activeRoute && activeRoute.points && activeRoute.points.length > 0) {
      const startEle = activeRoute.points[0].ele;
      setCurrentElevation(Math.round(startEle));
      lastAltRef.current = startEle;
    }
  }, [selectedRouteId, activeRoute]);
  const [totalAscent, setTotalAscent] = useState<number>(() => {
    const s = loadActiveSession();
    return s ? s.totalAscentMeters : 0;
  });
  const [currentGrade, setCurrentGrade] = useState<number>(0);
  const [currentHeading, setCurrentHeading] = useState<number>(0);

  // User FTP Configuration (default: 250W)
  const [ftp, setFtp] = useState<number>(() => {
    if (typeof window === 'undefined') return 250;
    try {
      const val = localStorage.getItem('magene-user-ftp');
      return val ? parseInt(val, 10) : 250;
    } catch {
      return 250;
    }
  });

  // Heart rate zone anchors (Karvonen)
  const [maxHeartRate, setMaxHeartRate] = useState<number>(() => {
    if (typeof window === 'undefined') return 190;
    try {
      const val = localStorage.getItem('magene-user-max-hr');
      return val ? parseInt(val, 10) : 190;
    } catch {
      return 190;
    }
  });
  const [restingHeartRate, setRestingHeartRate] = useState<number>(() => {
    if (typeof window === 'undefined') return 60;
    try {
      const val = localStorage.getItem('magene-user-resting-hr');
      return val ? parseInt(val, 10) : 60;
    } catch {
      return 60;
    }
  });

  // Battery Saver — 10s GPS + disable non-essential map animations
  const [batterySaver, setBatterySaver] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('magene-battery-saver') === '1';
    } catch {
      return false;
    }
  });

  // Map Navigation Settings (Auto-Center & 180° Heading Invert)
  const [autoCenter, setAutoCenter] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      return localStorage.getItem('magene-auto-center') !== 'false';
    } catch {
      return true;
    }
  });
  const [invertHeading, setInvertHeading] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('magene-invert-heading') === 'true';
    } catch {
      return false;
    }
  });

  const persistAutoCenter = (next: boolean, beep = false) => {
    setAutoCenter(next);
    try {
      localStorage.setItem('magene-auto-center', String(next));
    } catch {
      /* ignore */
    }
    if (beep) bikeBeeper.beep(next ? 2600 : 1800, 0.05);
  };

  const handleToggleAutoCenter = () => {
    persistAutoCenter(!autoCenter, true);
  };

  const handleAutoCenterChange = (enabled: boolean) => {
    persistAutoCenter(enabled, false);
  };

  const handleToggleInvertHeading = () => {
    setInvertHeading(prev => {
      const next = !prev;
      try {
        localStorage.setItem('magene-invert-heading', String(next));
      } catch {}
      bikeBeeper.beep(next ? 2800 : 1600, 0.05);
      return next;
    });
  };

  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [slidingVam, setSlidingVam] = useState(0);
  const [stravaConnected, setStravaConnected] = useState(() => isStravaConnected());

  // GPS Coordinates & Live recorded breadcrumbs (restored from localStorage, immediately acquired from GPS)
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number }>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('magene-last-known-gps');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return { lat: 14.5995, lng: 120.9842 };
  });
  const [liveBreadcrumbs, setLiveBreadcrumbs] = useState<BreadcrumbPoint[]>(() => {
    const s = loadActiveSession();
    return s && s.breadcrumbs ? s.breadcrumbs : [];
  });

  // GPS Device Status — seed Weak from last-known so HUD is never cold Searching on reopen
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('magene-last-known-gps');
        if (saved) {
          const parsed = JSON.parse(saved) as { lat?: number; lng?: number };
          if (Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng)) {
            return { hasFix: true, accuracy: 100, quality: 'Weak' };
          }
        }
      } catch {}
    }
    return { hasFix: false, accuracy: 0, quality: 'Searching...' };
  });
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine
  );

  // Real BLE Sensors (null when not connected)
  const [heartRate, setHeartRate] = useState<number | null>(null);
  const [cadence, setCadence] = useState<number | null>(null);
  const [power, setPower] = useState<number | null>(null);

  // BLE Hardware Status
  const [bleStatus, setBleStatus] = useState<BleDeviceStatus>({
    hrmConnected: false,
    cscConnected: false,
    powerConnected: false
  });

  // Ride History
  const [rideHistory, setRideHistory] = useState<RideHistoryItem[]>(() => loadRideHistory());

  // Sound & Drawer Menu
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isMenuDrawerOpen, setIsMenuDrawerOpen] = useState<boolean>(false);
  
  // Smart Auto-Lap Settings (5000m = 5km, 10000m = 10km, 0 = Off)
  const [autoLapDistance, setAutoLapDistance] = useState<number>(() => {
    if (typeof window === 'undefined') return 5000;
    try {
      const saved = localStorage.getItem('magene-autolap-dist');
      return saved ? parseInt(saved, 10) : 5000;
    } catch {
      return 5000;
    }
  });
  const [lastLapDistance, setLastLapDistance] = useState<number>(0);
  const [lastLapTime, setLastLapTime] = useState<number>(0);
  const [lapCount, setLapCount] = useState<number>(0);
  const [latestLapAlert, setLatestLapAlert] = useState<AutoLapAlert | null>(null);

  const handleSetAutoLapDistance = (dist: number) => {
    setAutoLapDistance(dist);
    try {
      localStorage.setItem('magene-autolap-dist', dist.toString());
    } catch {}
    bikeBeeper.beep(2600, 0.06);
  };

  // Modals & Prompts
  const [isRideSummaryOpen, setIsRideSummaryOpen] = useState<boolean>(false);
  const [showStartPrompt, setShowStartPrompt] = useState<boolean>(false);
  const [isSensorModalOpen, setIsSensorModalOpen] = useState<boolean>(false);
  const [isClimbModalOpen, setIsClimbModalOpen] = useState<boolean>(false);
  const [historyMapRideId, setHistoryMapRideId] = useState<string | null>(null);
  const [historyExportNotice, setHistoryExportNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isResumePrompt, setIsResumePrompt] = useState<boolean>(false);
  const lastPromptDismissedAtRef = useRef<number>(0);
  const prevClimbInRef = useRef<boolean>(false);
  const lastAltRef = useRef<number | null>(null);
  /** Same snapped corridor + distance as MageneDevice TBT UI (for voice). */
  const navProgressRef = useRef<{
    distAlongRoute: number;
    turns: RouteTurn[];
    offRoute: boolean;
  } | null>(null);
  const selectedRouteIdRef = useRef<string | null>(selectedRouteId);
  selectedRouteIdRef.current = selectedRouteId;
  const distanceTraveledRef = useRef(distanceTraveled);
  distanceTraveledRef.current = distanceTraveled;
  const isRecordingRef = useRef(isRecording);
  isRecordingRef.current = isRecording;
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;
  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;
  const powerRef = useRef<number | null>(power);
  powerRef.current = power;
  const cadenceRef = useRef<number | null>(cadence);
  cadenceRef.current = cadence;
  const heartRateRef = useRef<number | null>(heartRate);
  heartRateRef.current = heartRate;
  const weatherRef = useRef<WeatherData | null>(weather);
  weatherRef.current = weather;
  const totalAscentRef = useRef<number>(totalAscent);
  totalAscentRef.current = totalAscent;
  const autoResumeOrStartRef = useRef<() => void>(() => {});
  const gpsSpeedRef = useRef(0);
  const bleSpeedRef = useRef<number | null>(null);
  const bleSpeedAtRef = useRef(0);
  const manualPausedRef = useRef(false);
  const rideSummaryOpenRef = useRef(false);
  const isAutoPausedRef = useRef(isAutoPaused);
  isAutoPausedRef.current = isAutoPaused;
  const autoPauseStateRef = useRef<AutoPauseState>({ lowSpeedSince: null, isAutoPaused: false });
  const applyAutoPauseRef = useRef<() => void>(() => {});
  const handleToggleStartPauseRef = useRef<() => void>(() => {});
  const handleStopActivityRef = useRef<() => void>(() => {});

  const bleCscConnectedRef = useRef(bleStatus.cscConnected);
  bleCscConnectedRef.current = bleStatus.cscConnected;

  const applyAutoPauseTick = () => {
    if (!isRecordingRef.current) return;
    if (rideSummaryOpenRef.current) return;
    const now = Date.now();
    // Stale CSC packets (stopped sensor) must not block auto-pause
    const bleFresh =
      bleCscConnectedRef.current &&
      bleSpeedRef.current != null &&
      now - bleSpeedAtRef.current < 4000
        ? bleSpeedRef.current
        : bleCscConnectedRef.current
          ? 0
          : null;
    const result = evaluateAutoPause({
      gpsKmh: gpsSpeedRef.current,
      bleKmh: bleFresh,
      manualPaused: manualPausedRef.current,
      now,
      prior: autoPauseStateRef.current
    });
    autoPauseStateRef.current = {
      lowSpeedSince: result.lowSpeedSince,
      isAutoPaused: result.isAutoPaused
    };
    if (result.changedTo === null) return;
    // Manual pause owns isPaused — never clear it from the auto-pause evaluator
    if (manualPausedRef.current) {
      setIsAutoPaused(false);
      return;
    }
    setIsAutoPaused(result.isAutoPaused);
    setIsPaused(result.isAutoPaused);
    if (result.isAutoPaused) {
      bikeBeeper.beep(1800, 0.1);
    } else {
      bikeBeeper.beep(2600, 0.1);
    }
  };
  applyAutoPauseRef.current = applyAutoPauseTick;

  // Maintain persistent event listeners for movement detection that survive long rides
  useEffect(() => {
    gpsService.setOnMovementDetected((_speedKmh) => {
      autoResumeOrStartRef.current();
    });
  }, []);

  // Notification action buttons → in-app pause / resume / stop summary
  useEffect(() => {
    bindRecordingNotificationActions({
      onPause: () => {
        if (!isRecordingRef.current || isPausedRef.current) return;
        handleToggleStartPauseRef.current();
      },
      onResume: () => {
        if (!activeSessionRef.current) return;
        if (isRecordingRef.current && !isPausedRef.current) return;
        manualPausedRef.current = false;
        handleToggleStartPauseRef.current();
      },
      onStop: () => {
        handleStopActivityRef.current();
      }
    });
  }, []);

  // Live metrics in FGS while a session exists (until Save/Discard)
  useEffect(() => {
    if (!activeSession) return;
    const paused = isPaused || isAutoPaused;
    const status = !gpsStatus.hasFix
      ? 'GPS lost'
      : isAutoPaused
        ? 'Auto-paused'
        : paused
          ? 'Paused'
          : 'Recording';
    void syncRecordingNotification({
      status,
      distanceKm: distanceTraveled / 1000,
      gainM: totalAscent,
      ridingSeconds: ridingTime || timeElapsed,
      paused,
      breadcrumbs: liveBreadcrumbs,
      headingDeg: currentHeading
    });
  }, [
    activeSession?.id,
    isPaused,
    isAutoPaused,
    distanceTraveled,
    totalAscent,
    ridingTime,
    timeElapsed,
    gpsStatus.hasFix,
    liveBreadcrumbs,
    currentHeading
  ]);

  // Sound sync (beeps + voice)
  useEffect(() => {
    bikeBeeper.enabled = soundEnabled;
    rideNarrator.enabled = soundEnabled;
  }, [soundEnabled]);

  // Persist FTP
  const handleSaveFtp = (newFtp: number) => {
    const safe = Math.max(80, Math.min(600, newFtp));
    setFtp(safe);
    try {
      localStorage.setItem('magene-user-ftp', safe.toString());
    } catch {}
  };

  const handleSaveMaxHr = (v: number) => {
    const safe = Math.max(120, Math.min(230, v));
    setMaxHeartRate(safe);
    try {
      localStorage.setItem('magene-user-max-hr', safe.toString());
    } catch {}
  };

  const handleSaveRestingHr = (v: number) => {
    const safe = Math.max(30, Math.min(100, v));
    setRestingHeartRate(safe);
    try {
      localStorage.setItem('magene-user-resting-hr', safe.toString());
    } catch {}
  };

  const handleToggleBatterySaver = () => {
    setBatterySaver(prev => {
      const next = !prev;
      try {
        localStorage.setItem('magene-battery-saver', next ? '1' : '0');
      } catch {}
      return next;
    });
  };

  const fetchWeather = async (lat: number, lng: number) => {
    if (!lat || !lng) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setWeather(null);
      setWeatherLoading(false);
      return;
    }
    setWeatherLoading(true);
    try {
      const data = await fetchLiveWeather(lat, lng);
      setWeather(data);
    } catch {
      setWeather(null);
    } finally {
      setWeatherLoading(false);
    }
  };

  // Capture Strava OAuth redirect tokens
  useEffect(() => {
    if (captureStravaRedirectTokens()) {
      setStravaConnected(true);
    } else {
      setStravaConnected(isStravaConnected());
    }
  }, []);

  // Weather poll every 15 minutes from live GPS coords (online only)
  useEffect(() => {
    if (!isOnline || !currentCoords.lat || !currentCoords.lng) return;
    fetchWeather(currentCoords.lat, currentCoords.lng);
    const interval = setInterval(() => {
      fetchWeather(currentCoords.lat, currentCoords.lng);
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [currentCoords.lat, currentCoords.lng, isOnline]);

  // Merge IndexedDB routes + reconcile map_packs localStorage flag → probe basemap
  useEffect(() => {
    void loadUserRoutesAsync().then(list => {
      if (list.length) setRoutes(list);
    });
    void (async () => {
      const hasPacks = await reconcileMapPacksInstalledFlag();
      setOfflineMapAvailable(hasPacks || isMapPacksInstalledFlag());
      // Re-attach basemap after flag reconcile (covers refresh / already-installed OPFS)
      if (hasPacks || isMapPacksInstalledFlag()) {
        setBasemapToken(t => t + 1);
      }
      void probeOfflineMapAvailable(true).then(setOfflineMapAvailable);
    })();
  }, []);

  // Subscribe to BLE + ANT+ hardware streams (exclusive per role in sensor modal)
  useEffect(() => {
    const applySensorData = (data: {
      heartRate?: number;
      cadence?: number;
      speed?: number;
      power?: number;
    }) => {
      if (data.heartRate !== undefined) setHeartRate(data.heartRate);
      if (data.cadence !== undefined) setCadence(data.cadence);
      if (data.speed !== undefined) {
        setSpeed(data.speed);
        bleSpeedRef.current = data.speed;
        bleSpeedAtRef.current = Date.now();
        applyAutoPauseRef.current();
      }
      if (data.power !== undefined) setPower(data.power);
    };
    const unsubBle = bleManager.subscribe(applySensorData);
    const unsubAnt = antManager.subscribe(applySensorData);
    const unsubAntConn = antManager.subscribeConnection(info => {
      setBleStatus(prev => {
        if (info.profile === 'hrm') {
          return {
            ...prev,
            hrmConnected: info.connected,
            hrmDeviceName: info.connected ? info.deviceName || prev.hrmDeviceName : undefined,
            hrmProtocol: info.connected ? 'ant' : null
          };
        }
        if (info.profile === 'csc') {
          return {
            ...prev,
            cscConnected: info.connected,
            cscDeviceName: info.connected ? info.deviceName || prev.cscDeviceName : undefined,
            cscProtocol: info.connected ? 'ant' : null
          };
        }
        return {
          ...prev,
          powerConnected: info.connected,
          powerDeviceName: info.connected ? info.deviceName || prev.powerDeviceName : undefined,
          powerProtocol: info.connected ? 'ant' : null
        };
      });
    });
    return () => {
      unsubBle();
      unsubAnt();
      unsubAntConn();
    };
  }, []);

  // Fast warm-start: network/A-GPS cache (precise upgrade comes from gpsService watch)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, altitude, accuracy, heading } = pos.coords;
        const coords = { lat: latitude, lng: longitude };
        setCurrentCoords(coords);
        try {
          localStorage.setItem('magene-last-known-gps', JSON.stringify(coords));
        } catch {}
        if (altitude && altitude > 0) {
          const msl = correctEllipsoidalAltitude(latitude, longitude, altitude);
          if (msl > 0) setCurrentElevation(Math.round(msl));
        }
        void fetchDemElevation(latitude, longitude).then(demEle => {
          if (demEle !== null && !selectedRouteIdRef.current) {
            setCurrentElevation(Math.round(demEle));
            if (lastAltRef.current === null) lastAltRef.current = demEle;
          }
        });
        if (heading != null && !isNaN(heading)) setCurrentHeading(heading);
        const acc = accuracy || 999;
        setGpsStatus(prev => {
          // Do not downgrade an already-better watch fix
          const rank = (q: string) =>
            q === 'GPS 3D' ? 3 : q === 'GPS 2D' ? 2 : q === 'Weak' ? 1 : 0;
          const nextQ = accuracyToQuality(acc);
          if (rank(nextQ) < rank(prev.quality)) return prev;
          return {
            hasFix: true,
            accuracy: acc,
            quality: nextQ
          };
        });
      },
      (err) => {
        console.warn('Fast geolocation:', err.message);
        // Keep last-known Weak if we already seeded it — do not force Searching
        setGpsStatus(prev => (prev.hasFix || prev.quality === 'Weak' ? prev : { ...prev, quality: 'Searching...' }));
      },
      FAST_GEO_OPTIONS
    );
  }, []);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Real Production GPS Tracker with Auto-Pause (<3 km/h for >3s) and Auto-Resume
  useEffect(() => {
    // Only show Searching on cold start — do not wipe Weak/2D/3D when tracker restarts
    setGpsStatus(prev => {
      if (prev.hasFix || prev.quality === 'Weak' || prev.quality === 'GPS 2D' || prev.quality === 'GPS 3D') {
        return prev;
      }
      return { ...prev, quality: 'Searching...' };
    });

    const success = gpsService.startTracking(
      (fix: GpsFix, deltaDist: number, instantGrade: number) => {
        const quality = fix.quality || accuracyToQuality(fix.accuracy);
        setGpsStatus(prev => {
          const rank = (q: string) =>
            q === 'GPS 3D' ? 3 : q === 'GPS 2D' ? 2 : q === 'Weak' ? 1 : 0;
          // displayOnly / worse accuracy must not knock a good lock back to Searching/Weak flash
          if (fix.displayOnly && rank(quality) < rank(prev.quality)) {
            return { ...prev, hasFix: true, accuracy: Math.min(prev.accuracy || fix.accuracy, fix.accuracy) };
          }
          return {
            hasFix: !fix.displayOnly || fix.accuracy < 200,
            accuracy: fix.accuracy,
            quality
          };
        });

        setCurrentCoords({ lat: fix.lat, lng: fix.lng });
        try {
          localStorage.setItem('magene-last-known-gps', JSON.stringify({ lat: fix.lat, lng: fix.lng }));
        } catch {}

        gpsSpeedRef.current = fix.speedKmh;
        applyAutoPauseRef.current();

        // Weak / display-only: puck + HUD; thinned trail (no distance) for continuity
        if (fix.displayOnly) {
          if (fix.heading) setCurrentHeading(fix.heading);
          if (!bleCscConnectedRef.current) {
            setSpeed(fix.speedKmh);
            if (isRecordingRef.current && !isPausedRef.current && fix.speedKmh > 0) {
              setMaxSpeed(prev => Math.max(prev, fix.speedKmh));
            }
          }
          if (fix.altitude > 0) {
            let ele = fix.altitude;
            if (activeRoute && activeRoute.points?.length) {
              const rEle = getRouteElevation(activeRoute.points, distanceTraveledRef.current, { lat: fix.lat, lng: fix.lng });
              if (rEle !== null) ele = rEle;
            }
            setCurrentElevation(Math.round(ele));
          } else if (!selectedRouteIdRef.current && fix.lat && fix.lng) {
            // 2D GPS: allow DEM for HUD even on weak fixes / while recording
            void fetchDemElevation(fix.lat, fix.lng).then(demEle => {
              if (demEle !== null && !selectedRouteIdRef.current) {
                setCurrentElevation(Math.round(demEle));
              }
            });
          }

          const curSessionId = activeSessionRef.current?.id;
          const trackingSessionId = gpsService.getTrackingSessionId();
          const isSessionValid = Boolean(curSessionId && trackingSessionId === curSessionId);
          if (isRecordingRef.current && !isPausedRef.current && isSessionValid) {
            const buf = sessionBufferRef.current;
            const last =
              buf && buf.id === curSessionId
                ? buf.breadcrumbs[buf.breadcrumbs.length - 1] || null
                : null;
            const weakFix = { lat: fix.lat, lng: fix.lng, time: Date.now() };
            if (shouldAppendWeakBreadcrumb(last, weakFix)) {
              const weakCrumb: BreadcrumbPoint = {
                lat: fix.lat,
                lng: fix.lng,
                ele: fix.altitude > 0 ? fix.altitude : undefined,
                time: weakFix.time,
                speed: fix.speedKmh,
                distance: distanceTraveledRef.current,
                quality: 'weak'
              };
              if (sessionBufferRef.current && sessionBufferRef.current.id === curSessionId) {
                sessionBufferRef.current.breadcrumbs.push(weakCrumb);
                setLiveBreadcrumbs(sessionBufferRef.current.breadcrumbs.slice());
              } else {
                setLiveBreadcrumbs(prev => [...prev, weakCrumb]);
              }
            }
          }
          return;
        }

        setCurrentHeading(fix.heading);
        setSlidingVam(fix.vam ?? gpsService.getSlidingVam());

        if (!bleCscConnectedRef.current) {
          setSpeed(fix.speedKmh);
          if (isRecordingRef.current && !isPausedRef.current) {
            setMaxSpeed(prev => Math.max(prev, fix.speedKmh));
          }
        }

        // Auto-resume orphan / auto-paused only (manual pause blocked in handler)
        const isNotActive = !isRecordingRef.current || isPausedRef.current;
        if (isNotActive && fix.speedKmh >= 3.0) {
          autoResumeOrStartRef.current();
        }

        // Verify activity session identification against current tracking state
        const curSessionId = activeSessionRef.current?.id;
        const trackingSessionId = gpsService.getTrackingSessionId();
        const isSessionValid = Boolean(curSessionId && trackingSessionId === curSessionId);

        // Record live path breadcrumb if recording, moving, and session is valid
        let nextDist = distanceTraveledRef.current;
        if (isRecordingRef.current && !isPausedRef.current && deltaDist > 0 && isSessionValid) {
          nextDist = distanceTraveledRef.current + deltaDist;
          distanceTraveledRef.current = nextDist;
          const now = Date.now();
          const buf = sessionBufferRef.current;
          const last =
            buf && buf.id === curSessionId
              ? buf.breadcrumbs[buf.breadcrumbs.length - 1] || null
              : null;
          const pushCrumb = (crumb: BreadcrumbPoint) => {
            if (sessionBufferRef.current && sessionBufferRef.current.id === curSessionId) {
              sessionBufferRef.current.distanceMeters = Math.max(sessionBufferRef.current.distanceMeters, nextDist);
              sessionBufferRef.current.breadcrumbs.push(crumb);
              sessionBufferRef.current.maxSpeedKmh = Math.max(sessionBufferRef.current.maxSpeedKmh, fix.speedKmh);
              setLiveBreadcrumbs(sessionBufferRef.current.breadcrumbs.slice());
            } else {
              setLiveBreadcrumbs(prev => [...prev, crumb]);
            }
          };
          const stitch = shouldStitchBreadcrumb(last, { lat: fix.lat, lng: fix.lng, time: now });
          const newBreadcrumb: BreadcrumbPoint = {
            lat: fix.lat,
            lng: fix.lng,
            ele: fix.altitude > 0 ? fix.altitude : undefined,
            time: now,
            speed: fix.speedKmh,
            power: powerRef.current ?? undefined,
            cadence: cadenceRef.current ?? undefined,
            heartRate: heartRateRef.current ?? undefined,
            distance: nextDist,
            temperature: weatherRef.current?.tempC,
            quality: stitch ? 'stitch' : 'good'
          };
          pushCrumb(newBreadcrumb);
          setDistanceTraveled(nextDist);
        }

        // Elevation and smoothed grade
        let nextEle = fix.altitude;
        if (activeRoute && activeRoute.points?.length) {
          const routeEle = getRouteElevation(activeRoute.points, distanceTraveledRef.current, { lat: fix.lat, lng: fix.lng });
          if (routeEle !== null) {
            nextEle = routeEle;
          }
        } else if (fix.lat && fix.lng && nextEle <= 0) {
          // Free ride with 2D GPS: DEM for HUD + ascent while recording (prefer GPS/route when valid).
          void fetchDemElevation(fix.lat, fix.lng).then(demEle => {
            if (demEle === null || selectedRouteIdRef.current) return;
            const roundedDem = Math.round(demEle);
            setCurrentElevation(roundedDem);
            const sid = activeSessionRef.current?.id;
            if (sessionBufferRef.current && sid && sessionBufferRef.current.id === sid) {
              sessionBufferRef.current.currentElevation = roundedDem;
            }
            if (isRecordingRef.current && !isPausedRef.current && sid && gpsService.getTrackingSessionId() === sid) {
              if (lastAltRef.current !== null && roundedDem > lastAltRef.current) {
                const diff = roundedDem - lastAltRef.current;
                if (diff >= 1) {
                  setTotalAscent(prev => {
                    const nextTotal = prev + diff;
                    totalAscentRef.current = nextTotal;
                    if (sessionBufferRef.current && sessionBufferRef.current.id === sid) {
                      sessionBufferRef.current.totalAscentMeters = Math.max(
                        sessionBufferRef.current.totalAscentMeters,
                        nextTotal
                      );
                    }
                    return nextTotal;
                  });
                }
              }
              lastAltRef.current = roundedDem;
            } else {
              lastAltRef.current = roundedDem;
            }
          });
        }

        if (nextEle > 0) {
          const roundedEle = Math.round(nextEle);
          setCurrentElevation(roundedEle);
          if (sessionBufferRef.current && curSessionId && sessionBufferRef.current.id === curSessionId) {
            sessionBufferRef.current.currentElevation = roundedEle;
          }
          if (isRecordingRef.current && !isPausedRef.current && isSessionValid) {
            if (lastAltRef.current !== null && roundedEle > lastAltRef.current) {
              const diff = roundedEle - lastAltRef.current;
              if (diff >= 1) {
                setTotalAscent(prev => {
                  const nextTotal = prev + diff;
                  totalAscentRef.current = nextTotal;
                  if (sessionBufferRef.current && sessionBufferRef.current.id === curSessionId) {
                    sessionBufferRef.current.totalAscentMeters = Math.max(sessionBufferRef.current.totalAscentMeters, nextTotal);
                  }
                  return nextTotal;
                });
              }
            }
            lastAltRef.current = roundedEle;
          } else {
            lastAltRef.current = roundedEle;
          }
        }

        setCurrentGrade(instantGrade);
        if (sessionBufferRef.current && curSessionId && sessionBufferRef.current.id === curSessionId) {
          sessionBufferRef.current.currentGrade = instantGrade;
          sessionBufferRef.current.vam = fix.vam ?? gpsService.getSlidingVam();
        }

        // Free Ride ClimbPro recording (no planned route)
        if (isRecordingRef.current && !isPausedRef.current && !selectedRouteIdRef.current && deltaDist > 0 && isSessionValid) {
          freeRideClimbRecorder.pushSample(
            fix.lat,
            fix.lng,
            fix.altitude > 0 ? fix.altitude : (lastAltRef.current ?? 0),
            nextDist,
            instantGrade
          );
          setFreeClimbTick(t => t + 1);
        }
      },
      (err: string) => {
        setGpsStatus({
          hasFix: false,
          accuracy: 0,
          quality: 'Error',
          errorMessage: err
        });
      },
      undefined,
      { batterySaver }
    );

    if (!success) {
      setGpsStatus({
        hasFix: false,
        accuracy: 0,
        quality: 'Standby'
      });
    }

    return () => {
      gpsService.stopTracking(false, false);
    };
    // CSC connect must not restart the Capacitor watch (leak / double distance).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bleStatus.cscConnected read via closure for HUD speed only
  }, [batterySaver]);

  // Prompt rider on initial GPS fix if no activity is running
  useEffect(() => {
    if (!isRecording && !activeSession && gpsStatus.hasFix) {
      const now = Date.now();
      if (now - lastPromptDismissedAtRef.current > 45000) {
        const timer = setTimeout(() => {
          if (!isRecordingRef.current && !activeSessionRef.current) {
            setIsResumePrompt(false);
            setShowStartPrompt(true);
          }
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [gpsStatus.hasFix, isRecording, activeSession]);

  // Dual Timers: Saddle Time ticks always while recording; Riding Time ticks only when moving
  useEffect(() => {
    if (!isRecording) return;

    const timer = setInterval(() => {
      setSaddleTime(prev => {
        const next = prev + 1;
        if (sessionBufferRef.current && sessionBufferRef.current.id === activeSessionRef.current?.id) {
          sessionBufferRef.current.saddleTime = Math.max(sessionBufferRef.current.saddleTime, next);
        }
        return next;
      });

      if (!isPaused) {
        setRidingTime(prev => {
          const next = prev + 1;
          if (sessionBufferRef.current && sessionBufferRef.current.id === activeSessionRef.current?.id) {
            sessionBufferRef.current.ridingTime = Math.max(sessionBufferRef.current.ridingTime, next);
            if (next > 0) {
              const curDist = sessionBufferRef.current.distanceMeters;
              sessionBufferRef.current.avgSpeedKmh = Math.round(((curDist / 1000) / (next / 3600)) * 10) / 10;
              sessionBufferRef.current.calories = Math.round(next * 0.2);
            }
          }
          return next;
        });
        setTimeElapsed(prev => prev + 1);
      }
      applyAutoPauseRef.current();
    }, 1000);

    return () => clearInterval(timer);
  }, [isRecording, isPaused]);

  // Smart Auto-Lap Trigger Monitor (every 5km or 10km when enabled)
  useEffect(() => {
    if (!isRecording || autoLapDistance <= 0) return;

    const distSinceLastLap = distanceTraveled - lastLapDistance;
    if (distSinceLastLap >= autoLapDistance) {
      const nextLapNum = lapCount + 1;
      const curMovingTime = ridingTime || timeElapsed;
      const splitSecs = Math.max(1, curMovingTime - lastLapTime);
      const splitSpeedKmh = Math.round(((autoLapDistance / 1000) / (splitSecs / 3600)) * 10) / 10;

      const alert: AutoLapAlert = {
        lapNumber: nextLapNum,
        lapDistanceMeters: autoLapDistance,
        splitTimeSeconds: splitSecs,
        avgSpeedKmh: splitSpeedKmh,
        timestamp: Date.now()
      };

      setLatestLapAlert(alert);
      setLapCount(nextLapNum);
      setLastLapDistance(distanceTraveled);
      setLastLapTime(curMovingTime);

      // Audio & Haptic alert on the ImageneCycle display
      bikeBeeper.lapChime();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([120, 80, 120]);
      }
    }
  }, [distanceTraveled, isRecording, autoLapDistance, lastLapDistance, lapCount, lastLapTime, ridingTime, timeElapsed]);

  // Dedicated Auto-Lap notification auto-dismiss timer (6 seconds, cleanly isolated)
  useEffect(() => {
    if (!latestLapAlert) return;
    const timer = setTimeout(() => {
      setLatestLapAlert(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [latestLapAlert]);

  // Continuous Auto-Save to LocalStorage every 5 seconds using monotonic ref buffer
  // Note: Dependency array depends strictly on activeSession ID and run state, avoiding teardown/reset on GPS fixes
  useEffect(() => {
    if (!activeSession?.id || !isRecording) return;

    const interval = setInterval(() => {
      const buf = sessionBufferRef.current;
      const targetSessionId = activeSession.id;
      if (!buf || buf.id !== targetSessionId) return;

      const updated: ActiveRideSession = {
        id: buf.id,
        startedAt: buf.startedAt,
        updatedAt: Date.now(),
        status: isPaused ? 'paused' : 'recording',
        routeName: buf.routeName,
        routeId: buf.routeId,
        ridingTime: buf.ridingTime,
        saddleTime: buf.saddleTime,
        distanceMeters: buf.distanceMeters,
        totalAscentMeters: buf.totalAscentMeters,
        maxSpeedKmh: buf.maxSpeedKmh,
        avgSpeedKmh: buf.avgSpeedKmh,
        currentElevation: buf.currentElevation,
        currentGrade: buf.currentGrade,
        vam: buf.vam,
        calories: buf.calories,
        breadcrumbs: buf.breadcrumbs
      };
      saveActiveSession(updated);
    }, 5000);

    return () => clearInterval(interval);
  }, [activeSession?.id, isRecording, isPaused]);

  // Derived effective elevation: accurately locked to active route profile when navigating course, else calibrated GPS/DEM
  const effectiveElevation = useMemo<number>(() => {
    if (activeRoute && activeRoute.points && activeRoute.points.length > 0) {
      const routeEle = getRouteElevation(activeRoute.points, distanceTraveled, currentCoords);
      if (routeEle !== null) return Math.round(routeEle);
    }
    return Math.round(currentElevation);
  }, [activeRoute, distanceTraveled, currentCoords, currentElevation]);

  // Current RoutePoint: ALWAYS reflects the rider's true live GPS coordinates and effective elevation
  const currentPoint = useMemo<RoutePoint>(() => {
    return {
      lat: currentCoords.lat,
      lng: currentCoords.lng,
      ele: effectiveElevation,
      distFromStart: distanceTraveled,
      grade: currentGrade,
      heading: currentHeading
    };
  }, [currentCoords, effectiveElevation, distanceTraveled, currentGrade, currentHeading]);

  // ClimbPro Live Calculation (planned route vs free-ride recorder)
  const climbState = useMemo(() => {
    if (activeRoute) {
      return calculateClimbProLiveState(
        distanceTraveled,
        activeRoute.climbs,
        effectiveElevation,
        currentGrade
      );
    }
    return freeRideClimbRecorder.toClimbProState(effectiveElevation, currentGrade);
  }, [distanceTraveled, activeRoute, effectiveElevation, currentGrade, freeClimbTick]);

  // Chimes
  useEffect(() => {
    if (climbState.isInClimb && !prevClimbInRef.current) {
      bikeBeeper.climbAlert();
    } else if (!climbState.isInClimb && prevClimbInRef.current) {
      bikeBeeper.summitChime();
    }
    prevClimbInRef.current = climbState.isInClimb;
  }, [climbState.isInClimb]);

  const handleNavProgress = useCallback(
    (nav: { distAlongRoute: number; turns: RouteTurn[]; offRoute: boolean } | null) => {
      navProgressRef.current = nav;
    },
    []
  );

  // Voice: upcoming climb + turn-by-turn — use snapped nav distance/turns (same as TBT UI)
  useEffect(() => {
    if (!isRecording || isPaused || !activeRoute) return;
    const next = climbState.nextClimb || climbState.currentClimb;
    if (next) {
      rideNarrator.tickClimb({
        climbKey: next.id || String(next.startDist),
        category: next.category,
        distToNextClimb: climbState.distToNextClimb,
        isInClimb: climbState.isInClimb
      });
    }
    const nav = navProgressRef.current;
    const turns = nav?.turns?.length ? nav.turns : activeRoute.turns;
    const along =
      nav != null && !nav.offRoute ? nav.distAlongRoute : distanceTraveled;
    const cue = getNextTurn(turns, along);
    rideNarrator.tickTurn(cue);
  }, [
    isRecording,
    isPaused,
    activeRoute,
    climbState.nextClimb,
    climbState.currentClimb,
    climbState.distToNextClimb,
    climbState.isInClimb,
    distanceTraveled,
    currentCoords.lat,
    currentCoords.lng
  ]);

  // Real-Time Power & HR Zone Calculation
  const powerZoneInfo = useMemo(() => {
    return getPowerZoneInfo(power, ftp);
  }, [power, ftp]);

  const hrZoneInfo = useMemo(() => {
    return getHeartRateZoneInfo(heartRate, maxHeartRate, restingHeartRate);
  }, [heartRate, maxHeartRate, restingHeartRate]);

  // Compiled metrics
  const metrics: RideMetrics = useMemo(() => {
    const totalDistKm = distanceTraveled / 1000;
    const movingSecs = ridingTime || timeElapsed;
    const movingHours = movingSecs / 3600;
    const avgSpeed = movingHours > 0 ? totalDistKm / movingHours : speed;

    return {
      timeElapsed: movingSecs,
      ridingTime: movingSecs,
      saddleTime: saddleTime || movingSecs,
      distanceTraveled,
      speed,
      avgSpeed: Math.round(avgSpeed * 10) / 10,
      maxSpeed: Math.round(maxSpeed * 10) / 10,
      currentElevation: effectiveElevation,
      totalAscent: Math.round(totalAscent),
      currentGrade,
      heartRate,
      cadence,
      power,
      powerZone: powerZoneInfo?.zone || null,
      powerZoneName: powerZoneInfo?.name || null,
      powerZoneColor: powerZoneInfo?.color || null,
      ftp,
      hrZone: hrZoneInfo?.zone || null,
      hrZoneName: hrZoneInfo?.name || null,
      hrZoneColor: hrZoneInfo?.color || null,
      maxHeartRate,
      restingHeartRate,
      isAutoPaused,
      calories: Math.round(movingSecs * 0.2),
      vam: slidingVam,
      currentLat: currentCoords.lat,
      currentLng: currentCoords.lng,
      currentHeading,
      activeSessionId: activeSession?.id || null
    };
  }, [ridingTime, saddleTime, timeElapsed, distanceTraveled, speed, maxSpeed, currentElevation, totalAscent, currentGrade, heartRate, cadence, power, powerZoneInfo, hrZoneInfo, ftp, maxHeartRate, restingHeartRate, isAutoPaused, currentCoords, currentHeading, activeSession, slidingVam]);

  // Start New Activity Session
  const handleStartNewActivity = (customRouteName?: string) => {
    void (async () => {
      let perm = await ensureRideLocationPermissions();
      if (!perm.ok && perm.needSettings) {
        const go = window.confirm(
          'Location is still not “Allow all the time”. Open Location settings to enable it?'
        );
        if (go) {
          await openRideLocationSettings();
          await waitForAppVisible();
          perm = await ensureRideLocationPermissions({ skipBackgroundRationale: true });
        }
      }
      if (!perm.ok) return;
      beginNewActivitySession(customRouteName);
    })();
  };

  const beginNewActivitySession = (customRouteName?: string) => {
    manualPausedRef.current = false;
    autoPauseStateRef.current = { lowSpeedSince: null, isAutoPaused: false };
    rideNarrator.reset();
    const newSession: ActiveRideSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      status: 'recording',
      routeName: customRouteName || activeRoute?.name || 'Free Ride (Live GPS)',
      routeId: activeRoute?.id || 'free-ride',
      ridingTime: 0,
      saddleTime: 0,
      distanceMeters: 0,
      totalAscentMeters: 0,
      maxSpeedKmh: 0,
      avgSpeedKmh: 0,
      currentElevation,
      currentGrade: 0,
      vam: 0,
      calories: 0,
      breadcrumbs: []
    };

    // Initialize monotonic buffer and GPS tracking session identification
    sessionBufferRef.current = {
      id: newSession.id,
      distanceMeters: 0,
      totalAscentMeters: 0,
      ridingTime: 0,
      saddleTime: 0,
      maxSpeedKmh: 0,
      avgSpeedKmh: 0,
      currentElevation,
      currentGrade: 0,
      vam: 0,
      calories: 0,
      breadcrumbs: [],
      routeName: newSession.routeName,
      routeId: newSession.routeId,
      startedAt: newSession.startedAt,
      status: 'recording'
    };
    gpsService.setTrackingSessionId(newSession.id);

    saveActiveSession(newSession);
    setActiveSession(newSession);
    setIsRecording(true);
    setIsPaused(false);
    setIsAutoPaused(false);
    setRidingTime(0);
    setSaddleTime(0);
    setTimeElapsed(0);
    setDistanceTraveled(0);
    setTotalAscent(0);
    setMaxSpeed(0);
    setLiveBreadcrumbs([]);
    setLastLapDistance(0);
    setLastLapTime(0);
    setLapCount(0);
    setLatestLapAlert(null);
    setShowStartPrompt(false);
    freeRideClimbRecorder.reset();
    setFreeClimbTick(t => t + 1);
    bikeBeeper.beep(2600, 0.12);
  };

  // Auto-resume only — never create a session; rider must tap START RIDE
  const handleAutoResumeOrStart = () => {
    if (isRecordingRef.current && !isPausedRef.current) {
      return;
    }
    if (rideSummaryOpenRef.current) return;
    // Manual pause: do not force-resume on GPS movement
    if (isPausedRef.current && manualPausedRef.current && !isAutoPausedRef.current) {
      return;
    }
    if (activeSessionRef.current || isPausedRef.current) {
      manualPausedRef.current = false;
      autoPauseStateRef.current = { lowSpeedSince: null, isAutoPaused: false };
      setIsRecording(true);
      setIsPaused(false);
      setIsAutoPaused(false);
      setShowStartPrompt(false);
      if (activeSessionRef.current) {
        gpsService.setTrackingSessionId(activeSessionRef.current.id);
        if (sessionBufferRef.current) {
          sessionBufferRef.current.status = 'recording';
        }
        const resumed: ActiveRideSession = {
          ...activeSessionRef.current,
          status: 'recording',
          updatedAt: Date.now()
        };
        setActiveSession(resumed);
        saveActiveSession(resumed);
      }
      bikeBeeper.beep(2600, 0.08);
    }
  };
  autoResumeOrStartRef.current = handleAutoResumeOrStart;

  // Actions
  const handleToggleStartPause = () => {
    // Idle → create session and record
    if (!activeSession) {
      handleStartNewActivity();
      return;
    }

    // Orphan / paused session → resume recording
    if (!isRecording || isPaused) {
      manualPausedRef.current = false;
      autoPauseStateRef.current = { lowSpeedSince: null, isAutoPaused: false };
      setIsRecording(true);
      setIsPaused(false);
      setIsAutoPaused(false);
      gpsService.setTrackingSessionId(activeSession.id);
      if (sessionBufferRef.current) {
        sessionBufferRef.current.status = 'recording';
      }
      const resumed = {
        ...activeSession,
        status: 'recording' as const,
        updatedAt: Date.now()
      };
      setActiveSession(resumed);
      saveActiveSession(resumed);
      bikeBeeper.beep(2600, 0.08);
      return;
    }

    // Recording → manual pause
    manualPausedRef.current = true;
    setIsPaused(true);
    setIsAutoPaused(false);
    autoPauseStateRef.current = { lowSpeedSince: null, isAutoPaused: false };
    if (sessionBufferRef.current) {
      sessionBufferRef.current.status = 'paused';
    }
    bikeBeeper.beep(1800, 0.08);
    const paused = {
      ...activeSession,
      status: 'paused' as const,
      updatedAt: Date.now()
    };
    setActiveSession(paused);
    saveActiveSession(paused);
  };
  handleToggleStartPauseRef.current = handleToggleStartPause;

  const handleLap = () => {
    const nextLapNum = lapCount + 1;
    const curMovingTime = ridingTime || timeElapsed;
    const splitDist = Math.max(10, distanceTraveled - lastLapDistance);
    const splitSecs = Math.max(1, curMovingTime - lastLapTime);
    const splitSpeedKmh = Math.round(((splitDist / 1000) / (splitSecs / 3600)) * 10) / 10;

    const alert: AutoLapAlert = {
      lapNumber: nextLapNum,
      lapDistanceMeters: splitDist,
      splitTimeSeconds: splitSecs,
      avgSpeedKmh: splitSpeedKmh,
      timestamp: Date.now()
    };

    setLatestLapAlert(alert);
    setLapCount(nextLapNum);
    setLastLapDistance(distanceTraveled);
    setLastLapTime(curMovingTime);

    bikeBeeper.lapChime();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([120, 80, 120]);
    }
  };

  // Stop / Finish Activity - Prompts RideSummaryModal with Save, Resume, and Discard
  const handleStopActivity = () => {
    manualPausedRef.current = true;
    rideSummaryOpenRef.current = true;
    setIsPaused(true);
    setIsAutoPaused(false);
    autoPauseStateRef.current = { lowSpeedSince: null, isAutoPaused: false };
    setIsRideSummaryOpen(true);
    bikeBeeper.beep(1800, 0.1);
  };
  handleStopActivityRef.current = handleStopActivity;

  const handleSaveActivity = (customTitle?: string) => {
    const finalMoving = ridingTime || timeElapsed;
    const finalSaddle = saddleTime || timeElapsed;

    saveRideToHistory({
      routeName: customTitle || activeSession?.routeName || activeRoute?.name || 'Free Ride (Live GPS)',
      startedAt: activeSession?.startedAt,
      timeElapsed: finalMoving,
      ridingTimeSeconds: finalMoving,
      saddleTimeSeconds: finalSaddle,
      distanceMeters: distanceTraveled,
      totalAscentMeters: totalAscent,
      avgSpeedKmh: metrics.avgSpeed,
      maxSpeedKmh: metrics.maxSpeed,
      calories: metrics.calories,
      avgPowerWatts: power,
      avgCadenceRpm: metrics.cadence,
      avgHeartRateBpm: metrics.heartRate,
      breadcrumbs: liveBreadcrumbs
    });

    clearActiveSession();
    setActiveSession(null);
    gpsService.setTrackingSessionId(null);
    sessionBufferRef.current = null;
    setIsRecording(false);
    setIsPaused(false);
    setIsAutoPaused(false);
    manualPausedRef.current = false;
    autoPauseStateRef.current = { lowSpeedSince: null, isAutoPaused: false };
    setRidingTime(0);
    setSaddleTime(0);
    setTimeElapsed(0);
    setDistanceTraveled(0);
    setTotalAscent(0);
    setMaxSpeed(0);
    setLiveBreadcrumbs([]);
    setLastLapDistance(0);
    setLastLapTime(0);
    setLapCount(0);
    setLatestLapAlert(null);
    setRideHistory(loadRideHistory());
    rideSummaryOpenRef.current = false;
    setIsRideSummaryOpen(false);
    void stopRecordingNotification();
    bikeBeeper.beep(2600, 0.15);
  };

  const handleResumeFromSummary = () => {
    rideSummaryOpenRef.current = false;
    setIsRideSummaryOpen(false);
    setIsPaused(false);
    setIsAutoPaused(false);
    manualPausedRef.current = false;
    autoPauseStateRef.current = { lowSpeedSince: null, isAutoPaused: false };
    if (activeSession) {
      gpsService.setTrackingSessionId(activeSession.id);
      if (sessionBufferRef.current) {
        sessionBufferRef.current.status = 'recording';
      }
    }
    bikeBeeper.beep(2600, 0.08);
  };

  const handleDiscardActivity = () => {
    clearActiveSession();
    setActiveSession(null);
    gpsService.setTrackingSessionId(null);
    sessionBufferRef.current = null;
    setIsRecording(false);
    setIsPaused(false);
    setIsAutoPaused(false);
    manualPausedRef.current = false;
    autoPauseStateRef.current = { lowSpeedSince: null, isAutoPaused: false };
    void stopRecordingNotification();
    setRidingTime(0);
    setSaddleTime(0);
    setTimeElapsed(0);
    setDistanceTraveled(0);
    setTotalAscent(0);
    setMaxSpeed(0);
    setLiveBreadcrumbs([]);
    setLastLapDistance(0);
    setLastLapTime(0);
    setLapCount(0);
    setLatestLapAlert(null);
    rideSummaryOpenRef.current = false;
    setIsRideSummaryOpen(false);
    freeRideClimbRecorder.reset();
    setFreeClimbTick(t => t + 1);
  };

  // Reset Ride with LocalStorage History Persistence
  const handleResetRide = () => {
    if (isRecording || activeSession || distanceTraveled > 20 || timeElapsed > 5) {
      handleStopActivity();
      return;
    }
    setTimeElapsed(0);
    setRidingTime(0);
    setSaddleTime(0);
    setDistanceTraveled(0);
    setTotalAscent(0);
    setLiveBreadcrumbs([]);
    setLastLapDistance(0);
    setLastLapTime(0);
    setLapCount(0);
    setLatestLapAlert(null);
    gpsService.resetDistance();
    gpsService.setTrackingSessionId(null);
    sessionBufferRef.current = null;
    bikeBeeper.beep(2000, 0.05);
  };

  const handleDeleteHistoryItem = (id: string) => {
    const updated = deleteRideFromHistory(id);
    setRideHistory(updated);
  };

  const handleClearAllHistory = () => {
    clearRideHistory();
    setRideHistory([]);
  };

  // Center map on real current location and close drawer
  const handleLocateMe = () => {
    persistAutoCenter(true, false);
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCurrentCoords(coords);
          try {
            localStorage.setItem('magene-last-known-gps', JSON.stringify(coords));
          } catch {}
          setGpsStatus({
            hasFix: true,
            accuracy: pos.coords.accuracy || 4,
            quality: 'GPS 3D'
          });
        },
        null,
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    }
    setIsMenuDrawerOpen(false);
    bikeBeeper.beep(2600, 0.05);
  };

  const persistSelectedRouteId = (routeId: string | null) => {
    setSelectedRouteId(routeId);
    try {
      if (routeId) localStorage.setItem('magene-selected-route-id', routeId);
      else localStorage.removeItem('magene-selected-route-id');
    } catch {}
  };

  // Clear active route to return to pure Free Ride mode
  const handleClearRoute = () => {
    persistSelectedRouteId(null);
    bikeBeeper.beep(2000, 0.05);
  };

  const handleSaveUserRoute = (route: RouteData) => {
    const updated = saveUserRoute(route);
    setRoutes(updated);
    setIsRouteBuilderOpen(false);
    bikeBeeper.beep(2400, 0.08);
  };

  /** Select route as current ride: persist, close menus, fit map to course */
  const activateRouteAsCurrentRide = (routeId: string) => {
    persistSelectedRouteId(routeId);
    setIsRouteBuilderOpen(false);
    setIsMenuDrawerOpen(false);
    setFitRouteToken(t => t + 1);
    bikeBeeper.beep(2600, 0.1);
  };

  const handleUseRouteAsCurrentRide = (route: RouteData) => {
    const updated = saveUserRoute(route);
    setRoutes(updated);
    activateRouteAsCurrentRide(route.id);
  };

  const handleUseSavedRoute = (routeId: string) => {
    activateRouteAsCurrentRide(routeId);
  };

  const handleDeleteSavedRoute = (routeId: string) => {
    const updated = deleteUserRoute(routeId);
    setRoutes(updated);
    if (selectedRouteId === routeId) persistSelectedRouteId(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseGpxRoute(text, file.name);
        const updated = saveUserRoute(parsed);
        setRoutes(updated);
        setDistanceTraveled(0);
        setTimeElapsed(0);
        activateRouteAsCurrentRide(parsed.id);
      } catch (err: any) {
        alert(`GPX import error: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  const handleAddManualClimb = (newClimb: ClimbSegment) => {
    if (!activeRoute) {
      const customRoute: RouteData = {
        id: `manual-${Date.now()}`,
        name: 'Custom Climb Segment',
        location: 'Current Location',
        totalDistance: newClimb.totalLength + 500,
        totalElevationGain: newClimb.totalElevationGain,
        points: newClimb.points,
        climbs: [newClimb]
      };
      setRoutes([customRoute]);
      persistSelectedRouteId(customRoute.id);
      setFitRouteToken(t => t + 1);
    } else {
      setRoutes(prev =>
        prev.map(r => {
          if (r.id === activeRoute.id) {
            return {
              ...r,
              climbs: [...r.climbs, newClimb].sort((a, b) => a.startDist - b.startDist)
            };
          }
          return r;
        })
      );
    }
    bikeBeeper.climbAlert();
    setIsClimbModalOpen(false);
  };

  return (
    <div className="w-screen h-screen h-[100dvh] overflow-hidden bg-black flex flex-col items-center justify-center select-none">
      
      {/* 100% PHONE SCREEN VIEWPORT: ImageneCycle SCREEN */}
      <div className="w-full h-full max-w-lg flex flex-col justify-between relative bg-white">
        <MageneDevice
          metrics={metrics}
          climbState={climbState}
          currentPoint={currentPoint}
          routePoints={activeRoute ? activeRoute.points : []}
          routeClimbs={activeRoute?.climbs || []}
          climbProfilePoints={
            activeRoute?.points?.length
              ? activeRoute.points
              : freeRideClimbRecorder.getSamples()
          }
          routeTurns={activeRoute?.turns || []}
          routeAlternatives={activeRoute?.alternatives || []}
          routeName={activeRoute?.name}
          bleStatus={bleStatus}
          gpsStatus={gpsStatus}
          isPlaying={isRecording && !isPaused}
          onStartPause={handleToggleStartPause}
          onStopRide={handleStopActivity}
          onLap={handleLap}
          onResetRide={handleResetRide}
          soundEnabled={soundEnabled}
          onToggleSound={() => setSoundEnabled(!soundEnabled)}
          onOpenSensorModal={() => setIsSensorModalOpen(true)}
          onOpenMenuDrawer={() => setIsMenuDrawerOpen(true)}
          liveBreadcrumbs={liveBreadcrumbs}
          onLocateMe={handleLocateMe}
          latestLapAlert={latestLapAlert}
          onDismissLapAlert={() => setLatestLapAlert(null)}
          weather={weather}
          weatherLoading={weatherLoading}
          batterySaver={batterySaver}
          fitRouteToken={fitRouteToken}
          isOnline={isOnline}
          basemapToken={basemapToken}
          autoCenter={autoCenter}
          onToggleAutoCenter={handleToggleAutoCenter}
          onAutoCenterChange={handleAutoCenterChange}
          onNavProgress={handleNavProgress}
          invertHeading={invertHeading}
          onToggleInvertHeading={handleToggleInvertHeading}
          preferHeadingUp={false}
        />
      </div>

      <MenuSheet
        open={isMenuDrawerOpen}
        onOpenChange={setIsMenuDrawerOpen}
        activeRoute={activeRoute}
        routes={routes}
        selectedRouteId={selectedRouteId}
        rideHistory={rideHistory}
        activeSession={activeSession}
        isPaused={isPaused}
        ridingTime={ridingTime}
        saddleTime={saddleTime}
        timeElapsed={timeElapsed}
        distanceTraveled={distanceTraveled}
        gpsStatus={gpsStatus}
        currentCoords={currentCoords}
        autoCenter={autoCenter}
        invertHeading={invertHeading}
        autoLapDistance={autoLapDistance}
        batterySaver={batterySaver}
        ftp={ftp}
        maxHeartRate={maxHeartRate}
        restingHeartRate={restingHeartRate}
        metrics={metrics}
        historyExportNotice={historyExportNotice}
        historyMapRideId={historyMapRideId}
        isOnline={isOnline}
        stravaConnected={stravaConnected}
        offlineMapAvailable={offlineMapAvailable}
        onActivateRoute={activateRouteAsCurrentRide}
        onClearRoute={handleClearRoute}
        onOpenRouteBuilder={() => setIsRouteBuilderOpen(true)}
        onUseSavedRoute={handleUseSavedRoute}
        onDeleteSavedRoute={handleDeleteSavedRoute}
        onLocateMe={handleLocateMe}
        onOpenSensors={() => setIsSensorModalOpen(true)}
        onOpenClimbModal={() => setIsClimbModalOpen(true)}
        onFileUpload={handleFileUpload}
        onToggleAutoCenter={handleToggleAutoCenter}
        onToggleInvertHeading={handleToggleInvertHeading}
        onSetAutoLapDistance={handleSetAutoLapDistance}
        onStopActivity={handleStopActivity}
        onClearAllHistory={handleClearAllHistory}
        onDeleteHistoryItem={handleDeleteHistoryItem}
        onSetHistoryMapRideId={setHistoryMapRideId}
        onSetHistoryExportNotice={setHistoryExportNotice}
        onSaveFtp={handleSaveFtp}
        onSaveMaxHr={handleSaveMaxHr}
        onSaveRestingHr={handleSaveRestingHr}
        onToggleBatterySaver={handleToggleBatterySaver}
        onOpenDownloadMaps={() => setIsDownloadMapsOpen(true)}
        onOpenMapsStorage={() => setIsMapsStorageOpen(true)}
        onResetRide={handleResetRide}
        onStravaConnectedChange={setStravaConnected}
      />

      {/* Sensor Pairing, Manual Climb, Ride Summary & Start Activity Modals (Portaled to body at z-[99999]) */}
      {typeof document !== 'undefined' && createPortal(
        <>
          <RideSummaryModal
            isOpen={isRideSummaryOpen}
            metrics={metrics}
            routeName={activeSession?.routeName || activeRoute?.name || 'Free Ride (Live GPS)'}
            onSave={handleSaveActivity}
            onResume={handleResumeFromSummary}
            onDiscard={handleDiscardActivity}
            breadcrumbs={liveBreadcrumbs}
            startedAt={activeSession?.startedAt}
          />

          <StartActivityPrompt
            isOpen={showStartPrompt && (!isRecording || isPaused)}
            activeRoute={activeRoute}
            isResume={isResumePrompt}
            onStart={() => {
              setShowStartPrompt(false);
              if (isPaused || activeSession) {
                handleToggleStartPause();
              } else {
                handleStartNewActivity();
              }
            }}
            onDismiss={() => {
              setShowStartPrompt(false);
              lastPromptDismissedAtRef.current = Date.now();
            }}
          />

          <BleSensorModal
            isOpen={isSensorModalOpen}
            onClose={() => setIsSensorModalOpen(false)}
            bleStatus={bleStatus}
            setBleStatus={setBleStatus}
          />

          <ClimbManualInputModal
            isOpen={isClimbModalOpen}
            onClose={() => setIsClimbModalOpen(false)}
            onAddOrUpdateClimb={handleAddManualClimb}
            currentDist={distanceTraveled}
            currentElevation={currentElevation}
          />

          <RouteBuilderModal
            isOpen={isRouteBuilderOpen}
            onClose={() => setIsRouteBuilderOpen(false)}
            currentCoords={currentCoords}
            onSave={handleSaveUserRoute}
            onUseAsCurrentRide={handleUseRouteAsCurrentRide}
          />

          <DownloadMapsModal
            isOpen={isDownloadMapsOpen}
            onClose={() => setIsDownloadMapsOpen(false)}
            currentLat={currentCoords.lat}
            currentLng={currentCoords.lng}
            onPacksChanged={() => {
              // Flag already set/cleared in mapPacks install/delete; re-probe + re-attach basemap
              setBasemapToken(t => t + 1);
              void reconcileMapPacksInstalledFlag().then(has => {
                setOfflineMapAvailable(has);
              });
              void probeOfflineMapAvailable(true).then(setOfflineMapAvailable);
            }}
          />

          <MapsStorageModal
            isOpen={isMapsStorageOpen}
            onClose={() => setIsMapsStorageOpen(false)}
          />
        </>,
        document.body
      )}
    </div>
  );
}

