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
import { exportRideToFit, exportRideToGpx, exportRideToJson, openStravaUpload, uploadToStrava, rideToFitBlob, rideToGpxBlob, formatExportNotice, BreadcrumbPoint } from '../utils/rideExport';
import { getValidStravaAccessToken, isStravaConnected, startStravaConnect, setManualStravaToken, getStoredStravaToken } from '../utils/stravaAuth';

interface RideSummaryModalProps {
  isOpen: boolean;
  metrics: RideMetrics;
  routeName: string;
  onSave: (customTitle?: string) => void;
  onResume: () => void;
  onDiscard: () => void;
  breadcrumbs?: BreadcrumbPoint[];
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
  const [stravaUploading, setStravaUploading] = useState(false);
  const [stravaConnected, setStravaConnected] = useState(() => isStravaConnected());
  
  // Instant Strava Token Modal state
  const [isStravaTokenModalOpen, setIsStravaTokenModalOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState(() => getStoredStravaToken() || '');
  const [uploadFormat, setUploadFormat] = useState<'fit' | 'gpx'>('fit');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const buildExportPayload = () => ({
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
    avgHeartRateBpm: metrics.heartRate,
    avgCadenceRpm: metrics.cadence,
    breadcrumbs
  });

  const handleExportFit = async () => {
    try {
      const result = await exportRideToFit(buildExportPayload());
      setExportNotice(formatExportNotice(result, 'FIT'));
    } catch (err) {
      setExportNotice(err instanceof Error ? err.message : 'FIT export failed');
    }
    setTimeout(() => setExportNotice(null), 4000);
  };

  const handleExportGpx = async () => {
    try {
      const result = await exportRideToGpx(buildExportPayload());
      setExportNotice(formatExportNotice(result, 'GPX'));
    } catch (err) {
      setExportNotice(err instanceof Error ? err.message : 'GPX export failed');
    }
    setTimeout(() => setExportNotice(null), 4000);
  };

  const handleExportJson = async () => {
    try {
      const result = await exportRideToJson(buildExportPayload());
      setExportNotice(formatExportNotice(result, 'JSON'));
    } catch (err) {
      setExportNotice(err instanceof Error ? err.message : 'JSON export failed');
    }
    setTimeout(() => setExportNotice(null), 4000);
  };

  const executeStravaUpload = async (token: string, format: 'fit' | 'gpx') => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setExportNotice('Strava needs an internet connection.');
      setTimeout(() => setExportNotice(null), 3500);
      return;
    }
    setStravaUploading(true);
    setUploadError(null);
    try {
      const payload = buildExportPayload();
      const blob = format === 'fit' ? rideToFitBlob(payload) : rideToGpxBlob(payload);
      const result = await uploadToStrava(blob, token, {
        name: customTitle || routeName,
        dataType: format
      });
      setExportNotice(`Uploaded .${format.toUpperCase()} to Strava (Upload ID: ${result.id})!`);
      setIsStravaTokenModalOpen(false);
      setStravaConnected(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Strava upload failed';
      setUploadError(msg);
      setExportNotice(msg);
    } finally {
      setStravaUploading(false);
      setTimeout(() => setExportNotice(null), 5000);
    }
  };

  const handleOpenUploadFlow = async () => {
    // If we already have a valid token stored, we can offer instant upload or open dialog
    const existingToken = await getValidStravaAccessToken();
    if (existingToken) {
      // Execute directly with FIT
      executeStravaUpload(existingToken, 'fit');
    } else {
      // Open modal prompt for Strava Access Token with instant upload
      setIsStravaTokenModalOpen(true);
    }
  };

  const handleModalTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = tokenInput.trim();
    if (!clean) {
      setUploadError('Please enter a Strava Access Token');
      return;
    }
    setManualStravaToken(clean);
    executeStravaUpload(clean, uploadFormat);
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
            <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2 mt-3 col-span-2">
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

              {/* 3 Export Download Formats: Standard .FIT, GPX 1.1, and Full JSON */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                {/* Standard .FIT Export Button (Recommended) */}
                <button
                  type="button"
                  onClick={handleExportFit}
                  className="py-2 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-sports font-bold text-[11px] flex items-center justify-center gap-1 shadow-sm transition-all"
                  title="Download standardized FIT 2.0 binary file with Power, Cadence, and HR records"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">.FIT (Strava)</span>
                </button>

                {/* Strava GPX Export Button */}
                <button
                  type="button"
                  onClick={handleExportGpx}
                  className="py-2 px-2 rounded-lg bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white font-sports font-bold text-[11px] flex items-center justify-center gap-1 shadow-sm transition-all"
                  title="Download standard GPX 1.1 file ready for Strava upload"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">.GPX</span>
                </button>

                {/* JSON backup — not Strava-compatible */}
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="py-2 px-2 rounded-lg bg-zinc-800 hover:bg-zinc-750 active:bg-zinc-850 text-zinc-200 border border-zinc-700 hover:border-zinc-600 font-sports font-bold text-[11px] flex items-center justify-center gap-1 transition-all"
                  title="Local backup/analytics only — Strava will reject JSON. Use FIT or GPX for Strava."
                >
                  <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="truncate">Backup</span>
                </button>
              </div>
              <p className="text-[10px] text-zinc-500 font-sports leading-tight">
                Strava accepts <span className="text-emerald-400 font-bold">.FIT</span> or{' '}
                <span className="text-orange-400 font-bold">.GPX</span> only — not JSON.
              </p>

              {/* Strava Direct API Upload Button */}
              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={handleOpenUploadFlow}
                  disabled={stravaUploading}
                  className="flex-1 py-2 px-2.5 rounded-lg bg-[#FC4C02] hover:bg-[#e04402] disabled:opacity-60 text-white text-xs font-sports font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                  title="Upload ride directly to Strava using Strava API"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>
                    {stravaUploading
                      ? 'Uploading to Strava…'
                      : stravaConnected
                      ? 'Upload to Strava (.FIT)'
                      : 'Upload to Strava (Enter Token)'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsStravaTokenModalOpen(true)}
                  className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-sports"
                  title="Configure Strava Access Token / Format"
                >
                  Token
                </button>
              </div>

              {/* Direct Strava Upload Web Link fallback */}
              <button
                type="button"
                onClick={async () => {
                  try {
                    const result = await exportRideToFit(buildExportPayload());
                    setExportNotice(
                      `${formatExportNotice(result, 'FIT')} — select this .fit on Strava (not Backup/JSON)`
                    );
                  } catch (err) {
                    setExportNotice(err instanceof Error ? err.message : 'FIT export failed');
                  }
                  openStravaUpload();
                  setTimeout(() => setExportNotice(null), 6000);
                }}
                className="w-full py-1.5 px-2 rounded-lg bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-orange-400 text-[11px] font-sports font-semibold flex items-center justify-center gap-1 transition-colors"
              >
                <span>Manual upload (.FIT → strava.com/upload)</span>
                <ExternalLink className="w-3 h-3 text-orange-500" />
              </button>
            </div>
          </div>
        </div>

        {/* Modal Prompt for Strava Access Token & Instant Upload */}
        {isStravaTokenModalOpen && (
          <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-orange-500/40 rounded-2xl max-w-md w-full p-5 text-white shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#FC4C02]/20 border border-[#FC4C02]/40 flex items-center justify-center">
                    <Share2 className="w-4 h-4 text-[#FC4C02]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-sports font-bold">Strava API Direct Upload</h3>
                    <p className="text-[10px] text-zinc-400">Upload your .FIT or .GPX ride directly to your Strava profile</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsStravaTokenModalOpen(false)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {uploadError && (
                <div className="p-2.5 rounded-lg bg-red-950/70 border border-red-800/80 text-red-300 text-xs font-mono">
                  {uploadError}
                </div>
              )}

              <form onSubmit={handleModalTokenSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-[11px] font-sports font-bold text-zinc-300 uppercase mb-1">
                    Strava Access Token
                  </label>
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="e.g. 7f830a6b994d2e8..."
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-xl text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 transition-colors"
                  />
                  <p className="text-[10px] text-zinc-400 mt-1">
                    Requires <code className="text-orange-400">activity:write</code> scope from Strava API Settings.
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-sports font-bold text-zinc-300 uppercase mb-1">
                    Upload Format
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setUploadFormat('fit')}
                      className={`py-1.5 px-2.5 rounded-lg border text-xs font-sports font-bold flex items-center justify-center gap-1.5 transition-all ${
                        uploadFormat === 'fit'
                          ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Check className={`w-3.5 h-3.5 ${uploadFormat === 'fit' ? 'opacity-100' : 'opacity-0'}`} />
                      <span>Standard .FIT (Power, HR)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadFormat('gpx')}
                      className={`py-1.5 px-2.5 rounded-lg border text-xs font-sports font-bold flex items-center justify-center gap-1.5 transition-all ${
                        uploadFormat === 'gpx'
                          ? 'bg-orange-600/30 border-orange-500 text-orange-300'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Check className={`w-3.5 h-3.5 ${uploadFormat === 'gpx' ? 'opacity-100' : 'opacity-0'}`} />
                      <span>GPX 1.1</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={stravaUploading || !tokenInput.trim()}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-[#FC4C02] hover:bg-[#e04402] disabled:opacity-50 text-white font-sports font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-lg shadow-orange-600/20 transition-all"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>{stravaUploading ? 'Uploading to Strava…' : 'Instant Upload Now'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      try {
                        startStravaConnect();
                      } catch {
                        setUploadError('Strava needs internet');
                      }
                    }}
                    className="py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-sports font-bold text-xs transition-colors"
                    title="Or connect via Strava OAuth browser login"
                  >
                    OAuth Login
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

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
