import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { RouteData, RoutePoint, ClimbSegment, RideMetrics, BleDeviceStatus, GpsStatus, RideHistoryItem, ActiveRideSession, AutoLapAlert, BreadcrumbPoint } from './types/cycling';
import { parseGpxRoute } from './data/routes';
import { calculateClimbProLiveState } from './utils/climbProEngine';
import { bleManager } from './utils/bleManager';
import { gpsService, GpsFix, accuracyToQuality, FAST_GEO_OPTIONS } from './utils/gpsService';
import { bikeBeeper } from './utils/audioAlerts';
import { getPowerZoneInfo, getHeartRateZoneInfo, POWER_ZONES_CONFIG, HR_ZONES_CONFIG } from './utils/powerZones';
import { loadRideHistory, saveRideToHistory, deleteRideFromHistory, clearRideHistory, loadActiveSession, saveActiveSession, clearActiveSession } from './utils/rideHistory';
import { exportRideToFit, exportRideToGpx, exportRideToJson, openStravaUpload, formatExportNotice } from './utils/rideExport';
import { fetchLiveWeather, WeatherData } from './services/weatherService';
import { captureStravaRedirectTokens, isStravaConnected, startStravaConnect, clearStravaTokens } from './utils/stravaAuth';
import { loadUserRoutes, loadUserRoutesAsync, saveUserRoute, deleteUserRoute } from './utils/routeLibrary';
import { OFFLINE_MAP_LABEL, probeOfflineMapAvailable } from './utils/offlineMap';
import { freeRideClimbRecorder } from './utils/freeRideClimbRecorder';
import { getRouteElevation, correctEllipsoidalAltitude, fetchDemElevation } from './utils/elevationService';
import { MageneDevice } from './components/MageneDevice';
import { BleSensorModal } from './components/BleSensorModal';
import { ClimbManualInputModal } from './components/ClimbManualInputModal';
import { RideSummaryModal } from './components/RideSummaryModal';
import { HistoryRideMap } from './components/HistoryRideMap';
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
import { 
  X, 
  Upload, 
  Bluetooth, 
  Mountain, 
  Compass, 
  RotateCcw, 
  Camera,
  CheckCircle2,
  Navigation2,
  History,
  Zap,
  Trash2,
  Clock,
  TrendingUp,
  Sliders,
  Check,
  Play,
  Square,
  MapPin,
  Crosshair,
  Flag,
  Share2,
  Download,
  ExternalLink,
  Battery,
  Heart,
  Map,
  HardDrive
} from 'lucide-react';

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
  const [drawerTab, setDrawerTab] = useState<'routes' | 'history' | 'profile'>('routes');

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

  // Sound sync
  useEffect(() => {
    bikeBeeper.enabled = soundEnabled;
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

  // Merge IndexedDB routes + probe shipped PH basemap
  useEffect(() => {
    void loadUserRoutesAsync().then(list => {
      if (list.length) setRoutes(list);
    });
    void probeOfflineMapAvailable().then(setOfflineMapAvailable);
  }, []);

  // Subscribe to real BLE hardware streams
  useEffect(() => {
    const unsub = bleManager.subscribe(data => {
      if (data.heartRate !== undefined) setHeartRate(data.heartRate);
      if (data.cadence !== undefined) setCadence(data.cadence);
      if (data.speed !== undefined) {
        setSpeed(data.speed);
        bleSpeedRef.current = data.speed;
        bleSpeedAtRef.current = Date.now();
        applyAutoPauseRef.current();
      }
      if (data.power !== undefined) setPower(data.power);
    });
    return unsub;
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

        // Weak / display-only: map puck + HUD only (auto-pause already ticked above)
        if (fix.displayOnly) {
          if (fix.heading) setCurrentHeading(fix.heading);
          if (fix.altitude > 0) {
            let ele = fix.altitude;
            if (activeRoute && activeRoute.points?.length) {
              const rEle = getRouteElevation(activeRoute.points, distanceTraveledRef.current, { lat: fix.lat, lng: fix.lng });
              if (rEle !== null) ele = rEle;
            }
            setCurrentElevation(Math.round(ele));
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
          const newBreadcrumb: BreadcrumbPoint = {
            lat: fix.lat,
            lng: fix.lng,
            ele: fix.altitude > 0 ? fix.altitude : undefined,
            time: Date.now(),
            speed: fix.speedKmh,
            power: powerRef.current ?? undefined,
            cadence: cadenceRef.current ?? undefined,
            heartRate: heartRateRef.current ?? undefined,
            distance: nextDist,
            temperature: weatherRef.current?.tempC
          };

          if (sessionBufferRef.current && sessionBufferRef.current.id === curSessionId) {
            sessionBufferRef.current.distanceMeters = Math.max(sessionBufferRef.current.distanceMeters, nextDist);
            sessionBufferRef.current.breadcrumbs.push(newBreadcrumb);
            sessionBufferRef.current.maxSpeedKmh = Math.max(sessionBufferRef.current.maxSpeedKmh, fix.speedKmh);
            setLiveBreadcrumbs(sessionBufferRef.current.breadcrumbs.slice());
          } else {
            setLiveBreadcrumbs(prev => [...prev, newBreadcrumb]);
          }
          setDistanceTraveled(nextDist);
        }

        // Elevation and smoothed grade
        let nextEle = fix.altitude;
        if (activeRoute && activeRoute.points?.length) {
          const routeEle = getRouteElevation(activeRoute.points, distanceTraveledRef.current, { lat: fix.lat, lng: fix.lng });
          if (routeEle !== null) {
            nextEle = routeEle;
          }
        } else if (fix.lat && fix.lng) {
          // In Free Ride, check DEM cache/fetch for ground truth calibration
          void fetchDemElevation(fix.lat, fix.lng).then(demEle => {
            if (demEle !== null && !selectedRouteIdRef.current && (!isRecordingRef.current || isPausedRef.current)) {
              setCurrentElevation(Math.round(demEle));
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
          invertHeading={invertHeading}
          onToggleInvertHeading={handleToggleInvertHeading}
          preferHeadingUp={false}
        />
      </div>

      {/* DISCREET SLIDE-OVER MENU DRAWER (Portal to body at z-[99999] so map never overlaps) */}
      {isMenuDrawerOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] flex justify-start bg-black/75 backdrop-blur-xs animate-in fade-in duration-200" style={{ zIndex: 99999 }}>
          <div className="w-full max-w-xs sm:max-w-sm h-full bg-zinc-900 border-r border-zinc-800 p-4 flex flex-col justify-between text-zinc-100 overflow-y-auto shadow-2xl relative z-10">
            
            {/* Drawer Header */}
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
                    <Navigation2 className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="font-sports font-bold text-sm tracking-wider uppercase text-white">
                      ImageneCycle MENU
                    </h3>
                    <p className="text-[10px] text-zinc-400">Live GPS, Sensors & Ride History</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsMenuDrawerOpen(false)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Navigation Tabs */}
              <div className="grid grid-cols-3 gap-1 my-3 bg-zinc-850 p-1 rounded-xl text-xs font-sports font-bold">
                <button
                  onClick={() => setDrawerTab('routes')}
                  className={`py-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors ${
                    drawerTab === 'routes' ? 'bg-blue-600 text-white shadow-xs' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Navigation2 className="w-3.5 h-3.5" />
                  <span>GPS / MAP</span>
                </button>

                <button
                  onClick={() => setDrawerTab('history')}
                  className={`py-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors relative ${
                    drawerTab === 'history' ? 'bg-blue-600 text-white shadow-xs' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>HISTORY</span>
                  {rideHistory.length > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 absolute top-1 right-2" />
                  )}
                </button>

                <button
                  onClick={() => setDrawerTab('profile')}
                  className={`py-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors ${
                    drawerTab === 'profile' ? 'bg-blue-600 text-white shadow-xs' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>FTP / ZONES</span>
                </button>
              </div>

              {/* TAB 1: LIVE GPS, LOCATION & TOOLS */}
              {drawerTab === 'routes' && (
                <div className="space-y-3">
                  {/* Real-time GPS Location Card */}
                  <div className="bg-zinc-850 border border-blue-500/40 rounded-xl p-3 text-xs space-y-2.5 shadow-md">
                    <div className="flex items-center justify-between">
                      <span className="font-sports font-bold text-white uppercase text-xs flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-blue-400" />
                        Current GPS Location
                      </span>
                      <span className="text-[10px] font-sports font-bold text-emerald-400 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        {gpsStatus.quality || 'GPS 3D'} (±{gpsStatus.accuracy || 4}m)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-zinc-900/80 p-2.5 rounded-lg font-mono text-[11px] text-zinc-300 border border-zinc-800">
                      <div>
                        <span className="text-[9px] text-zinc-500 block uppercase font-sports font-bold">LATITUDE</span>
                        <span className="font-bold text-white text-xs">{currentCoords.lat ? currentCoords.lat.toFixed(5) : '--'}°</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-zinc-500 block uppercase font-sports font-bold">LONGITUDE</span>
                        <span className="font-bold text-white text-xs">{currentCoords.lng ? currentCoords.lng.toFixed(5) : '--'}°</span>
                      </div>
                    </div>

                    <button
                      onClick={handleLocateMe}
                      className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-sports font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                      <span>Center Map on My Location</span>
                    </button>
                  </div>

                  {/* Active Ride Mode Card */}
                  <div className="p-3 rounded-xl bg-zinc-850/80 border border-zinc-750 text-xs font-sports">
                    {activeRoute ? (
                      <div>
                        <button
                          type="button"
                          onClick={() => activateRouteAsCurrentRide(activeRoute.id)}
                          className="w-full text-left rounded-lg hover:bg-zinc-800/60 -m-1 p-1 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-zinc-400 uppercase font-bold">CUSTOM ROUTE LOADED</span>
                            <span className="text-[10px] text-blue-400 font-bold">{(activeRoute.totalDistance / 1000).toFixed(1)} km</span>
                          </div>
                          <div className="font-bold text-white text-sm mt-1 truncate">
                            {activeRoute.name}
                          </div>
                          <div className="text-[10px] text-zinc-400 mt-0.5">
                            +{activeRoute.totalElevationGain} m · {activeRoute.climbs.length} climbs
                          </div>
                          <div className="text-[10px] text-blue-400 font-bold mt-1">
                            Tap to show course on map
                          </div>
                        </button>
                        <button
                          onClick={handleClearRoute}
                          className="mt-2 w-full py-1.5 px-2 rounded-lg bg-zinc-800 hover:bg-rose-950/60 border border-zinc-700 hover:border-rose-600/50 text-zinc-300 hover:text-rose-400 text-[11px] font-bold transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Clear Route (Return to Free Ride)</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          <span>FREE RIDE MODE ACTIVE</span>
                        </div>
                        <p className="text-[11px] text-zinc-400 font-normal leading-relaxed">
                          Live GPS tracking with ClimbPro recording climbs as you ride. Create a route to load a planned course.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Create + saved routes */}
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuDrawerOpen(false);
                        setIsRouteBuilderOpen(true);
                      }}
                      className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-sports font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Flag className="w-3.5 h-3.5" />
                      <span>Create Route (Start → Dest)</span>
                    </button>

                    {routes.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[10px] text-zinc-400 uppercase font-bold">Saved routes</span>
                        {routes.map(r => (
                          <div
                            key={r.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleUseSavedRoute(r.id)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleUseSavedRoute(r.id);
                              }
                            }}
                            className={`p-2 rounded-xl border text-xs cursor-pointer transition-colors ${
                              selectedRouteId === r.id
                                ? 'bg-blue-950/40 border-blue-500/50'
                                : 'bg-zinc-850 border-zinc-800 hover:border-zinc-600'
                            }`}
                          >
                            <div className="font-bold text-zinc-100 truncate">{r.name}</div>
                            <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                              {(r.totalDistance / 1000).toFixed(1)} km · +{r.totalElevationGain} m · {r.climbs.length} climbs
                            </div>
                            <div className="flex gap-1.5 mt-1.5">
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  handleUseSavedRoute(r.id);
                                }}
                                className="flex-1 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px]"
                              >
                                Use as ride
                              </button>
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  handleDeleteSavedRoute(r.id);
                                }}
                                className="px-2 py-1 rounded-lg bg-zinc-800 text-zinc-400 hover:text-rose-400"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Map Settings Card: Auto-Center & 180° Flip */}
                  <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-3 text-xs space-y-2.5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-sports font-bold text-white uppercase text-xs flex items-center gap-1.5">
                        <Compass className="w-3.5 h-3.5 text-blue-400" />
                        Map Settings
                      </span>
                      <span className="text-[10px] font-sports font-bold text-zinc-400">
                        Navigation & Heading
                      </span>
                    </div>

                    <div className="space-y-2 pt-0.5">
                      {/* Auto-Center Toggle */}
                      <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900 border border-zinc-800">
                        <div className="pr-2 min-w-0">
                          <div className="font-sports font-bold text-white text-xs flex items-center gap-1.5">
                            <Crosshair className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <span>Auto-Center Map</span>
                          </div>
                          <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                            Automatically follows rider position on map
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleToggleAutoCenter}
                          className={`px-3 py-1 rounded-lg font-sports font-bold text-xs border transition-colors shrink-0 ${
                            autoCenter
                              ? 'bg-blue-600 border-blue-500 text-white shadow-xs'
                              : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                          }`}
                        >
                          {autoCenter ? 'ON' : 'OFF'}
                        </button>
                      </div>

                      {/* 180° Invert Heading Toggle */}
                      <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900 border border-zinc-800">
                        <div className="pr-2 min-w-0">
                          <div className="font-sports font-bold text-white text-xs flex items-center gap-1.5">
                            <RotateCcw className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>180° Arrow Heading Invert</span>
                          </div>
                          <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                            Flips arrow direction for reverse or handlebar phone mounts
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleToggleInvertHeading}
                          className={`px-3 py-1 rounded-lg font-sports font-bold text-xs border transition-colors shrink-0 ${
                            invertHeading
                              ? 'bg-amber-600 border-amber-500 text-white shadow-xs'
                              : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                          }`}
                        >
                          {invertHeading ? 'ON' : 'OFF'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Smart Auto-Lap Configuration Card */}
                  <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-3 text-xs space-y-2 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-sports font-bold text-white uppercase text-xs flex items-center gap-1.5">
                        <Flag className="w-3.5 h-3.5 text-blue-400" />
                        Smart Auto-Lap
                      </span>
                      <span className="text-[10px] font-sports font-bold text-blue-400">
                        {autoLapDistance === 5000 ? '5 KM Interval' : autoLapDistance === 10000 ? '10 KM Interval' : 'Disabled'}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-400 leading-tight">
                      Automatically marks laps with dual-tone ImageneCycle beeper chime & haptic alert at configured distance splits.
                    </p>
                    <div className="grid grid-cols-3 gap-1.5 pt-1">
                      <button
                        onClick={() => handleSetAutoLapDistance(5000)}
                        className={`py-1.5 px-2 rounded-lg font-sports font-bold text-xs transition-colors flex items-center justify-center gap-1 ${
                          autoLapDistance === 5000
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-750'
                        }`}
                      >
                        {autoLapDistance === 5000 && <Check className="w-3 h-3" />}
                        <span>5 KM</span>
                      </button>
                      <button
                        onClick={() => handleSetAutoLapDistance(10000)}
                        className={`py-1.5 px-2 rounded-lg font-sports font-bold text-xs transition-colors flex items-center justify-center gap-1 ${
                          autoLapDistance === 10000
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-750'
                        }`}
                      >
                        {autoLapDistance === 10000 && <Check className="w-3 h-3" />}
                        <span>10 KM</span>
                      </button>
                      <button
                        onClick={() => handleSetAutoLapDistance(0)}
                        className={`py-1.5 px-2 rounded-lg font-sports font-bold text-xs transition-colors flex items-center justify-center gap-1 ${
                          autoLapDistance === 0
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-750'
                        }`}
                      >
                        {autoLapDistance === 0 && <Check className="w-3 h-3" />}
                        <span>OFF</span>
                      </button>
                    </div>
                  </div>

                  {/* Quick Hardware & Developer Tools */}
                  <div className="space-y-1.5 text-xs">
                    <button
                      onClick={() => {
                        setIsMenuDrawerOpen(false);
                        setIsSensorModalOpen(true);
                      }}
                      className="w-full p-2.5 rounded-xl bg-zinc-850 hover:bg-zinc-800 border border-zinc-750 flex items-center gap-2.5 text-left font-sports font-semibold transition-colors"
                    >
                      <Bluetooth className="w-4 h-4 text-blue-400" />
                      <div>
                        <div className="text-zinc-200">BLE Sensors Manager</div>
                        <div className="text-[10px] text-zinc-400">Pair Heart Rate, Speed & Power</div>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setIsMenuDrawerOpen(false);
                        setIsClimbModalOpen(true);
                      }}
                      className="w-full p-2.5 rounded-xl bg-zinc-850 hover:bg-zinc-800 border border-zinc-750 flex items-center gap-2.5 text-left font-sports font-semibold transition-colors"
                    >
                      <Mountain className="w-4 h-4 text-amber-400" />
                      <div>
                        <div className="text-zinc-200">Manual Climb Builder</div>
                        <div className="text-[10px] text-zinc-400">Customize upcoming gradient profile</div>
                      </div>
                    </button>

                  </div>

                  {/* Optional Custom GPX Upload */}
                  <div className="pt-2 border-t border-zinc-800">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept=".gpx,.xml"
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-2 px-3 rounded-lg border border-zinc-750 hover:border-zinc-600 bg-zinc-850 hover:bg-zinc-800 text-zinc-300 text-xs font-sports font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5 text-blue-400" />
                      <span>Upload Custom GPX Track (Optional)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: RIDE HISTORY (localStorage) */}
              {drawerTab === 'history' && (
                <div className="space-y-3">
                  {/* Live Active Session Card if in progress */}
                  {activeSession && (
                    <div className="bg-emerald-950/40 border border-emerald-500/50 rounded-xl p-3 text-xs font-sports shadow-md">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-emerald-400 font-bold uppercase tracking-wider text-[11px]">
                          <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-amber-400' : 'bg-emerald-400 animate-ping'}`} />
                          <span>{isPaused ? 'SESSION PAUSED' : 'ACTIVE RECORDING'}</span>
                        </div>
                        <span className="text-[10px] font-mono text-zinc-400">
                          {activeSession.id.slice(-6)}
                        </span>
                      </div>
                      <div className="font-bold text-zinc-100 text-sm mt-1 truncate">
                        {activeSession.routeName}
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 font-digital text-[11px] bg-zinc-900/80 p-2 rounded-lg mt-2">
                        <div>
                          <span className="text-[9px] font-sports text-zinc-500 uppercase block">RIDING</span>
                          <span className="font-bold text-emerald-400">
                            {Math.floor((ridingTime || timeElapsed) / 60)}m {(ridingTime || timeElapsed) % 60}s
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] font-sports text-zinc-500 uppercase block">SADDLE</span>
                          <span className="font-bold text-zinc-300">
                            {Math.floor((saddleTime || timeElapsed) / 60)}m {(saddleTime || timeElapsed) % 60}s
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] font-sports text-zinc-500 uppercase block">DIST</span>
                          <span className="font-bold text-white">
                            {(distanceTraveled / 1000).toFixed(2)} km
                          </span>
                        </div>
                      </div>

                      <div className="mt-2.5 flex items-center gap-2">
                        <button
                          onClick={() => {
                            setIsMenuDrawerOpen(false);
                            handleStopActivity();
                          }}
                          className="flex-1 py-1.5 px-3 bg-rose-600 hover:bg-rose-500 text-white font-sports font-bold text-xs uppercase rounded-lg transition-colors flex items-center justify-center gap-1"
                        >
                          <Square className="w-3 h-3 fill-current" />
                          <span>FINISH & SAVE</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800">
                    <span className="font-sports font-bold text-xs text-zinc-400 uppercase">
                      Past Rides ({rideHistory.length})
                    </span>
                    {rideHistory.length > 0 && (
                      <button
                        onClick={handleClearAllHistory}
                        className="text-[10px] text-red-400 hover:text-red-300 font-semibold"
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  {historyExportNotice && (
                    <div className="text-[10px] text-emerald-300 bg-emerald-950/40 border border-emerald-800/50 rounded-md px-2 py-1.5">
                      {historyExportNotice}
                    </div>
                  )}

                  {rideHistory.length === 0 ? (
                    <div className="p-4 bg-zinc-850/50 rounded-xl text-center text-xs text-zinc-500">
                      <History className="w-6 h-6 mx-auto mb-1 text-zinc-600" />
                      <p>No rides saved yet.</p>
                      <p className="text-[10px] text-zinc-500 mt-1">
                        When you ride and stop an activity, it will be automatically saved here!
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[360px] overflow-y-auto">
                      {rideHistory.map(ride => {
                        const m = Math.floor(ride.timeElapsed / 60);
                        const s = ride.timeElapsed % 60;
                        const timeStr = `${m}m ${s}s`;

                        return (
                          <div
                            key={ride.id}
                            className="bg-zinc-850 border border-zinc-800 rounded-xl p-3 text-xs font-sports"
                          >
                            <div className="flex items-center justify-between text-zinc-200 font-bold mb-1">
                              <button
                                type="button"
                                className="truncate pr-2 text-left hover:text-emerald-300 transition-colors"
                                title="View ride map"
                                onClick={() =>
                                  setHistoryMapRideId(prev => (prev === ride.id ? null : ride.id))
                                }
                              >
                                {ride.routeName}
                              </button>
                              <button
                                onClick={() => handleDeleteHistoryItem(ride.id)}
                                className="text-zinc-500 hover:text-red-400 p-0.5"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="text-[10px] text-zinc-400 mb-2">
                              {ride.dateFormatted}
                            </div>

                            <div className="grid grid-cols-3 gap-1.5 font-digital text-[11px] bg-zinc-900/60 p-2 rounded-lg">
                              <div>
                                <span className="text-[9px] font-sports text-zinc-500 uppercase block">DIST</span>
                                <span className="font-bold">{(ride.distanceMeters / 1000).toFixed(2)} km</span>
                              </div>
                              <div>
                                <span className="text-[9px] font-sports text-zinc-500 uppercase block">GAIN</span>
                                <span className="font-bold text-emerald-400">+{ride.totalAscentMeters}m</span>
                              </div>
                              <div>
                                <span className="text-[9px] font-sports text-zinc-500 uppercase block">TIME</span>
                                <span className="font-bold text-blue-400">{timeStr}</span>
                              </div>
                            </div>

                            {historyMapRideId === ride.id && (
                              <div className="mt-2">
                                <HistoryRideMap
                                  breadcrumbs={ride.breadcrumbs || []}
                                  className="h-[140px] w-full"
                                />
                              </div>
                            )}

                            <div className="mt-2.5 pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-1 text-[10px]">
                              <button
                                onClick={async () => {
                                  try {
                                    const result = await exportRideToFit({
                                      routeName: ride.routeName,
                                      startedAt: ride.startedAt || ride.timestamp,
                                      timeElapsed: ride.timeElapsed,
                                      ridingTimeSeconds: ride.ridingTimeSeconds || ride.timeElapsed,
                                      saddleTimeSeconds: ride.saddleTimeSeconds || ride.timeElapsed,
                                      distanceMeters: ride.distanceMeters,
                                      totalAscentMeters: ride.totalAscentMeters,
                                      avgSpeedKmh: ride.avgSpeedKmh,
                                      maxSpeedKmh: ride.maxSpeedKmh,
                                      calories: ride.calories,
                                      avgPowerWatts: ride.avgPowerWatts,
                                      avgCadenceRpm: ride.avgCadenceRpm,
                                      avgHeartRateBpm: ride.avgHeartRateBpm,
                                      breadcrumbs: ride.breadcrumbs || []
                                    });
                                    setHistoryExportNotice(formatExportNotice(result, 'FIT'));
                                  } catch (err) {
                                    setHistoryExportNotice(err instanceof Error ? err.message : 'FIT export failed');
                                  }
                                  setTimeout(() => setHistoryExportNotice(null), 4000);
                                }}
                                className="flex-1 py-1 px-1 rounded-md bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-700/60 text-emerald-300 font-sports font-bold transition-colors flex items-center justify-center gap-0.5"
                                title="Export standardized FIT 2.0 binary file (Strava/Garmin)"
                              >
                                <Download className="w-2.5 h-2.5 text-emerald-400" />
                                <span>FIT</span>
                              </button>

                              <button
                                onClick={async () => {
                                  try {
                                    const result = await exportRideToGpx({
                                      routeName: ride.routeName,
                                      startedAt: ride.startedAt || ride.timestamp,
                                      timeElapsed: ride.timeElapsed,
                                      ridingTimeSeconds: ride.ridingTimeSeconds || ride.timeElapsed,
                                      saddleTimeSeconds: ride.saddleTimeSeconds || ride.timeElapsed,
                                      distanceMeters: ride.distanceMeters,
                                      totalAscentMeters: ride.totalAscentMeters,
                                      avgSpeedKmh: ride.avgSpeedKmh,
                                      maxSpeedKmh: ride.maxSpeedKmh,
                                      calories: ride.calories,
                                      breadcrumbs: ride.breadcrumbs || []
                                    });
                                    setHistoryExportNotice(formatExportNotice(result, 'GPX'));
                                  } catch (err) {
                                    setHistoryExportNotice(err instanceof Error ? err.message : 'GPX export failed');
                                  }
                                  setTimeout(() => setHistoryExportNotice(null), 4000);
                                }}
                                className="flex-1 py-1 px-1 rounded-md bg-zinc-800 hover:bg-blue-900/50 hover:text-blue-300 border border-zinc-700 text-zinc-300 font-sports font-bold transition-colors flex items-center justify-center gap-0.5"
                                title="Export Strava GPX 1.1 file"
                              >
                                <Download className="w-2.5 h-2.5 text-blue-400" />
                                <span>GPX</span>
                              </button>

                              <button
                                onClick={async () => {
                                  try {
                                    const result = await exportRideToJson({
                                      routeName: ride.routeName,
                                      startedAt: ride.startedAt || ride.timestamp,
                                      timeElapsed: ride.timeElapsed,
                                      ridingTimeSeconds: ride.ridingTimeSeconds || ride.timeElapsed,
                                      saddleTimeSeconds: ride.saddleTimeSeconds || ride.timeElapsed,
                                      distanceMeters: ride.distanceMeters,
                                      totalAscentMeters: ride.totalAscentMeters,
                                      avgSpeedKmh: ride.avgSpeedKmh,
                                      maxSpeedKmh: ride.maxSpeedKmh,
                                      calories: ride.calories,
                                      breadcrumbs: ride.breadcrumbs || []
                                    });
                                    setHistoryExportNotice(formatExportNotice(result, 'JSON'));
                                  } catch (err) {
                                    setHistoryExportNotice(err instanceof Error ? err.message : 'JSON export failed');
                                  }
                                  setTimeout(() => setHistoryExportNotice(null), 4000);
                                }}
                                className="flex-1 py-1 px-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-sports font-bold transition-colors flex items-center justify-center gap-1 border border-zinc-700"
                                title="Export detailed JSON telemetry"
                              >
                                <Share2 className="w-2.5 h-2.5 text-emerald-400" />
                                <span>JSON</span>
                              </button>

                              <button
                                onClick={() => openStravaUpload()}
                                className="py-1 px-2 rounded-md bg-[#FC4C02]/20 hover:bg-[#FC4C02]/30 text-[#FC4C02] border border-[#FC4C02]/40 font-sports font-bold transition-colors flex items-center gap-1"
                                title="Open Strava Upload Portal"
                              >
                                <span>Strava</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: FTP, HR ZONES, BATTERY SAVER, STRAVA */}
              {drawerTab === 'profile' && (
                <div className="space-y-3 text-xs font-sports">
                  {/* Battery Saver */}
                  <div className="bg-zinc-850 p-3 rounded-xl border border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white uppercase text-xs flex items-center gap-1.5">
                        <Battery className="w-4 h-4 text-emerald-400" />
                        Battery Saver
                      </span>
                      <button
                        type="button"
                        onClick={handleToggleBatterySaver}
                        className={`px-2.5 py-1 rounded-lg font-bold text-[11px] border transition-colors ${
                          batterySaver
                            ? 'bg-emerald-600 border-emerald-500 text-white'
                            : 'bg-zinc-900 border-zinc-700 text-zinc-400'
                        }`}
                      >
                        {batterySaver ? 'ON' : 'OFF'}
                      </button>
                    </div>
                    <p className="text-[10px] text-zinc-400">
                      Disables map animations and polls GPS every 10s to preserve mobile battery on long rides.
                    </p>
                  </div>

                  {/* Offline maps (download countries to phone; world overview until then) */}
                  <div className="bg-zinc-850 p-3 rounded-xl border border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white uppercase text-xs flex items-center gap-1.5">
                        <Map className="w-4 h-4 text-emerald-400" />
                        Offline maps
                      </span>
                      <span className={`text-[10px] font-bold ${
                        offlineMapAvailable === true
                          ? 'text-emerald-400'
                          : offlineMapAvailable === false
                          ? 'text-amber-400'
                          : 'text-zinc-500'
                      }`}>
                        {offlineMapAvailable === true
                          ? 'Pack installed'
                          : offlineMapAvailable === false
                          ? 'World only'
                          : '…'}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-400 leading-relaxed">
                      {OFFLINE_MAP_LABEL} (OpenStreetMap). First load is a world overview — download a
                      country for offline detail. Guru .vm / .rt / .elv are not supported.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuDrawerOpen(false);
                          setIsDownloadMapsOpen(true);
                        }}
                        className="py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-sports font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Maps
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuDrawerOpen(false);
                          setIsMapsStorageOpen(true);
                        }}
                        className="py-2 rounded-lg bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-zinc-200 font-sports font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1"
                      >
                        <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                        Maps Storage
                      </button>
                    </div>
                  </div>

                  {/* Strava Connect */}
                  <div className="bg-zinc-850 p-3 rounded-xl border border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white uppercase text-xs flex items-center gap-1.5">
                        <Share2 className="w-4 h-4 text-orange-500" />
                        Strava
                      </span>
                      <span className={`text-[10px] font-bold ${stravaConnected ? 'text-emerald-400' : 'text-zinc-500'}`}>
                        {!isOnline ? 'Needs internet' : stravaConnected ? 'Connected' : 'Not connected'}
                      </span>
                    </div>
                    {stravaConnected ? (
                      <button
                        type="button"
                        onClick={() => {
                          clearStravaTokens();
                          setStravaConnected(false);
                        }}
                        className="w-full py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold text-[11px]"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!isOnline}
                        onClick={() => {
                          try {
                            startStravaConnect();
                          } catch (err) {
                            alert(err instanceof Error ? err.message : 'Strava needs internet');
                          }
                        }}
                        className="w-full py-1.5 rounded-lg bg-[#FC4C02] text-white font-bold text-[11px] disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Connect with Strava
                      </button>
                    )}
                    <p className="text-[10px] text-zinc-400">
                      Requires internet. Also needs Express OAuth (`npm run dev:server`) and Strava API credentials.
                    </p>
                  </div>

                  <div className="bg-zinc-850 p-3 rounded-xl border border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white uppercase text-xs flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-amber-400" />
                        FTP (Functional Threshold Power)
                      </span>
                      <span className="font-digital text-sm font-bold text-blue-400">{ftp} W</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="100"
                        max="450"
                        step="5"
                        value={ftp}
                        onChange={e => handleSaveFtp(parseInt(e.target.value, 10))}
                        className="w-full accent-blue-500 cursor-pointer h-2 bg-zinc-800 rounded-lg"
                      />
                      <input
                        type="number"
                        min="80"
                        max="600"
                        value={ftp}
                        onChange={e => handleSaveFtp(parseInt(e.target.value, 10))}
                        className="w-16 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 font-digital font-bold text-center text-white text-xs"
                      />
                    </div>
                    <p className="text-[10px] text-zinc-400">
                      Your 60-minute maximum sustainable power. Coggan zones are calculated dynamically below.
                    </p>
                  </div>

                  {/* HR Anchors */}
                  <div className="bg-zinc-850 p-3 rounded-xl border border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white uppercase text-xs flex items-center gap-1.5">
                        <Heart className="w-4 h-4 text-red-400" />
                        Heart Rate Zones (Karvonen)
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-1">
                        <span className="text-[10px] text-zinc-400 uppercase">Max HR</span>
                        <input
                          type="number"
                          min="120"
                          max="230"
                          value={maxHeartRate}
                          onChange={e => handleSaveMaxHr(parseInt(e.target.value, 10) || 190)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 font-digital font-bold text-center text-white text-xs"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[10px] text-zinc-400 uppercase">Resting HR</span>
                        <input
                          type="number"
                          min="30"
                          max="100"
                          value={restingHeartRate}
                          onChange={e => handleSaveRestingHr(parseInt(e.target.value, 10) || 60)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 font-digital font-bold text-center text-white text-xs"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Coggan 7-Zone Breakdown Table */}
                  <div className="space-y-1.5">
                    <span className="font-bold text-xs text-zinc-400 uppercase">
                      Calculated Power Zones ({ftp}W FTP)
                    </span>

                    <div className="space-y-1">
                      {POWER_ZONES_CONFIG.map(z => {
                        const minW = Math.round((z.minPct / 100) * ftp);
                        const maxW = z.maxPct === 999 ? '∞' : `${Math.round((z.maxPct / 100) * ftp)}W`;
                        const isCurrent = metrics.powerZone === z.zone;

                        return (
                          <div
                            key={z.zone}
                            className={`p-2 rounded-lg border flex items-center justify-between transition-colors ${
                              isCurrent
                                ? 'bg-zinc-800 border-white ring-1 ring-white/50'
                                : 'bg-zinc-850/60 border-zinc-800'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: z.color }}
                              />
                              <div>
                                <div className="font-bold text-zinc-200">
                                  Z{z.zone} {z.name}
                                </div>
                                <div className="text-[10px] text-zinc-400">
                                  {z.minPct}% - {z.maxPct === 999 ? '150%+' : `${z.maxPct}%`}
                                </div>
                              </div>
                            </div>

                            <div className="font-digital font-bold text-right text-xs">
                              <span>{minW} - {maxW}</span>
                              {isCurrent && (
                                <span className="block text-[9px] text-emerald-400 uppercase font-sports">ACTIVE</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Karvonen HR Zones */}
                  <div className="space-y-1.5">
                    <span className="font-bold text-xs text-zinc-400 uppercase">
                      Heart Rate Zones (HRR)
                    </span>
                    <div className="space-y-1">
                      {HR_ZONES_CONFIG.map(z => {
                        const hrr = Math.max(1, maxHeartRate - restingHeartRate);
                        const minBpm = Math.round(restingHeartRate + (z.minPct / 100) * hrr);
                        const maxBpm = Math.round(restingHeartRate + (z.maxPct / 100) * hrr);
                        const isCurrent = metrics.hrZone === z.zone;
                        return (
                          <div
                            key={z.zone}
                            className={`p-2 rounded-lg border flex items-center justify-between ${
                              isCurrent
                                ? 'bg-zinc-800 border-white ring-1 ring-white/50'
                                : 'bg-zinc-850/60 border-zinc-800'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: z.color }}
                              />
                              <div>
                                <div className="font-bold text-zinc-200">Z{z.zone} {z.name}</div>
                                <div className="text-[10px] text-zinc-400">
                                  {z.minPct}% – {z.maxPct}% HRR
                                </div>
                              </div>
                            </div>
                            <div className="font-digital font-bold text-right text-xs">
                              {minBpm} – {maxBpm}
                              {isCurrent && (
                                <span className="block text-[9px] text-emerald-400 uppercase font-sports">ACTIVE</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="pt-3 border-t border-zinc-800 text-center">
              <button
                onClick={handleResetRide}
                className="w-full py-2 rounded-lg bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-red-400 border border-zinc-750 text-xs font-sports font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Ride (Save to History)</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

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
              setBasemapToken(t => t + 1);
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
