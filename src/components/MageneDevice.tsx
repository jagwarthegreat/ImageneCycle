import React, { useState } from 'react';
import { GpsMapView } from './GpsMapView';
import { ClimbProElevationChart } from './ClimbProElevationChart';
import { WeatherBadge } from './WeatherBadge';
import { 
  Heart, 
  Zap, 
  Activity, 
  Navigation, 
  Mountain, 
  Sun, 
  Moon, 
  Volume2, 
  VolumeX, 
  Bluetooth, 
  Battery, 
  TrendingUp, 
  ChevronLeft, 
  ChevronRight,
  Menu,
  Flag,
  RotateCcw,
  Square
} from 'lucide-react';

import { RoutePoint, RideMetrics, ClimbProLiveState, BleDeviceStatus, GpsStatus, AutoLapAlert } from '../types/cycling';
import { WeatherData } from '../services/weatherService';

interface MageneDeviceProps {
  metrics: RideMetrics;
  climbState: ClimbProLiveState;
  currentPoint: RoutePoint;
  routePoints?: RoutePoint[];
  bleStatus: BleDeviceStatus;
  gpsStatus: GpsStatus;
  onPageChange?: (page: number) => void;
  onLap?: () => void;
  onStartPause?: () => void;
  onStopRide?: () => void;
  onResetRide?: () => void;
  isPlaying: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenSensorModal: () => void;
  onOpenMenuDrawer: () => void;
  liveBreadcrumbs?: { lat: number; lng: number }[];
  routeName?: string;
  onLocateMe?: () => void;
  latestLapAlert?: AutoLapAlert | null;
  weather?: WeatherData | null;
  weatherLoading?: boolean;
  batterySaver?: boolean;
}

export const MageneDevice: React.FC<MageneDeviceProps> = ({
  metrics,
  climbState,
  currentPoint,
  routePoints = [],
  bleStatus,
  gpsStatus,
  onLap,
  onStartPause,
  onStopRide,
  onResetRide,
  isPlaying,
  soundEnabled,
  onToggleSound,
  onOpenSensorModal,
  onOpenMenuDrawer,
  liveBreadcrumbs = [],
  routeName,
  onLocateMe,
  latestLapAlert,
  weather = null,
  weatherLoading = false,
  batterySaver = false
}) => {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  // Format time MM:SS or HH:MM:SS
  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `00:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleNextPage = () => {
    setCurrentPage(prev => (prev % 5) + 1);
  };

  const handlePrevPage = () => {
    setCurrentPage(prev => (prev === 1 ? 5 : prev - 1));
  };

  const distRemainKm = (climbState.distRemainingToTop / 1000).toFixed(2);
  const remAscentM = Math.round(climbState.remAscent);

  return (
    <div className="w-full h-screen h-[100dvh] flex flex-col justify-between overflow-hidden bg-white select-none">
      
      {/* 1. TOP DEVICE STATUS BAR: GPS, SENSORS, PAGE, BATTERY & MENU TRIGGER */}
      <div className={`h-8 px-3 flex items-center justify-between text-[11px] font-mono-digital shrink-0 ${
        isDarkMode ? 'bg-zinc-950 text-zinc-300 border-b border-zinc-800' : 'bg-zinc-100 text-zinc-700 border-b border-zinc-200'
      }`}>
        <div className="flex items-center gap-2">
          {/* Menu Drawer Button */}
          <button
            onClick={onOpenMenuDrawer}
            className="p-1 -ml-1 rounded hover:bg-zinc-200/80 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors"
            title="Menu & Routes"
          >
            <Menu className="w-4 h-4" />
          </button>

          {/* Active Session REC / PAUSE Indicator */}
          {metrics.activeSessionId ? (
            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-sports font-bold tracking-wider uppercase ${
              isPlaying
                ? 'bg-rose-500/20 text-rose-500 border border-rose-500/30'
                : 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                isPlaying ? 'bg-rose-500 animate-pulse' : 'bg-amber-500'
              }`} />
              <span>{isPlaying ? 'REC' : 'PAUSED'}</span>
            </div>
          ) : null}

          {/* GPS Quality Status */}
          <span className={`flex items-center gap-1 font-bold ${
            gpsStatus.quality === 'GPS 3D' ? 'text-emerald-600' :
            gpsStatus.quality === 'GPS 2D' ? 'text-blue-600' :
            gpsStatus.quality === 'Searching...' ? 'text-amber-500 animate-pulse' :
            'text-zinc-400'
          }`}>
            <Navigation className="w-3 h-3 fill-current" />
            <span>{gpsStatus.quality}</span>
            {gpsStatus.hasFix && gpsStatus.accuracy < 50 && (
              <span className="text-[10px] opacity-75 font-mono">({Math.round(gpsStatus.accuracy)}m)</span>
            )}
          </span>

          {/* BLE Hardware Status Icon */}
          <button 
            onClick={onOpenSensorModal}
            className="flex items-center gap-0.5 hover:text-blue-500 transition-colors ml-1"
            title="Bluetooth Sensors"
          >
            <Bluetooth className={`w-3.5 h-3.5 ${bleStatus.hrmConnected || bleStatus.cscConnected || bleStatus.powerConnected ? 'text-blue-600' : 'text-zinc-400'}`} />
            {bleStatus.hrmConnected && <Heart className="w-2.5 h-2.5 text-red-500 fill-current" />}
            {bleStatus.powerConnected && <Zap className="w-2.5 h-2.5 text-amber-500 fill-current" />}
          </button>
        </div>

        {/* Page Switcher, Weather & Battery */}
        <div className="flex items-center gap-2">
          {/* Live GPS Weather Condition Indicator */}
          <WeatherBadge
            weather={weather}
            loading={weatherLoading}
            isDarkMode={isDarkMode}
          />

          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
            title="Toggle Day/Night"
          >
            {isDarkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-zinc-500" />}
          </button>

          {/* Screen Page Indicator */}
          <div className="flex items-center gap-1">
            <button onClick={handlePrevPage} className="p-0.5 hover:text-blue-500">
              <ChevronLeft className="w-3 h-3" />
            </button>
            <span className="font-sports font-bold text-[11px] text-zinc-500">P{currentPage}/5</span>
            <button onClick={handleNextPage} className="p-0.5 hover:text-blue-500">
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="flex items-center gap-1 pl-1">
            <Battery className="w-3.5 h-3.5 text-emerald-500 fill-current" />
            <span className="text-[10px]">94%</span>
          </div>
        </div>
      </div>

      {/* AUTO-LAP CELEBRATION TOAST OVERLAY */}
      {latestLapAlert && (
        <div className="absolute top-10 left-3 right-3 z-[650] animate-in slide-in-from-top-3 fade-in duration-200 shadow-2xl">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl p-2.5 border-2 border-white/80 shadow-lg flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-white/20 flex flex-col items-center justify-center font-digital font-bold leading-none">
                <span className="text-[9px] uppercase font-sports">LAP</span>
                <span className="text-sm">{latestLapAlert.lapNumber}</span>
              </div>
              <div>
                <div className="font-sports font-bold text-xs uppercase tracking-wider text-blue-100 flex items-center gap-1.5">
                  <span className="bg-white/25 px-1.5 py-0.2 rounded text-[9px]">AUTO LAP</span>
                  <span>{(latestLapAlert.lapDistanceMeters / 1000).toFixed(1)} KM</span>
                </div>
                <div className="text-[11px] font-digital font-bold text-white mt-0.5">
                  Split: {formatTime(latestLapAlert.splitTimeSeconds)} • Avg: {latestLapAlert.avgSpeedKmh.toFixed(1)} km/h
                </div>
              </div>
            </div>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping mr-1" />
          </div>
        </div>
      )}

      {/* 2. MAIN SCREEN CONTENT: 100% PURE MAGENE C706 DISPLAY */}
      <div className={`flex-1 flex flex-col justify-between overflow-hidden ${isDarkMode ? 'bg-black text-white' : 'bg-white text-zinc-950'}`}>
        
        {/* PAGE 1: EXACT MAGENE C706 SCREENSHOT REPLICA */}
        {currentPage === 1 && (
          <div className="flex-1 flex flex-col justify-between overflow-hidden">
            {/* Top Row: Dual Ride Duration Timers (Riding Time Primary, Saddle Time Secondary) */}
            <div className={`py-1.5 text-center shrink-0 border-b ${isDarkMode ? 'border-zinc-800 bg-zinc-950' : 'border-zinc-200 bg-white'}`}>
              <div className="font-digital text-[36px] sm:text-[42px] font-bold tracking-tight leading-none">
                {formatTime(metrics.ridingTime || metrics.timeElapsed)}
              </div>
              <div className="flex items-center justify-center gap-2 mt-1 text-[10px] font-mono text-zinc-400">
                <span className="font-sports font-bold text-[9px] uppercase tracking-wider text-emerald-500">RIDING TIME</span>
                <span>•</span>
                <span>SADDLE: {formatTime(metrics.saddleTime || metrics.timeElapsed)}</span>
              </div>
            </div>

            {/* Second Row: DIST.REMAIN vs TOTAL DIST and REM. ASCENT vs TOTAL ASCENT */}
            {(() => {
              const hasActiveRoute = routePoints && routePoints.length > 1;
              return (
                <div className={`grid grid-cols-2 divide-x border-b py-1.5 px-3 shrink-0 ${
                  isDarkMode ? 'divide-zinc-800 border-zinc-800 bg-zinc-950' : 'divide-zinc-200 border-zinc-200 bg-white'
                }`}>
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] sm:text-[11px] font-sports font-semibold tracking-wider text-zinc-400 uppercase">
                      {hasActiveRoute ? 'DIST.REMAIN' : 'TOTAL DIST'}
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="font-digital text-[26px] sm:text-[30px] font-bold leading-none">
                        {hasActiveRoute ? distRemainKm : (metrics.distanceTraveled / 1000).toFixed(2)}
                      </span>
                      <span className="font-sports font-bold text-[12px] text-zinc-500">
                        km
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-center">
                    <span className="text-[10px] sm:text-[11px] font-sports font-semibold tracking-wider text-zinc-400 uppercase">
                      {hasActiveRoute ? 'REM. ASCENT' : 'TOTAL ASCENT'}
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="font-digital text-[26px] sm:text-[30px] font-bold leading-none">
                        {hasActiveRoute ? remAscentM : Math.round(metrics.totalAscent)}
                      </span>
                      <span className="font-sports font-bold text-[12px] text-zinc-500">
                        m
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Middle Section: Full Leaflet GPS Map Navigation with Cached Tiles & Route Polyline */}
            <div className="relative flex-1 w-full min-h-[160px] border-b border-zinc-200 overflow-hidden">
              <GpsMapView
                currentPoint={currentPoint}
                routePoints={routePoints}
                heading={metrics.currentHeading}
                isDarkMode={isDarkMode}
                liveBreadcrumbs={liveBreadcrumbs}
                routeName={routeName}
                onLocateMe={onLocateMe}
                batterySaver={batterySaver}
              />
            </div>

            {/* ClimbPro Section: Elevation Profile, Progress & AVG GRADE REMAIN. */}
            <div className="w-full shrink-0">
              <ClimbProElevationChart
                climb={climbState.currentClimb || climbState.nextClimb}
                currentDist={metrics.distanceTraveled}
                currentGrade={metrics.currentGrade}
                avgGradeRemaining={climbState.avgGradeRemaining}
                isDarkMode={isDarkMode}
              />
            </div>

            {/* Auto-Pause Floating Banner if active */}
            {metrics.isAutoPaused && (
              <div className="bg-amber-500 text-black font-sports font-bold text-xs py-1 px-3 flex items-center justify-center gap-1.5 animate-pulse z-[450] shadow-md border-b border-amber-600">
                <span className="w-2 h-2 rounded-full bg-black" />
                <span>AUTO-PAUSED (Speed &lt; 0.5 km/h) • Moving will auto-resume</span>
              </div>
            )}

            {/* Bottom Row: ELEVATION m and SPEED km/h + Power Zone Indicator */}
            <div className={`grid grid-cols-2 divide-x border-t py-1.5 sm:py-2 px-3 shrink-0 ${
              isDarkMode ? 'divide-zinc-800 border-zinc-800 bg-zinc-950' : 'divide-zinc-200 border-zinc-200 bg-white'
            }`}>
              <div className="flex flex-col items-center">
                <div className="flex items-baseline gap-1">
                  <span className="text-[10px] sm:text-[11px] font-sports font-semibold tracking-wider text-zinc-400 uppercase">
                    ELEVATION
                  </span>
                  <span className="text-[10px] font-sports text-zinc-400">m</span>
                </div>
                <span className="font-digital text-[32px] sm:text-[36px] font-bold leading-none mt-0.5">
                  {Math.round(metrics.currentElevation)}
                </span>
                {/* Secondary metric: VAM */}
                <span className="text-[10px] font-mono text-zinc-400 mt-1">
                  VAM: {metrics.vam} m/h
                </span>
              </div>

              <div className="flex flex-col items-center relative">
                <div className="flex items-baseline gap-1">
                  <span className="text-[10px] sm:text-[11px] font-sports font-semibold tracking-wider text-zinc-400 uppercase">
                    SPEED
                  </span>
                  <span className="text-[10px] font-sports text-zinc-400">km/h</span>
                </div>
                <span className="font-digital text-[32px] sm:text-[36px] font-bold leading-none mt-0.5">
                  {metrics.speed.toFixed(1)}
                </span>
                
                {/* Real-Time Power Zone Indicator Bar (based on user FTP) */}
                <div className="flex flex-col items-center mt-1 w-full max-w-[120px]">
                  <div
                    className="w-14 h-1.5 rounded-full transition-colors duration-300"
                    style={{ backgroundColor: metrics.powerZoneColor || '#2563eb' }}
                  />
                  {metrics.powerZone ? (
                    <span
                      className="text-[9px] font-bold mt-0.5 font-sports uppercase tracking-tight"
                      style={{ color: metrics.powerZoneColor || '#2563eb' }}
                    >
                      {metrics.powerZoneName} ({metrics.power}W)
                    </span>
                  ) : (
                    <span className="text-[9px] font-sports text-zinc-400 mt-0.5">
                      FTP: {metrics.ftp}W
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PAGE 2: DEDICATED FULL CLIMBPRO HUD */}
        {currentPage === 2 && (
          <div className={`flex-1 flex flex-col justify-between p-3.5 overflow-y-auto ${isDarkMode ? 'bg-zinc-950' : 'bg-white'}`}>
            <div className="flex items-center justify-between border-b pb-2 border-zinc-200/80">
              <div className="flex items-center gap-2">
                <Mountain className="w-5 h-5 text-blue-600" />
                <div>
                  <div className="text-[10px] font-sports font-bold tracking-wider text-zinc-400 uppercase">
                    {climbState.isInClimb ? `CLIMB ${climbState.currentClimbIndex}/${climbState.totalClimbsCount}` : 'UPCOMING CLIMB'}
                  </div>
                  <div className="font-sports font-bold text-base sm:text-lg leading-tight">
                    {climbState.currentClimb?.name || climbState.nextClimb?.name || 'Climb Sector'}
                  </div>
                </div>
              </div>
              <span className="bg-blue-600 text-white font-digital font-bold px-2 py-0.5 rounded text-xs">
                Cat {climbState.currentClimb?.category || climbState.nextClimb?.category || '4'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 my-2">
              <div className={`border rounded-xl p-2 flex flex-col items-center ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                <span className="text-[9px] font-sports font-bold text-zinc-400 uppercase">DIST. REMAIN</span>
                <span className="font-digital text-xl sm:text-2xl font-bold">{distRemainKm} <span className="text-xs">km</span></span>
              </div>
              <div className={`border rounded-xl p-2 flex flex-col items-center ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                <span className="text-[9px] font-sports font-bold text-zinc-400 uppercase">REM. ASCENT</span>
                <span className="font-digital text-xl sm:text-2xl font-bold">{remAscentM} <span className="text-xs">m</span></span>
              </div>
              <div className={`border rounded-xl p-2 flex flex-col items-center ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                <span className="text-[9px] font-sports font-bold text-zinc-400 uppercase">AVG GRADE REM.</span>
                <span className="font-digital text-xl sm:text-2xl font-bold text-blue-600">{climbState.avgGradeRemaining.toFixed(1)}%</span>
              </div>
              <div className={`border rounded-xl p-2 flex flex-col items-center ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                <span className="text-[9px] font-sports font-bold text-zinc-400 uppercase">CURRENT GRADE</span>
                <span className="font-digital text-xl sm:text-2xl font-bold text-emerald-600">{metrics.currentGrade.toFixed(1)}%</span>
              </div>
            </div>

            <div className="border border-zinc-200 rounded-xl overflow-hidden shadow-xs my-1">
              <ClimbProElevationChart
                climb={climbState.currentClimb || climbState.nextClimb}
                currentDist={metrics.distanceTraveled}
                currentGrade={metrics.currentGrade}
                avgGradeRemaining={climbState.avgGradeRemaining}
                isDarkMode={isDarkMode}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 border-t pt-2 border-zinc-200/80">
              <div className="text-center">
                <span className="text-[10px] font-sports text-zinc-400 uppercase">VAM ASCENT RATE</span>
                <div className="font-digital text-lg sm:text-xl font-bold">{metrics.vam} <span className="text-xs text-zinc-500">m/h</span></div>
              </div>
              <div className="text-center">
                <span className="text-[10px] font-sports text-zinc-400 uppercase">TOTAL GAIN</span>
                <div className="font-digital text-lg sm:text-xl font-bold">{Math.round(metrics.totalAscent)} <span className="text-xs text-zinc-500">m</span></div>
              </div>
            </div>
          </div>
        )}

        {/* PAGE 3: 8-GRID HIGH VISIBILITY HUD */}
        {currentPage === 3 && (
          <div className={`flex-1 flex flex-col divide-y overflow-y-auto ${isDarkMode ? 'divide-zinc-800 bg-zinc-950' : 'divide-zinc-200 bg-white'}`}>
            <div className={`py-2 px-3 text-center ${isDarkMode ? 'bg-zinc-900/50' : 'bg-zinc-50/50'}`}>
              <span className="text-[10px] font-sports font-bold text-zinc-400 tracking-wider uppercase">SPEED km/h</span>
              <div className="font-digital text-[42px] sm:text-[48px] font-bold leading-none">
                {metrics.speed.toFixed(1)}
              </div>
            </div>

            <div className="grid grid-cols-2 divide-x divide-zinc-200 py-2 px-3">
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-sports font-bold text-zinc-400 uppercase flex items-center gap-1">
                  <Heart className="w-3 h-3 text-red-500 fill-current" /> HEART RATE
                </span>
                <span className="font-digital text-[28px] sm:text-[32px] font-bold leading-none mt-1">
                  {metrics.heartRate !== null ? metrics.heartRate : '--'} <span className="text-xs text-zinc-400">bpm</span>
                </span>
                {metrics.hrZone ? (
                  <div className="mt-1 flex flex-col items-center">
                    <span
                      className="text-[9px] font-sports font-bold px-1.5 py-0.5 rounded text-white"
                      style={{ backgroundColor: metrics.hrZoneColor || '#ef4444' }}
                    >
                      {metrics.hrZoneName}
                    </span>
                    <div className="flex items-center gap-0.5 mt-1">
                      {[1, 2, 3, 4, 5].map(z => (
                        <div
                          key={z}
                          className={`w-2.5 h-1 rounded-full ${
                            metrics.hrZone === z ? 'scale-y-125' : 'opacity-25'
                          }`}
                          style={{
                            backgroundColor:
                              z === 1 ? '#94a3b8' :
                              z === 2 ? '#3b82f6' :
                              z === 3 ? '#22c55e' :
                              z === 4 ? '#eab308' :
                              '#ef4444'
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <span className="text-[9px] font-sports text-zinc-400 mt-1">
                    Max {metrics.maxHeartRate ?? 190} · Rest {metrics.restingHeartRate ?? 60}
                  </span>
                )}
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-sports font-bold text-zinc-400 uppercase flex items-center gap-1">
                  <Activity className="w-3 h-3 text-blue-500" /> CADENCE
                </span>
                <span className="font-digital text-[28px] sm:text-[32px] font-bold leading-none mt-1">
                  {metrics.cadence !== null ? metrics.cadence : '--'} <span className="text-xs text-zinc-400">rpm</span>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 divide-x divide-zinc-200 py-2 px-3">
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-sports font-bold text-zinc-400 uppercase flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-500 fill-current" /> POWER
                </span>
                <span className="font-digital text-[28px] sm:text-[32px] font-bold leading-none mt-1">
                  {metrics.power !== null ? metrics.power : '--'} <span className="text-xs text-zinc-400">W</span>
                </span>
                {/* Real-time Coggan Power Zone Badge */}
                {metrics.powerZone ? (
                  <div className="mt-1 flex flex-col items-center">
                    <span
                      className="text-[9px] font-sports font-bold px-1.5 py-0.5 rounded text-white"
                      style={{ backgroundColor: metrics.powerZoneColor || '#2563eb' }}
                    >
                      {metrics.powerZoneName}
                    </span>
                    {/* Mini 7-segment power zone track */}
                    <div className="flex items-center gap-0.5 mt-1">
                      {[1, 2, 3, 4, 5, 6, 7].map(z => (
                        <div
                          key={z}
                          className={`w-2.5 h-1 rounded-full ${
                            metrics.powerZone === z
                              ? 'scale-y-125'
                              : 'opacity-25'
                          }`}
                          style={{
                            backgroundColor:
                              z === 1 ? '#94a3b8' :
                              z === 2 ? '#3b82f6' :
                              z === 3 ? '#22c55e' :
                              z === 4 ? '#eab308' :
                              z === 5 ? '#f97316' :
                              z === 6 ? '#ef4444' :
                              '#a855f7'
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <span className="text-[9px] font-sports text-zinc-400 mt-1">
                    FTP: {metrics.ftp}W
                  </span>
                )}
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-sports font-bold text-zinc-400 uppercase flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-emerald-500" /> GRADE
                </span>
                <span className="font-digital text-[28px] sm:text-[32px] font-bold leading-none mt-1">
                  {metrics.currentGrade.toFixed(1)} <span className="text-xs text-zinc-400">%</span>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 divide-x divide-zinc-200 py-2 px-3">
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-sports font-bold text-zinc-400 uppercase">DISTANCE</span>
                <span className="font-digital text-[24px] sm:text-[28px] font-bold leading-none mt-1">
                  {(metrics.distanceTraveled / 1000).toFixed(2)} <span className="text-xs text-zinc-400">km</span>
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-sports font-bold text-zinc-400 uppercase">ELEVATION</span>
                <span className="font-digital text-[24px] sm:text-[28px] font-bold leading-none mt-1">
                  {Math.round(metrics.currentElevation)} <span className="text-xs text-zinc-400">m</span>
                </span>
              </div>
            </div>

            <div className={`grid grid-cols-2 divide-x divide-zinc-200 py-2 px-3 ${isDarkMode ? 'bg-zinc-900/40' : 'bg-zinc-50/40'}`}>
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-sports font-bold text-zinc-400 uppercase">RIDING TIME</span>
                <span className="font-digital text-[20px] font-bold leading-none mt-1 text-emerald-500">
                  {formatTime(metrics.ridingTime || metrics.timeElapsed)}
                </span>
                <span className="text-[9px] font-mono text-zinc-400 mt-0.5">
                  Saddle: {formatTime(metrics.saddleTime || metrics.timeElapsed)}
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-sports font-bold text-zinc-400 uppercase">CALORIES</span>
                <span className="font-digital text-[20px] font-bold leading-none mt-1">
                  {metrics.calories} <span className="text-xs text-zinc-400">kcal</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* PAGE 4: FULLSCREEN TURN-BY-TURN GPS MAP */}
        {currentPage === 4 && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 relative w-full h-full">
              <GpsMapView
                currentPoint={currentPoint}
                routePoints={routePoints}
                heading={metrics.currentHeading}
                isDarkMode={isDarkMode}
                liveBreadcrumbs={liveBreadcrumbs}
                routeName={routeName}
                onLocateMe={onLocateMe}
                batterySaver={batterySaver}
              />
            </div>
          </div>
        )}

        {/* PAGE 5: BLE SENSORS & SYSTEM DIAGNOSTICS */}
        {currentPage === 5 && (
          <div className={`flex-1 flex flex-col justify-between p-3.5 overflow-y-auto ${isDarkMode ? 'bg-zinc-950' : 'bg-zinc-50'}`}>
            <div className="space-y-2.5">
              <div className="font-sports font-bold text-sm border-b pb-1.5 flex items-center justify-between">
                <span>BLE HARDWARE SENSORS</span>
                <button 
                  onClick={onOpenSensorModal}
                  className="text-xs text-blue-600 font-bold"
                >
                  Pair Sensors
                </button>
              </div>

              <div className="space-y-2">
                <div className={`border rounded-lg p-2.5 flex items-center justify-between ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 text-red-500" />
                    <div>
                      <div className="text-xs font-bold">Heart Rate Monitor (0x180D)</div>
                      <div className="text-[10px] text-zinc-400">{bleStatus.hrmDeviceName || 'Not Connected'}</div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${bleStatus.hrmConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>
                    {bleStatus.hrmConnected ? 'Active' : 'Standby'}
                  </span>
                </div>

                <div className={`border rounded-lg p-2.5 flex items-center justify-between ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-500" />
                    <div>
                      <div className="text-xs font-bold">Speed / Cadence (0x1816)</div>
                      <div className="text-[10px] text-zinc-400">{bleStatus.cscDeviceName || 'Not Connected'}</div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${bleStatus.cscConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>
                    {bleStatus.cscConnected ? 'Active' : 'Standby'}
                  </span>
                </div>

                <div className={`border rounded-lg p-2.5 flex items-center justify-between ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <div>
                      <div className="text-xs font-bold">Power Meter (0x1818)</div>
                      <div className="text-[10px] text-zinc-400">{bleStatus.powerDeviceName || 'Not Connected'}</div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${bleStatus.powerConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>
                    {bleStatus.powerConnected ? 'Active' : 'Standby'}
                  </span>
                </div>
              </div>
            </div>

            <div className={`border rounded-lg p-2.5 space-y-2 text-xs mt-3 ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Audio Feedback</span>
                <button
                  onClick={onToggleSound}
                  className="px-2 py-1 bg-zinc-200 dark:bg-zinc-800 rounded font-medium flex items-center gap-1"
                >
                  {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-blue-500" /> : <VolumeX className="w-3.5 h-3.5 text-zinc-400" />}
                  {soundEnabled ? 'Enabled' : 'Muted'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. MINIMAL FULL-WIDTH BOTTOM CONTROL BAR */}
      <div className={`h-12 px-3 flex items-center justify-between gap-2 shrink-0 border-t ${
        isDarkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-100 border-zinc-200'
      }`}>
        {/* LAP Marker */}
        <button
          onClick={onLap}
          className="flex-1 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-[11px] font-sports font-bold tracking-wider uppercase transition-colors shadow-xs flex items-center justify-center gap-1"
        >
          <Flag className="w-3.5 h-3.5 text-zinc-300" />
          <span>LAP</span>
        </button>

        {/* START / PAUSE Main Riding Button */}
        <button
          onClick={onStartPause}
          className={`flex-[1.4] py-2 rounded-lg text-white text-xs font-sports font-bold tracking-wider uppercase transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 ${
            isPlaying ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'
          }`}
        >
          <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-amber-200 animate-pulse' : 'bg-emerald-200'}`} />
          <span>{isPlaying ? 'PAUSE' : (metrics.activeSessionId ? 'RESUME' : 'START RIDE')}</span>
        </button>

        {/* STOP / FINISH ACTIVITY BUTTON */}
        {onStopRide && (isPlaying || metrics.activeSessionId || metrics.timeElapsed > 0 || metrics.distanceTraveled > 0) && (
          <button
            onClick={onStopRide}
            className="flex-1 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white text-[11px] font-sports font-bold tracking-wider uppercase transition-colors shadow-xs flex items-center justify-center gap-1"
            title="Stop and save activity"
          >
            <Square className="w-3 h-3 fill-current" />
            <span>STOP</span>
          </button>
        )}

        {/* NEXT SCREEN PAGE */}
        <button
          onClick={handleNextPage}
          className="flex-1 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-[11px] font-sports font-bold tracking-wider uppercase transition-colors shadow-xs flex items-center justify-center gap-1"
        >
          <span>PAGE</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
