import React, { useState } from 'react';
import { 
  Trophy, 
  Clock, 
  MapPin, 
  TrendingUp, 
  Zap, 
  Flame, 
  Play, 
  Check, 
  Trash2, 
  X,
  Gauge,
  Activity,
  Calendar,
  Download,
  Share2,
  ExternalLink,
  FileCode
} from 'lucide-react';
import { RideMetrics } from '../types/cycling';
import { exportRideToGpx, exportRideToJson, openStravaUpload } from '../utils/rideExport';

interface RideSummaryModalProps {
  isOpen: boolean;
  metrics: RideMetrics;
  routeName: string;
  onSave: (customTitle?: string) => void;
  onResume: () => void;
  onDiscard: () => void;
  breadcrumbs?: { lat: number; lng: number }[];
  startedAt?: number;
}

export const RideSummaryModal: React.FC<RideSummaryModalProps> = ({
  isOpen,
  metrics,
  routeName,
  onSave,
  onResume,
  onDiscard,
  breadcrumbs = [],
  startedAt
}) => {
  const [customTitle, setCustomTitle] = useState<string>(() => {
    const hours = new Date().getHours();
    const timeOfDay = hours < 12 ? 'Morning' : hours < 17 ? 'Afternoon' : 'Evening';
    return `${timeOfDay} Ride - ${routeName}`;
  });
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const handleExportGpx = () => {
    exportRideToGpx({
      routeName: customTitle || routeName,
      startedAt,
      timeElapsed: metrics.timeElapsed,
      ridingTimeSeconds: metrics.ridingTime || metrics.timeElapsed,
      saddleTimeSeconds: metrics.saddleTime,
      distanceMeters: metrics.distanceTraveled,
      totalAscentMeters: metrics.totalAscent,
      avgSpeedKmh: metrics.avgSpeed,
      maxSpeedKmh: metrics.maxSpeed,
      calories: metrics.calories,
      avgPowerWatts: metrics.power,
      breadcrumbs
    });
    setExportNotice('Strava-compatible GPX file downloaded!');
    setTimeout(() => setExportNotice(null), 3500);
  };

  const handleExportJson = () => {
    exportRideToJson({
      routeName: customTitle || routeName,
      startedAt,
      timeElapsed: metrics.timeElapsed,
      ridingTimeSeconds: metrics.ridingTime || metrics.timeElapsed,
      saddleTimeSeconds: metrics.saddleTime,
      distanceMeters: metrics.distanceTraveled,
      totalAscentMeters: metrics.totalAscent,
      avgSpeedKmh: metrics.avgSpeed,
      maxSpeedKmh: metrics.maxSpeed,
      calories: metrics.calories,
      avgPowerWatts: metrics.power,
      breadcrumbs
    });
    setExportNotice('Full telemetry JSON file downloaded!');
    setTimeout(() => setExportNotice(null), 3500);
  };

  if (!isOpen) return null;

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const distanceKm = (metrics.distanceTraveled / 1000).toFixed(2);
  const movingTimeSecs = metrics.ridingTime || metrics.timeElapsed || 0;
  const saddleTimeSecs = metrics.saddleTime || metrics.timeElapsed || 0;
  const pauseTimeSecs = Math.max(0, saddleTimeSecs - movingTimeSecs);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-3xl max-w-lg w-full text-white shadow-2xl overflow-hidden my-auto">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600/30 via-zinc-800 to-zinc-900 p-5 border-b border-zinc-800 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-sports font-bold text-[10px] tracking-wider uppercase border border-emerald-500/30">
                  ACTIVITY STOPPED
                </span>
                <span className="text-xs text-zinc-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="mt-1 bg-transparent border-b border-zinc-700 focus:border-emerald-400 outline-none text-base font-sports font-bold tracking-wide text-white w-full max-w-xs transition-colors"
                placeholder="Name your ride..."
              />
            </div>
          </div>
          <button
            onClick={onResume}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Resume Ride"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          
          {/* Main Key Figures */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-zinc-950/70 border border-zinc-800 rounded-2xl p-3.5 flex flex-col justify-between">
              <span className="text-[11px] font-sports font-bold tracking-wider text-zinc-400 uppercase flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                DISTANCE
              </span>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-digital text-3xl font-bold text-white tracking-tight">
                  {distanceKm}
                </span>
                <span className="text-xs font-mono text-zinc-400">km</span>
              </div>
            </div>

            <div className="bg-zinc-950/70 border border-zinc-800 rounded-2xl p-3.5 flex flex-col justify-between">
              <span className="text-[11px] font-sports font-bold tracking-wider text-zinc-400 uppercase flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                TOTAL ASCENT
              </span>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-digital text-3xl font-bold text-white tracking-tight">
                  +{Math.round(metrics.totalAscent)}
                </span>
                <span className="text-xs font-mono text-zinc-400">m</span>
              </div>
            </div>
          </div>

          {/* Dual Timer Breakdown (Riding Time vs Saddle Time) */}
          <div className="bg-zinc-950/80 border border-zinc-800/90 rounded-2xl p-4">
            <div className="text-[11px] font-sports font-bold tracking-wider text-zinc-400 uppercase flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                TIME BREAKDOWN
              </span>
              {pauseTimeSecs > 0 && (
                <span className="text-[10px] text-amber-400 font-mono">
                  Paused: {formatTime(pauseTimeSecs)}
                </span>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="border-r border-zinc-800/80 pr-2">
                <span className="text-[10px] text-zinc-500 uppercase font-semibold">Riding Time (Moving)</span>
                <div className="font-digital text-2xl font-bold text-emerald-400 mt-0.5">
                  {formatTime(movingTimeSecs)}
                </div>
              </div>
              <div className="pl-2">
                <span className="text-[10px] text-zinc-500 uppercase font-semibold">Saddle Time (Total)</span>
                <div className="font-digital text-2xl font-bold text-zinc-200 mt-0.5">
                  {formatTime(saddleTimeSecs)}
                </div>
              </div>
            </div>
          </div>

          {/* Secondary Stats Grid */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-zinc-950/50 border border-zinc-800/80 rounded-xl p-2.5 text-center">
              <span className="text-[10px] font-sports font-bold text-zinc-400 uppercase flex items-center justify-center gap-1">
                <Gauge className="w-3 h-3 text-cyan-400" />
                AVG SPEED
              </span>
              <div className="font-digital text-lg font-bold text-white mt-1">
                {metrics.avgSpeed.toFixed(1)} <span className="text-[10px] font-mono text-zinc-400">km/h</span>
              </div>
            </div>

            <div className="bg-zinc-950/50 border border-zinc-800/80 rounded-xl p-2.5 text-center">
              <span className="text-[10px] font-sports font-bold text-zinc-400 uppercase flex items-center justify-center gap-1">
                <Activity className="w-3 h-3 text-red-400" />
                MAX SPEED
              </span>
              <div className="font-digital text-lg font-bold text-white mt-1">
                {metrics.maxSpeed.toFixed(1)} <span className="text-[10px] font-mono text-zinc-400">km/h</span>
              </div>
            </div>

            <div className="bg-zinc-950/50 border border-zinc-800/80 rounded-xl p-2.5 text-center">
              <span className="text-[10px] font-sports font-bold text-zinc-400 uppercase flex items-center justify-center gap-1">
                <Flame className="w-3 h-3 text-orange-400" />
                CALORIES
              </span>
              <div className="font-digital text-lg font-bold text-white mt-1">
                {metrics.calories} <span className="text-[10px] font-mono text-zinc-400">kcal</span>
              </div>
            </div>
          </div>

          {/* Power & Heart Rate Stats if available */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-zinc-950/50 border border-zinc-800/80 rounded-xl p-2.5 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-sports font-bold text-zinc-400 uppercase flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-400" />
                  POWER & FTP
                </span>
                <span className="text-xs font-mono text-zinc-200 mt-0.5 block">
                  {metrics.power !== null ? `${metrics.power} W` : '--'} · FTP {metrics.ftp}W
                </span>
              </div>
              {metrics.powerZoneName && (
                <span 
                  className="px-2 py-0.5 rounded text-[10px] font-sports font-bold text-white"
                  style={{ backgroundColor: metrics.powerZoneColor || '#3b82f6' }}
                >
                  {metrics.powerZoneName}
                </span>
              )}
            </div>

            <div className="bg-zinc-950/50 border border-zinc-800/80 rounded-xl p-2.5 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-sports font-bold text-zinc-400 uppercase flex items-center gap-1">
                  <Activity className="w-3 h-3 text-rose-400" />
                  AVG HEART RATE
                </span>
                <span className="text-xs font-mono text-zinc-200 mt-0.5 block">
                  {metrics.heartRate !== null ? `${metrics.heartRate} bpm` : '--'}
                </span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500">
                VAM: {metrics.vam} m/h
              </span>
            </div>

            {/* Export & Strava Integration Card */}
            <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2 mt-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-sports font-bold text-zinc-300 uppercase flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5 text-orange-500" />
                  Export & Strava Sync
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {breadcrumbs.length} trackpoints
                </span>
              </div>

              {exportNotice && (
                <div className="bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 px-2.5 py-1.5 rounded-lg text-xs font-sports animate-in fade-in duration-200 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{exportNotice}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                {/* Strava GPX Export Button */}
                <button
                  type="button"
                  onClick={handleExportGpx}
                  className="py-2 px-2.5 rounded-lg bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white font-sports font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
                  title="Download standard GPX 1.1 file ready for Strava upload"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export GPX (Strava)</span>
                </button>

                {/* JSON Telemetry Export Button */}
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="py-2 px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 active:bg-zinc-850 text-zinc-200 border border-zinc-750 hover:border-zinc-600 font-sports font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                  title="Download complete telemetry and GPS coordinates as JSON"
                >
                  <FileCode className="w-3.5 h-3.5 text-blue-400" />
                  <span>Export JSON</span>
                </button>
              </div>

              {/* Direct Strava Upload Web Link */}
              <button
                type="button"
                onClick={openStravaUpload}
                className="w-full py-1.5 px-2 rounded-lg bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-orange-400 text-[11px] font-sports font-semibold flex items-center justify-center gap-1 transition-colors"
              >
                <span>Upload to Strava Web</span>
                <ExternalLink className="w-3 h-3 text-orange-500" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 bg-zinc-950 border-t border-zinc-800/80">
          {!showDiscardConfirm ? (
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => onSave(customTitle)}
                className="flex-1 py-3 px-4 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-black font-sports font-bold text-sm tracking-wider uppercase rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>SAVE ACTIVITY</span>
              </button>

              <button
                onClick={onResume}
                className="py-3 px-4 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-850 text-white font-sports font-bold text-xs tracking-wider uppercase rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                title="Resume this ride"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>RESUME</span>
              </button>

              <button
                onClick={() => setShowDiscardConfirm(true)}
                className="p-3 bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 text-red-400 hover:text-red-300 rounded-xl transition-colors"
                title="Discard this activity"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 bg-red-950/60 border border-red-800/60 p-3 rounded-xl animate-in fade-in duration-150">
              <span className="text-xs font-sports font-bold text-red-200">
                Discard this activity? Data will be deleted.
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={onDiscard}
                  className="py-1.5 px-3 bg-red-600 hover:bg-red-500 text-white font-sports font-bold text-xs uppercase rounded-lg transition-colors"
                >
                  YES, DISCARD
                </button>
                <button
                  onClick={() => setShowDiscardConfirm(false)}
                  className="py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-sports font-bold text-xs uppercase rounded-lg transition-colors"
                >
                  CANCEL
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
