import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { RouteData, RoutePoint, ClimbSegment, RideMetrics, BleDeviceStatus, GpsStatus, RideHistoryItem, ActiveRideSession, AutoLapAlert } from './types/cycling';
import { PRESET_ROUTES, parseGpxRoute } from './data/routes';
import { calculateClimbProLiveState } from './utils/climbProEngine';
import { bleManager } from './utils/bleManager';
import { gpsService, GpsFix } from './utils/gpsService';
import { bikeBeeper } from './utils/audioAlerts';
import { getPowerZoneInfo, getHeartRateZoneInfo, POWER_ZONES_CONFIG, HR_ZONES_CONFIG } from './utils/powerZones';
import { loadRideHistory, saveRideToHistory, deleteRideFromHistory, clearRideHistory, loadActiveSession, saveActiveSession, clearActiveSession } from './utils/rideHistory';
import { exportRideToGpx, exportRideToJson, openStravaUpload } from './utils/rideExport';
import { fetchLiveWeather, WeatherData } from './services/weatherService';
import { captureStravaRedirectTokens, isStravaConnected, startStravaConnect, clearStravaTokens } from './utils/stravaAuth';
import { MageneDevice } from './components/MageneDevice';
import { BleSensorModal } from './components/BleSensorModal';
import { ClimbManualInputModal } from './components/ClimbManualInputModal';
import { FlutterArchitectureModal } from './components/FlutterArchitectureModal';
import { RideSummaryModal } from './components/RideSummaryModal';
import { StartActivityPrompt } from './components/StartActivityPrompt';
import { 
  X, 
  Upload, 
  Bluetooth, 
  Mountain, 
  Code2, 
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
  Heart
} from 'lucide-react';

export default function App() {
  // Optional custom routes (empty by default for Free Ride / Live GPS Tracking)
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  const activeRoute = useMemo<RouteData | null>(() => {
    if (!selectedRouteId) return null;
    return routes.find(r => r.id === selectedRouteId) || null;
  }, [routes, selectedRouteId]);

  // Active Activity Session State (Persisted in localStorage)
  const [activeSession, setActiveSession] = useState<ActiveRideSession | null>(() => loadActiveSession());
  const [ridingTime, setRidingTime] = useState<number>(() => {
    const s = loadActiveSession();
    return s ? s.ridingTime : 135;
  });
  const [saddleTime, setSaddleTime] = useState<number>(() => {
    const s = loadActiveSession();
    return s ? s.saddleTime : 135;
  });

  // Production Ride State
  const [isRecording, setIsRecording] = useState<boolean>(() => {
    const s = loadActiveSession();
    return s ? true : false;
  });
  const [isPaused, setIsPaused] = useState<boolean>(() => {
    const s = loadActiveSession();
    return s ? (s.status === 'paused') : false;
  });
  const [isAutoPaused, setIsAutoPaused] = useState<boolean>(false);
  const [timeElapsed, setTimeElapsed] = useState<number>(() => {
    const s = loadActiveSession();
    return s ? s.ridingTime : 135;
  });
  const [distanceTraveled, setDistanceTraveled] = useState<number>(() => {
    const s = loadActiveSession();
    return s ? s.distanceMeters : 450;
  });
  const [speed, setSpeed] = useState<number>(18.9);
  const [maxSpeed, setMaxSpeed] = useState<number>(() => {
    const s = loadActiveSession();
    return s ? s.maxSpeedKmh : 18.9;
  });
  const [currentElevation, setCurrentElevation] = useState<number>(187);
  const [totalAscent, setTotalAscent] = useState<number>(() => {
    const s = loadActiveSession();
    return s ? s.totalAscentMeters : 32;
  });
  const [currentGrade, setCurrentGrade] = useState<number>(4.0);
  const [currentHeading, setCurrentHeading] = useState<number>(45);

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
  const [liveBreadcrumbs, setLiveBreadcrumbs] = useState<{ lat: number; lng: number }[]>(() => {
    const s = loadActiveSession();
    return s && s.breadcrumbs ? s.breadcrumbs : [];
  });

  // GPS Device Status
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>({
    hasFix: true,
    accuracy: 4,
    quality: 'GPS 3D'
  });

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
  const [isFlutterModalOpen, setIsFlutterModalOpen] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasDismissedPromptRef = useRef<boolean>(false);
  const prevClimbInRef = useRef<boolean>(false);
  const lastAltRef = useRef<number>(187);

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
    setWeatherLoading(true);
    try {
      const data = await fetchLiveWeather(lat, lng);
      setWeather(data);
    } catch {
      // weatherService already falls back gracefully
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

  // Weather poll every 15 minutes from live GPS coords
  useEffect(() => {
    if (!currentCoords.lat || !currentCoords.lng) return;
    fetchWeather(currentCoords.lat, currentCoords.lng);
    const interval = setInterval(() => {
      fetchWeather(currentCoords.lat, currentCoords.lng);
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [currentCoords.lat, currentCoords.lng]);

  // Subscribe to real BLE hardware streams
  useEffect(() => {
    const unsub = bleManager.subscribe(data => {
      if (data.heartRate !== undefined) setHeartRate(data.heartRate);
      if (data.cadence !== undefined) setCadence(data.cadence);
      if (data.speed !== undefined) setSpeed(data.speed);
      if (data.power !== undefined) setPower(data.power);
    });
    return unsub;
  }, []);

  // Immediate One-Shot Geolocation Acquisition on Mount
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, altitude, accuracy, heading } = pos.coords;
          const coords = { lat: latitude, lng: longitude };
          setCurrentCoords(coords);
          try {
            localStorage.setItem('magene-last-known-gps', JSON.stringify(coords));
          } catch {}
          if (altitude && altitude > 0) setCurrentElevation(Math.round(altitude));
          if (heading && !isNaN(heading)) setCurrentHeading(heading);
          setGpsStatus({
            hasFix: true,
            accuracy: accuracy || 4,
            quality: (accuracy || 10) <= 10 ? 'GPS 3D' : 'GPS 2D'
          });
        },
        (err) => {
          console.warn('Initial geolocation:', err.message);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  }, []);

  // Real Production GPS Tracker with Auto-Pause (<0.5 km/h for >5s) and Auto-Resume
  useEffect(() => {
    setGpsStatus(prev => ({ ...prev, quality: 'Searching...' }));

    const success = gpsService.startTracking(
      (fix: GpsFix, deltaDist: number, instantGrade: number) => {
        setGpsStatus({
          hasFix: true,
          accuracy: fix.accuracy,
          quality: fix.accuracy <= 10 ? 'GPS 3D' : 'GPS 2D'
        });

        setCurrentCoords({ lat: fix.lat, lng: fix.lng });
        try {
          localStorage.setItem('magene-last-known-gps', JSON.stringify({ lat: fix.lat, lng: fix.lng }));
        } catch {}
        setCurrentHeading(fix.heading);
        setSlidingVam(fix.vam ?? gpsService.getSlidingVam());

        // Speed from GPS if BLE speed sensor is not connected
        if (!bleStatus.cscConnected) {
          setSpeed(fix.speedKmh);
          if (isRecording) {
            setMaxSpeed(prev => Math.max(prev, fix.speedKmh));
          }
        }

        // If not currently recording and rider is moving, prompt to start activity
        if (!isRecording && !activeSession && !hasDismissedPromptRef.current) {
          if (fix.speedKmh >= 1.0) {
            setShowStartPrompt(true);
          }
        }

        // Record live path breadcrumb if recording and moving
        if (isRecording && !isPaused && deltaDist > 0) {
          setLiveBreadcrumbs(prev => [...prev.slice(-400), { lat: fix.lat, lng: fix.lng }]);
          setDistanceTraveled(prev => prev + deltaDist);
        }

        // Elevation and smoothed grade
        if (fix.altitude > 0) {
          setCurrentElevation(Math.round(fix.altitude));
          if (isRecording && !isPaused && fix.altitude > lastAltRef.current) {
            setTotalAscent(prev => prev + (fix.altitude - lastAltRef.current));
          }
          lastAltRef.current = fix.altitude;
        }

        setCurrentGrade(instantGrade);
      },
      (err: string) => {
        setGpsStatus({
          hasFix: false,
          accuracy: 0,
          quality: 'Error',
          errorMessage: err
        });
      },
      // Auto-Pause & Auto-Resume callback: called when speed < 0.5 km/h for >5 seconds or movement detected
      (autoPaused: boolean) => {
        if (!isRecording) return;
        setIsAutoPaused(autoPaused);
        setIsPaused(autoPaused);
        if (autoPaused) {
          bikeBeeper.beep(1800, 0.1);
        } else {
          bikeBeeper.beep(2600, 0.1);
        }
      },
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
      gpsService.stopTracking();
    };
  }, [isRecording, isPaused, bleStatus.cscConnected, activeSession, batterySaver]);

  // Prompt rider on initial GPS fix if no activity is running
  useEffect(() => {
    if (!isRecording && !activeSession && !hasDismissedPromptRef.current && gpsStatus.hasFix) {
      const timer = setTimeout(() => {
        if (!isRecording && !activeSession && !hasDismissedPromptRef.current) {
          setShowStartPrompt(true);
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [gpsStatus.hasFix, isRecording, activeSession]);

  // Dual Timers: Saddle Time ticks always while recording; Riding Time ticks only when moving
  useEffect(() => {
    if (!isRecording) return;

    const timer = setInterval(() => {
      setSaddleTime(prev => prev + 1);
      if (!isPaused) {
        setRidingTime(prev => prev + 1);
        setTimeElapsed(prev => prev + 1);
      }
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

      // Audio & Haptic alert on the Magene display
      bikeBeeper.lapChime();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([120, 80, 120]);
      }

      // Hide toast after 4.5 seconds
      const timer = setTimeout(() => {
        setLatestLapAlert(null);
      }, 4500);

      return () => clearTimeout(timer);
    }
  }, [distanceTraveled, isRecording, autoLapDistance, lastLapDistance, lapCount, lastLapTime, ridingTime, timeElapsed]);

  // Continuous Auto-Save to LocalStorage every 5 seconds
  useEffect(() => {
    if (!activeSession || !isRecording) return;

    const interval = setInterval(() => {
      const updated: ActiveRideSession = {
        ...activeSession,
        ridingTime,
        saddleTime,
        distanceMeters: distanceTraveled,
        totalAscentMeters: totalAscent,
        maxSpeedKmh: maxSpeed,
        avgSpeedKmh: metrics.avgSpeed,
        currentElevation,
        currentGrade,
        vam: metrics.vam,
        calories: metrics.calories,
        breadcrumbs: liveBreadcrumbs.slice(-400),
        updatedAt: Date.now(),
        status: isPaused ? 'paused' : 'recording'
      };
      saveActiveSession(updated);
    }, 5000);

    return () => clearInterval(interval);
  }, [activeSession, isRecording, isPaused, ridingTime, saddleTime, distanceTraveled, totalAscent, maxSpeed, currentElevation, currentGrade, liveBreadcrumbs]);

  // Current RoutePoint: ALWAYS reflects the rider's true live GPS coordinates
  const currentPoint = useMemo<RoutePoint>(() => {
    return {
      lat: currentCoords.lat,
      lng: currentCoords.lng,
      ele: currentElevation,
      distFromStart: distanceTraveled,
      grade: currentGrade,
      heading: currentHeading
    };
  }, [currentCoords, currentElevation, distanceTraveled, currentGrade, currentHeading]);

  // ClimbPro Live Calculation
  const climbState = useMemo(() => {
    return calculateClimbProLiveState(
      distanceTraveled,
      activeRoute ? activeRoute.climbs : [],
      currentElevation,
      currentGrade
    );
  }, [distanceTraveled, activeRoute, currentElevation, currentGrade]);

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
      currentElevation,
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
    bikeBeeper.beep(2600, 0.12);
  };

  // Actions
  const handleToggleStartPause = () => {
    if (!isRecording) {
      handleStartNewActivity();
    } else {
      const nextPaused = !isPaused;
      setIsPaused(nextPaused);
      if (!nextPaused) setIsAutoPaused(false);
      bikeBeeper.beep(nextPaused ? 1800 : 2600, 0.08);

      if (activeSession) {
        saveActiveSession({
          ...activeSession,
          status: nextPaused ? 'paused' : 'recording',
          updatedAt: Date.now()
        });
      }
    }
  };

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

    setTimeout(() => {
      setLatestLapAlert(null);
    }, 4500);
  };

  // Stop / Finish Activity - Prompts RideSummaryModal with Save, Resume, and Discard
  const handleStopActivity = () => {
    setIsPaused(true);
    setIsRideSummaryOpen(true);
    bikeBeeper.beep(1800, 0.1);
  };

  const handleSaveActivity = (customTitle?: string) => {
    const finalMoving = ridingTime || timeElapsed;
    const finalSaddle = saddleTime || timeElapsed;

    saveRideToHistory({
      routeName: customTitle || activeSession?.routeName || activeRoute?.name || 'Free Ride (Live GPS)',
      timeElapsed: finalMoving,
      ridingTimeSeconds: finalMoving,
      saddleTimeSeconds: finalSaddle,
      distanceMeters: distanceTraveled,
      totalAscentMeters: totalAscent,
      avgSpeedKmh: metrics.avgSpeed,
      maxSpeedKmh: metrics.maxSpeed,
      calories: metrics.calories,
      avgPowerWatts: power,
      breadcrumbs: liveBreadcrumbs
    });

    clearActiveSession();
    setActiveSession(null);
    setIsRecording(false);
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
    setRideHistory(loadRideHistory());
    setIsRideSummaryOpen(false);
    bikeBeeper.beep(2600, 0.15);
  };

  const handleResumeFromSummary = () => {
    setIsRideSummaryOpen(false);
    setIsPaused(false);
    setIsAutoPaused(false);
    bikeBeeper.beep(2600, 0.08);
  };

  const handleDiscardActivity = () => {
    clearActiveSession();
    setActiveSession(null);
    setIsRecording(false);
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
    setIsRideSummaryOpen(false);
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

  // Clear active route to return to pure Free Ride mode
  const handleClearRoute = () => {
    setSelectedRouteId(null);
    bikeBeeper.beep(2000, 0.05);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseGpxRoute(text, file.name);
        setRoutes(prev => [parsed, ...prev.filter(r => r.id !== parsed.id)]);
        setSelectedRouteId(parsed.id);
        setDistanceTraveled(0);
        setTimeElapsed(0);
        bikeBeeper.climbAlert();
        setIsMenuDrawerOpen(false);
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
      setSelectedRouteId(customRoute.id);
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
      
      {/* 100% PHONE SCREEN VIEWPORT: PURE MAGENE C706 SCREEN */}
      <div className="w-full h-full max-w-lg flex flex-col justify-between relative bg-white">
        <MageneDevice
          metrics={metrics}
          climbState={climbState}
          currentPoint={currentPoint}
          routePoints={activeRoute ? activeRoute.points : []}
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
          weather={weather}
          weatherLoading={weatherLoading}
          batterySaver={batterySaver}
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
                      MAGENE C706 MENU
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
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-zinc-400 uppercase font-bold">CUSTOM ROUTE LOADED</span>
                          <span className="text-[10px] text-blue-400 font-bold">{(activeRoute.totalDistance / 1000).toFixed(1)} km</span>
                        </div>
                        <div className="font-bold text-white text-sm mt-1 truncate">
                          {activeRoute.name}
                        </div>
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
                          Your live GPS location is tracked directly on the map. No preloaded courses or fixed routes are overriding your screen.
                        </p>
                      </div>
                    )}
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
                      Automatically marks laps with dual-tone Magene beeper chime & haptic alert at configured distance splits.
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

                    <button
                      onClick={() => {
                        setIsMenuDrawerOpen(false);
                        setIsFlutterModalOpen(true);
                      }}
                      className="w-full p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-2.5 text-left font-sports font-bold transition-all shadow-md"
                    >
                      <Code2 className="w-4 h-4" />
                      <div>
                        <div>Flutter Mobile Source Code</div>
                        <div className="text-[10px] text-blue-200 font-normal">iOS & Android production files</div>
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
                              <span className="truncate pr-2">{ride.routeName}</span>
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

                            <div className="mt-2.5 pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-1.5 text-[10px]">
                              <button
                                onClick={() => {
                                  exportRideToGpx({
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
                                }}
                                className="flex-1 py-1 px-2 rounded-md bg-zinc-800 hover:bg-blue-900/50 hover:text-blue-300 border border-zinc-700 text-zinc-300 font-sports font-bold transition-colors flex items-center justify-center gap-1"
                                title="Export Strava GPX 1.1 file"
                              >
                                <Download className="w-2.5 h-2.5 text-blue-400" />
                                <span>GPX</span>
                              </button>

                              <button
                                onClick={() => {
                                  exportRideToJson({
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

                  {/* Strava Connect */}
                  <div className="bg-zinc-850 p-3 rounded-xl border border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white uppercase text-xs flex items-center gap-1.5">
                        <Share2 className="w-4 h-4 text-orange-500" />
                        Strava
                      </span>
                      <span className={`text-[10px] font-bold ${stravaConnected ? 'text-emerald-400' : 'text-zinc-500'}`}>
                        {stravaConnected ? 'Connected' : 'Not connected'}
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
                        onClick={startStravaConnect}
                        className="w-full py-1.5 rounded-lg bg-[#FC4C02] text-white font-bold text-[11px]"
                      >
                        Connect with Strava
                      </button>
                    )}
                    <p className="text-[10px] text-zinc-400">
                      Requires Express OAuth server (`npm run dev:server`) and Strava API credentials.
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

      {/* Sensor Pairing, Manual Climb, Flutter, Ride Summary & Start Activity Modals (Portaled to body at z-[99999]) */}
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
            isOpen={showStartPrompt && !isRecording && !activeSession}
            activeRoute={activeRoute}
            onStart={() => {
              setShowStartPrompt(false);
              handleStartNewActivity();
            }}
            onDismiss={() => {
              setShowStartPrompt(false);
              hasDismissedPromptRef.current = true;
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

          <FlutterArchitectureModal
            isOpen={isFlutterModalOpen}
            onClose={() => setIsFlutterModalOpen(false)}
          />
        </>,
        document.body
      )}
    </div>
  );
}
