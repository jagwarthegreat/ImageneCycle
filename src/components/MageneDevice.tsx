import React, { useEffect, useState } from 'react';
import { GpsMapView } from './GpsMapView';
import { ClimbProElevationChart } from './ClimbProElevationChart';
import { WeatherBadge } from './WeatherBadge';
import { 
  Heart, 
  Zap, 
  Activity, 
  Mountain, 
  Sun, 
  Moon, 
  Volume2, 
  VolumeX, 
  Bluetooth, 
  TrendingUp, 
  ChevronLeft, 
  ChevronRight,
  Menu,
  Flag,
  RotateCcw,
  Square,
  CornerUpLeft,
  CornerUpRight,
  ArrowUp,
  X
} from 'lucide-react';

import { RoutePoint, RideMetrics, ClimbProLiveState, BleDeviceStatus, GpsStatus, AutoLapAlert, RouteTurn } from '../types/cycling';
import { WeatherData } from '../services/weatherService';
import {
  getRouteRemainingDistanceMeters,
  getRouteRemainingAscentMeters,
  getRouteRemainingAvgGrade,
  getNextTurn
} from '../utils/routeEncode';
import { getRouteElevation } from '../utils/elevationService';
import { calculateGpsSignalBars } from '../utils/gpsSignalBars';

interface MageneDeviceProps {
  metrics: RideMetrics;
  climbState: ClimbProLiveState;
  currentPoint: RoutePoint;
  routePoints?: RoutePoint[];
  routeTurns?: RouteTurn[];
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
  onDismissLapAlert?: () => void;
  weather?: WeatherData | null;
  weatherLoading?: boolean;
  batterySaver?: boolean;
  fitRouteToken?: number;
  /** When false, show OFFLINE chip (weather/Strava unavailable) */
  isOnline?: boolean;
  basemapToken?: number;
  autoCenter?: boolean;
  onToggleAutoCenter?: () => void;
  invertHeading?: boolean;
  onToggleInvertHeading?: () => void;
}

function formatClock24h(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDateWithYear(d: Date): string {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${months[d.getMonth()]} ${d.getDate().toString().padStart(2, '0')} ${d.getFullYear()}`;
}

function NextTurnGlyph({ turn, className = 'w-4 h-4' }: { turn: RouteTurn; className?: string }) {
  const mod = turn.modifier || '';
  const cn = `${className} text-white shrink-0`;
  if (turn.maneuverType === 'arrive') return <Flag className={cn} />;
  if (mod.includes('left')) return <CornerUpLeft className={cn} />;
  if (mod.includes('right')) return <CornerUpRight className={cn} />;
  return <ArrowUp className={cn} />;
}

/** Compact square next-turn cue — bottom-left of map */
function NextTurnSquare({
  cue,
  formatDist
}: {
  cue: NonNullable<ReturnType<typeof getNextTurn>>;
  formatDist: (m: number) => string;
}) {
  return (
    <div className="absolute bottom-2 left-2 z-[450] pointer-events-none">
      <div className="w-[72px] h-[72px] bg-blue-600/95 text-white rounded-xl shadow-lg border border-white/30 flex flex-col items-center justify-between px-1 py-1.5 overflow-hidden">
        <div className="w-7 h-7 rounded-md bg-white/20 flex items-center justify-center shrink-0">
          <NextTurnGlyph turn={cue.turn} className="w-4 h-4" />
        </div>
        <div className="font-digital font-bold text-[11px] leading-none shrink-0 mt-1">
          {formatDist(cue.metersToManeuver)}
        </div>
        <div className="w-full min-h-0 flex-1 overflow-x-auto touch-pan-x overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pointer-events-auto">
          <div className="whitespace-nowrap text-[8px] font-sports font-bold leading-tight text-center px-0.5">
            {cue.turn.instruction}
          </div>
        </div>
      </div>
    </div>
  );
}

export const MageneDevice: React.FC<MageneDeviceProps> = ({
  metrics,
  climbState,
  currentPoint,
  routePoints = [],
  routeTurns = [],
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
  onDismissLapAlert,
  weather = null,
  weatherLoading = false,
  batterySaver = false,
  fitRouteToken = 0,
  isOnline = true,
  basemapToken = 0,
  autoCenter,
  onToggleAutoCenter,
  invertHeading,
  onToggleInvertHeading
}) => {
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setCurrentDate(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const clock24hStr = formatClock24h(currentDate);
  const dateWithYearStr = formatDateWithYear(currentDate);
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

  const hasActiveRoute = routePoints.length > 1;
  // Route-level remain (not climb-only) so 0-climb courses still show directions
  const routeDistRemainM = hasActiveRoute
    ? getRouteRemainingDistanceMeters(routePoints, metrics.distanceTraveled)
    : 0;
  const routeRemAscentM = hasActiveRoute
    ? getRouteRemainingAscentMeters(routePoints, metrics.distanceTraveled)
    : 0;
  const routeAvgGradeRem = hasActiveRoute
    ? getRouteRemainingAvgGrade(routePoints, metrics.distanceTraveled)
    : 0;

  const distRemainKm = hasActiveRoute
    ? (routeDistRemainM / 1000).toFixed(2)
    : (climbState.distRemainingToTop / 1000).toFixed(2);
  const remAscentM = hasActiveRoute ? routeRemAscentM : Math.round(climbState.remAscent);
  const profileAvgGrade =
    climbState.isInClimb || climbState.nextClimb
      ? climbState.avgGradeRemaining
      : hasActiveRoute
      ? routeAvgGradeRem
      : climbState.avgGradeRemaining;

  const displayedElevation = (hasActiveRoute
    ? getRouteElevation(routePoints, metrics.distanceTraveled, { lat: metrics.currentLat, lng: metrics.currentLng })
    : null) ?? metrics.currentElevation;

  const nextTurnCue = getNextTurn(routeTurns, metrics.distanceTraveled);
  const formatTurnDist = (m: number) =>
    m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;

  // 3-Bar GPS Signal Meter:
  // 3 bars: Strong strength (accuracy <= 2.5m or GPS 3D fallback)
  // 2 bars: Moderate strength (2.5m < accuracy <= 5.0m or GPS 2D fallback)
  // 1 bar:  Least strong strength (accuracy > 5.0m or Weak fallback)
  // 0 bars: No fix / Searching
  const { bars: gpsActiveBars, strength: gpsStrength, label: gpsLabel } = calculateGpsSignalBars(gpsStatus);

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

          {/* GPS Quality Status: 2D/3D + 3-Bar Signal Icon */}
          <div
            className={`flex items-center gap-1 font-bold ${
              !gpsStatus.hasFix
                ? 'text-zinc-400'
                : gpsActiveBars === 1
                ? 'text-amber-500'
                : 'text-emerald-500'
            }`}
            title={
              gpsStatus.hasFix
                ? `GPS ${gpsLabel} • ${gpsStrength} (${gpsActiveBars}/3 bars${gpsStatus.accuracy > 0 ? `, ±${Math.round(gpsStatus.accuracy * 10) / 10}m` : ''})`
                : 'Searching for GPS signal...'
            }
            aria-label={`GPS signal: ${gpsStrength} (${gpsActiveBars} of 3 bars)`}
          >
            <span className="font-sports font-bold text-[10px] tracking-wider uppercase">
              {gpsLabel}
            </span>
            <svg
              className={`w-3.5 h-3.5 shrink-0 ${!gpsStatus.hasFix && gpsStatus.quality === 'Searching...' ? 'animate-pulse' : ''}`}
              viewBox="0 0 14 14"
              fill="none"
              aria-label={`GPS signal: ${gpsStrength} (${gpsActiveBars} of 3 bars)`}
            >
              {/* Bar 1: Shortest (height 4px) - 1 bar active is least strong */}
              <rect
                x="1"
                y="9"
                width="3"
                height="4"
                rx="0.75"
                className={
                  gpsActiveBars >= 1
                    ? gpsActiveBars === 1
                      ? 'fill-amber-500'
                      : 'fill-emerald-500'
                    : isDarkMode
                    ? 'fill-zinc-700'
                    : 'fill-zinc-300'
                }
              />
              {/* Bar 2: Medium (height 7px) - 2 bars active is moderate */}
              <rect
                x="5.5"
                y="6"
                width="3"
                height="7"
                rx="0.75"
                className={
                  gpsActiveBars >= 2
                    ? 'fill-emerald-500'
                    : isDarkMode
                    ? 'fill-zinc-700'
                    : 'fill-zinc-300'
                }
              />
              {/* Bar 3: Tallest (height 11px) - 3 bars filled is strong strength */}
              <rect
                x="10"
                y="2"
                width="3"
                height="11"
                rx="0.75"
                className={
                  gpsActiveBars >= 3
                    ? 'fill-emerald-500'
                    : isDarkMode
                    ? 'fill-zinc-700'
                    : 'fill-zinc-300'
                }
              />
            </svg>
          </div>

          {/* BLE Hardware Status Icon */}
          <button 
            onClick={onOpenSensorModal}
            className="flex items-center gap-0.5 hover:text-blue-500 transition-colors ml-1"
            title="Bluetooth Sensors"
          >
            <Bluetooth className={`w-3.5 h-3.5 ${
              bleStatus.hrmConnected || bleStatus.cscConnected || bleStatus.powerConnected
                ? 'text-blue-500'
                : 'text-zinc-400'
            }`} />
            {bleStatus.hrmConnected && <Heart className="w-2.5 h-2.5 text-red-500 fill-current" />}
            {bleStatus.powerConnected && <Zap className="w-2.5 h-2.5 text-amber-500 fill-current" />}
          </button>
        </div>

        {/* Weather, Dark/Night toggle & Page Switcher (Far Right) */}
        <div className="flex items-center gap-2">
          {!isOnline && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-sports font-bold tracking-wider uppercase bg-amber-500/20 text-amber-600 border border-amber-500/40">
              Offline
            </span>
          )}

          <WeatherBadge
            weather={isOnline ? weather : null}
            loading={isOnline && weatherLoading}
            isDarkMode={isDarkMode}
          />

          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
            title="Toggle Day/Night"
          >
            {isDarkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-zinc-500" />}
          </button>

          {/* Page Switcher moved to far right */}
          <div className="flex items-center gap-1 pl-1">
            <button onClick={handlePrevPage} className="p-0.5 hover:text-blue-500" title="Previous page">
              <ChevronLeft className="w-3 h-3" />
            </button>
            <span className="font-sports font-bold text-[11px] text-zinc-500">P{currentPage}/5</span>
            <button onClick={handleNextPage} className="p-0.5 hover:text-blue-500" title="Next page">
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* AUTO-LAP CELEBRATION TOAST OVERLAY (Auto-dismisses in 6s or tap to dismiss) */}
      {latestLapAlert && (
        <div
          onClick={onDismissLapAlert}
          className="absolute top-10 left-3 right-3 z-[650] animate-in slide-in-from-top-3 fade-in duration-200 shadow-2xl cursor-pointer"
          title="Tap to dismiss alert"
        >
          <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white rounded-xl p-2.5 border-2 border-white/80 shadow-lg flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-white/20 flex flex-col items-center justify-center font-digital font-bold leading-none shrink-0">
                <span className="text-[9px] uppercase font-sports">LAP</span>
                <span className="text-sm">{latestLapAlert.lapNumber}</span>
              </div>
              <div>
                <div className="font-sports font-bold text-xs uppercase tracking-wider text-blue-100 flex items-center gap-1.5">
                  <span className="bg-white/25 px-1.5 py-0.5 rounded text-[9px]">AUTO LAP</span>
                  <span>{(latestLapAlert.lapDistanceMeters / 1000).toFixed(1)} KM</span>
                </div>
                <div className="text-[11px] font-digital font-bold text-white mt-0.5">
                  Split: {formatTime(latestLapAlert.splitTimeSeconds)} • Avg: {latestLapAlert.avgSpeedKmh.toFixed(1)} km/h
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismissLapAlert?.();
                }}
                className="p-1 rounded-md bg-white/15 hover:bg-white/25 text-white/90 hover:text-white transition-colors"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. MAIN SCREEN CONTENT: ImageneCycle DISPLAY */}
      <div className={`flex-1 flex flex-col justify-between overflow-hidden ${isDarkMode ? 'bg-black text-white' : 'bg-white text-zinc-950'}`}>
        
        {/* PAGE 1: ImageneCycle MAIN RIDE SCREEN */}
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

            {/* Second Row: DIST.REMAIN vs TOTAL DIST, TIME / DATE (24h + short date), and REM. ASCENT vs TOTAL ASCENT */}
            <div className={`grid grid-cols-3 divide-x border-b py-1.5 px-2 shrink-0 ${
              isDarkMode ? 'divide-zinc-800 border-zinc-800 bg-zinc-950' : 'divide-zinc-200 border-zinc-200 bg-white'
            }`}>
              {/* Col 1: Distance */}
              <div className="flex flex-col items-center justify-center min-w-0">
                <span className="text-[9px] sm:text-[10px] font-sports font-semibold tracking-wider text-zinc-400 uppercase truncate">
                  {hasActiveRoute ? 'DIST.REM' : 'TOT.DIST'}
                </span>
                <div className="flex items-baseline gap-0.5">
                  <span className="font-digital text-[20px] sm:text-[24px] font-bold leading-none tabular-nums">
                    {hasActiveRoute ? distRemainKm : (metrics.distanceTraveled / 1000).toFixed(2)}
                  </span>
                  <span className="font-sports font-bold text-[10px] text-zinc-500">
                    km
                  </span>
                </div>
              </div>

              {/* Col 2: Current Time & Current Date (24h format + Month/Day/Year e.g. OCT 22 2026) */}
              <div className="flex flex-col items-center justify-center min-w-0">
                <span className="text-[9px] sm:text-[10px] font-sports font-semibold tracking-wider text-zinc-400 uppercase truncate">
                  TIME / DATE
                </span>
                <div className="flex flex-col items-center justify-center leading-none mt-0.5">
                  <span className={`font-digital text-[16px] sm:text-[19px] font-bold leading-none tracking-tight tabular-nums ${
                    isDarkMode ? 'text-white' : 'text-zinc-950'
                  }`}>
                    {clock24hStr}
                  </span>
                  <span className={`font-sports font-bold text-[9px] sm:text-[10px] uppercase tracking-wider mt-0.5 whitespace-nowrap ${
                    isDarkMode ? 'text-zinc-400' : 'text-zinc-600'
                  }`}>
                    {dateWithYearStr}
                  </span>
                </div>
              </div>

              {/* Col 3: Ascent */}
              <div className="flex flex-col items-center justify-center min-w-0">
                <span className="text-[9px] sm:text-[10px] font-sports font-semibold tracking-wider text-zinc-400 uppercase truncate">
                  {hasActiveRoute ? 'REM.ASC' : 'TOT.ASC'}
                </span>
                <div className="flex items-baseline gap-0.5">
                  <span className="font-digital text-[20px] sm:text-[24px] font-bold leading-none tabular-nums">
                    {hasActiveRoute ? remAscentM : Math.round(metrics.totalAscent)}
                  </span>
                  <span className="font-sports font-bold text-[10px] text-zinc-500">
                    m
                  </span>
                </div>
              </div>
            </div>

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
                fitRouteToken={fitRouteToken}
                basemapToken={basemapToken}
                autoCenter={autoCenter}
                onToggleAutoCenter={onToggleAutoCenter}
                invertHeading={invertHeading}
                onToggleInvertHeading={onToggleInvertHeading}
              />
              {/* Live next-turn cue (square, bottom-left) */}
              {nextTurnCue && (
                <NextTurnSquare cue={nextTurnCue} formatDist={formatTurnDist} />
              )}
            </div>

            {/* ClimbPro / Route elevation profile */}
            <div className="w-full shrink-0">
              <ClimbProElevationChart
                climb={climbState.currentClimb || climbState.nextClimb}
                routePoints={routePoints}
                currentDist={metrics.distanceTraveled}
                currentGrade={metrics.currentGrade}
                avgGradeRemaining={profileAvgGrade}
                isDarkMode={isDarkMode}
              />
            </div>

            {/* Auto-Pause Floating Banner if active */}
            {metrics.isAutoPaused && (
              <div className="bg-amber-500 text-black font-sports font-bold text-xs py-1 px-3 flex items-center justify-center gap-1.5 animate-pulse z-[450] shadow-md border-b border-amber-600">
                <span className="w-2 h-2 rounded-full bg-black" />
                <span>AUTO-PAUSED (Speed &lt; 3 km/h) • Moving ≥ 3 km/h will auto-resume</span>
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
                  {Math.round(displayedElevation)}
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
                    {climbState.isInClimb
                      ? (routePoints.length > 1
                          ? `CLIMB ${climbState.currentClimbIndex}/${climbState.totalClimbsCount}`
                          : `RECORDING CLIMB ${climbState.currentClimbIndex}`)
                      : (routePoints.length > 1 ? 'UPCOMING CLIMB' : 'FREE RIDE CLIMB')}
                  </div>
                  <div className="font-sports font-bold text-base sm:text-lg leading-tight">
                    {climbState.currentClimb?.name || climbState.nextClimb?.name || (routePoints.length > 1 ? 'Climb Sector' : 'No climb yet')}
                  </div>
                </div>
              </div>
              <span className="bg-blue-600 text-white font-digital font-bold px-2 py-0.5 rounded text-xs">
                Cat {climbState.currentClimb?.category || climbState.nextClimb?.category || '—'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 my-2">
              <div className={`border rounded-xl p-2 flex flex-col items-center ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                <span className="text-[9px] font-sports font-bold text-zinc-400 uppercase">
                  {hasActiveRoute
                    ? (climbState.isInClimb ? 'CLIMB REMAIN' : 'DIST. REMAIN')
                    : (climbState.isInClimb ? 'CLIMB DIST' : 'DIST. REMAIN')}
                </span>
                <span className="font-digital text-xl sm:text-2xl font-bold">
                  {hasActiveRoute
                    ? (climbState.isInClimb
                        ? (climbState.distRemainingToTop / 1000).toFixed(2)
                        : distRemainKm)
                    : (climbState.isInClimb
                        ? ((climbState.currentClimb?.totalLength || 0) / 1000).toFixed(2)
                        : '0.00')}{' '}
                  <span className="text-xs">km</span>
                </span>
              </div>
              <div className={`border rounded-xl p-2 flex flex-col items-center ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                <span className="text-[9px] font-sports font-bold text-zinc-400 uppercase">
                  {hasActiveRoute
                    ? (climbState.isInClimb ? 'REM. ASCENT' : 'REM. ASCENT')
                    : (climbState.isInClimb ? 'CLIMB GAIN' : 'REM. ASCENT')}
                </span>
                <span className="font-digital text-xl sm:text-2xl font-bold">
                  {hasActiveRoute
                    ? (climbState.isInClimb ? Math.round(climbState.remAscent) : remAscentM)
                    : (climbState.isInClimb
                        ? Math.round(climbState.currentClimb?.totalElevationGain || 0)
                        : 0)}{' '}
                  <span className="text-xs">m</span>
                </span>
              </div>
              <div className={`border rounded-xl p-2 flex flex-col items-center ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                <span className="text-[9px] font-sports font-bold text-zinc-400 uppercase">
                  {climbState.isInClimb ? 'AVG GRADE REM.' : 'AVG GRADE REM.'}
                </span>
                <span className="font-digital text-xl sm:text-2xl font-bold text-blue-600">{profileAvgGrade.toFixed(1)}%</span>
              </div>
              <div className={`border rounded-xl p-2 flex flex-col items-center ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                <span className="text-[9px] font-sports font-bold text-zinc-400 uppercase">CURRENT GRADE</span>
                <span className="font-digital text-xl sm:text-2xl font-bold text-emerald-600">{metrics.currentGrade.toFixed(1)}%</span>
              </div>
            </div>

            <div className="border border-zinc-200 rounded-xl overflow-hidden shadow-xs my-1">
              <ClimbProElevationChart
                climb={climbState.currentClimb || climbState.nextClimb}
                routePoints={routePoints}
                currentDist={metrics.distanceTraveled}
                currentGrade={metrics.currentGrade}
                avgGradeRemaining={profileAvgGrade}
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
                  {Math.round(displayedElevation)} <span className="text-xs text-zinc-400">m</span>
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
                fitRouteToken={fitRouteToken}
                basemapToken={basemapToken}
                autoCenter={autoCenter}
                onToggleAutoCenter={onToggleAutoCenter}
                invertHeading={invertHeading}
                onToggleInvertHeading={onToggleInvertHeading}
              />
              {nextTurnCue && (
                <NextTurnSquare cue={nextTurnCue} formatDist={formatTurnDist} />
              )}
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

        {/* STOP — only after user has a real session (Start Ride / unfinished resume) */}
        {onStopRide && metrics.activeSessionId && (
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
