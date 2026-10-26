import React, { useRef, useState } from 'react';
import {
  Navigation2,
  X,
  History,
  Sliders,
  Trash2,
  Flag,
  MapPin,
  Crosshair,
  Bluetooth,
  Mountain,
  Upload,
  Compass,
  Check,
  Square,
  RotateCcw,
  Map,
  HardDrive,
  Battery,
  Heart,
  Zap,
  Share2,
  Download,
  ExternalLink,
  Clock,
  TrendingUp
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HistoryRideMap } from './HistoryRideMap';
import {
  RouteData,
  RideHistoryItem,
  ActiveRideSession,
  GpsStatus,
  RideMetrics
} from '../types/cycling';
import { POWER_ZONES_CONFIG, HR_ZONES_CONFIG } from '../utils/powerZones';
import {
  exportRideToFit,
  exportRideToGpx,
  exportRideToJson,
  openStravaUpload,
  formatExportNotice
} from '../utils/rideExport';
import { startStravaConnect, clearStravaTokens } from '../utils/stravaAuth';
import { OFFLINE_MAP_LABEL } from '../utils/offlineMap';

export type MenuDrawerTab = 'routes' | 'history' | 'profile';

export interface MenuSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeRoute: RouteData | null;
  routes: RouteData[];
  selectedRouteId: string | null;
  rideHistory: RideHistoryItem[];
  activeSession: ActiveRideSession | null;
  isPaused: boolean;
  ridingTime: number;
  saddleTime: number;
  timeElapsed: number;
  distanceTraveled: number;
  gpsStatus: GpsStatus;
  currentCoords: { lat: number; lng: number };
  autoCenter: boolean;
  invertHeading: boolean;
  autoLapDistance: number;
  batterySaver: boolean;
  ftp: number;
  maxHeartRate: number;
  restingHeartRate: number;
  metrics: RideMetrics;
  historyExportNotice: string | null;
  historyMapRideId: string | null;
  isOnline: boolean;
  stravaConnected: boolean;
  offlineMapAvailable: boolean | null;
  onActivateRoute: (id: string) => void;
  onClearRoute: () => void;
  onOpenRouteBuilder: () => void;
  onUseSavedRoute: (id: string) => void;
  onDeleteSavedRoute: (id: string) => void;
  onLocateMe: () => void;
  onOpenSensors: () => void;
  onOpenClimbModal: () => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleAutoCenter: () => void;
  onToggleInvertHeading: () => void;
  onSetAutoLapDistance: (m: number) => void;
  onStopActivity: () => void;
  onClearAllHistory: () => void;
  onDeleteHistoryItem: (id: string) => void;
  onSetHistoryMapRideId: (id: string | null) => void;
  onSetHistoryExportNotice: (msg: string | null) => void;
  onSaveFtp: (n: number) => void;
  onSaveMaxHr: (n: number) => void;
  onSaveRestingHr: (n: number) => void;
  onToggleBatterySaver: () => void;
  onOpenDownloadMaps: () => void;
  onOpenMapsStorage: () => void;
  onResetRide: () => void;
  onStravaConnectedChange: (v: boolean) => void;
}

export function MenuSheet({
  open,
  onOpenChange,
  activeRoute,
  routes,
  selectedRouteId,
  rideHistory,
  activeSession,
  isPaused,
  ridingTime,
  saddleTime,
  timeElapsed,
  distanceTraveled,
  gpsStatus,
  currentCoords,
  autoCenter,
  invertHeading,
  autoLapDistance,
  batterySaver,
  ftp,
  maxHeartRate,
  restingHeartRate,
  metrics,
  historyExportNotice,
  historyMapRideId,
  isOnline,
  stravaConnected,
  offlineMapAvailable,
  onActivateRoute,
  onClearRoute,
  onOpenRouteBuilder,
  onUseSavedRoute,
  onDeleteSavedRoute,
  onLocateMe,
  onOpenSensors,
  onOpenClimbModal,
  onFileUpload,
  onToggleAutoCenter,
  onToggleInvertHeading,
  onSetAutoLapDistance,
  onStopActivity,
  onClearAllHistory,
  onDeleteHistoryItem,
  onSetHistoryMapRideId,
  onSetHistoryExportNotice,
  onSaveFtp,
  onSaveMaxHr,
  onSaveRestingHr,
  onToggleBatterySaver,
  onOpenDownloadMaps,
  onOpenMapsStorage,
  onResetRide,
  onStravaConnectedChange
}: MenuSheetProps) {
  const [tab, setTab] = useState<MenuDrawerTab>('routes');
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="dark z-[99999] flex w-full max-w-md flex-col gap-0 overflow-hidden border-r border-border bg-zinc-950 p-0 text-foreground data-[side=left]:w-[85%] sm:max-w-md"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)'
        }}
      >
        <SheetHeader className="shrink-0 space-y-0 border-b border-border px-3 pt-3 pb-2 text-left">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
                <Navigation2 className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <SheetTitle className="truncate font-sports text-sm font-bold tracking-wide leading-tight">
                  ImageneCycle
                </SheetTitle>
                <SheetDescription className="text-xs leading-tight">Menu</SheetDescription>
              </div>
            </div>
            <SheetClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="min-h-9 min-w-9"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </Button>
            </SheetClose>
          </div>
        </SheetHeader>

        <Tabs
          value={tab}
          onValueChange={v => setTab(v as MenuDrawerTab)}
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          <div className="min-w-0 shrink-0 px-3 pt-2">
            <TabsList className="grid h-9 min-h-9 w-full grid-cols-3 bg-muted font-sports font-semibold group-data-horizontal/tabs:h-9">
              <TabsTrigger value="routes" className="min-h-8 gap-1 px-1.5 text-sm leading-tight">
                <Navigation2 className="size-3.5 shrink-0" />
                Ride
              </TabsTrigger>
              <TabsTrigger value="history" className="relative min-h-8 gap-1 px-1.5 text-sm leading-tight">
                <History className="size-3.5 shrink-0" />
                History
                {rideHistory.length > 0 ? (
                  <Badge
                    variant="secondary"
                    className="ml-0.5 h-5 min-w-5 px-1 text-xs"
                  >
                    {rideHistory.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="profile" className="min-h-8 gap-1 px-1.5 text-sm leading-tight">
                <Sliders className="size-3.5 shrink-0" />
                Settings
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-x-hidden">
            <div className="min-w-0 max-w-full px-3 py-2.5">
              <TabsContent value="routes" className="mt-0 min-w-0 text-sm outline-none">
                <div className="space-y-2">
                  {/* 1. Ride status */}
                  <section className="rounded-xl bg-zinc-800/80 border border-zinc-700 p-3 font-sports">
                    {activeRoute ? (
                      <div>
                        <button
                          type="button"
                          onClick={() => onActivateRoute(activeRoute.id)}
                          className="w-full text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-zinc-400 uppercase font-bold tracking-wide">Course loaded</span>
                            <span className="text-sm text-blue-400 font-bold shrink-0 leading-tight">
                              {(activeRoute.totalDistance / 1000).toFixed(1)} km
                            </span>
                          </div>
                          <div className="font-bold text-white text-sm mt-1 truncate">
                            {activeRoute.name}
                          </div>
                          <div className="text-xs text-zinc-400 mt-1 leading-tight">
                            +{activeRoute.totalElevationGain} m · {activeRoute.climbs.length} climbs
                          </div>
                          <div className="text-sm text-blue-400 font-bold mt-2 leading-tight">
                            Tap to show course on map
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={onClearRoute}
                          className="mt-2 w-full min-h-9 px-3 rounded-xl bg-zinc-900 hover:bg-rose-950/60 border border-zinc-700 hover:border-rose-600/50 text-zinc-300 hover:text-rose-400 text-sm font-bold transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Clear route (free ride)</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                          <span>Free ride</span>
                        </div>
                        <p className="text-xs text-zinc-400 leading-tight">
                          Live GPS with ClimbPro. Create a route to load a planned course.
                        </p>
                      </div>
                    )}
                  </section>

                  {/* 2. Primary actions */}
                  <section className="space-y-2">
                    <Button
                      type="button"
                      size="lg"
                      className="min-h-9 w-full gap-2 font-sports text-sm font-bold leading-tight"
                      onClick={() => {
                        onOpenChange(false);
                        onOpenRouteBuilder();
                      }}
                    >
                      <Flag className="h-5 w-5" />
                      Create route
                    </Button>

                    {routes.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm text-zinc-400 font-sports font-bold leading-tight">Saved routes</h4>
                        {routes.map(r => (
                          <div
                            key={r.id}
                            className={`p-3 rounded-xl border ${
                              selectedRouteId === r.id
                                ? 'bg-blue-950/40 border-blue-500/50'
                                : 'bg-zinc-800/80 border-zinc-700'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => onUseSavedRoute(r.id)}
                              className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg"
                            >
                              <div className="font-bold text-zinc-100 text-sm truncate">{r.name}</div>
                              <div className="text-xs text-zinc-400 font-mono mt-1 leading-tight">
                                {(r.totalDistance / 1000).toFixed(1)} km · +{r.totalElevationGain} m · {r.climbs.length} climbs
                              </div>
                            </button>
                            <div className="flex gap-2 mt-2">
                              <button
                                type="button"
                                onClick={() => onUseSavedRoute(r.id)}
                                className="flex-1 min-h-9 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                              >
                                Use as ride
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteSavedRoute(r.id)}
                                className="min-w-9 min-h-9 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-rose-400 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                                aria-label={`Delete route ${r.name}`}
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* 3. Compact GPS */}
                  <section className="rounded-xl bg-zinc-800/80 border border-zinc-700 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-sports font-bold text-white text-sm flex items-center gap-2 leading-tight">
                        <MapPin className="w-5 h-5 text-blue-400 shrink-0" />
                        GPS
                      </span>
                      <span className="text-sm font-sports font-bold text-emerald-400 leading-tight">
                        {gpsStatus.quality || 'GPS 3D'} (±{gpsStatus.accuracy || 4}m)
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 font-mono text-sm text-zinc-300">
                      <div>
                        <span className="text-xs text-zinc-500 block font-sports font-bold">Latitude</span>
                        <span className="font-bold text-white">{currentCoords.lat ? currentCoords.lat.toFixed(5) : '--'}°</span>
                      </div>
                      <div>
                        <span className="text-xs text-zinc-500 block font-sports font-bold">Longitude</span>
                        <span className="font-bold text-white">{currentCoords.lng ? currentCoords.lng.toFixed(5) : '--'}°</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onLocateMe}
                      className="w-full min-h-9 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-sports font-bold text-sm flex items-center justify-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    >
                      <Crosshair className="w-5 h-5" />
                      <span>Center on me</span>
                    </button>
                  </section>

                  {/* 4. Tools */}
                  <section className="space-y-2">
                    <h4 className="text-sm text-zinc-400 font-sports font-bold leading-tight">Tools</h4>
                    <button
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        onOpenSensors();
                      }}
                      className="w-full min-h-9 px-2.5 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700 flex items-center gap-2 text-left font-sports transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <Bluetooth className="w-5 h-5 text-blue-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-zinc-100 font-bold text-sm">BLE sensors</div>
                        <div className="text-xs text-zinc-400 leading-tight">Heart rate, speed & power</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        onOpenClimbModal();
                      }}
                      className="w-full min-h-9 px-2.5 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700 flex items-center gap-2 text-left font-sports transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <Mountain className="w-5 h-5 text-amber-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-zinc-100 font-bold text-sm">Manual climb</div>
                        <div className="text-xs text-zinc-400 leading-tight">Customize gradient profile</div>
                      </div>
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={onFileUpload}
                      accept=".gpx,.xml"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full min-h-9 px-2.5 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700 flex items-center gap-2 text-left font-sports transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <Upload className="w-5 h-5 text-blue-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-zinc-100 font-bold text-sm">Upload GPX</div>
                        <div className="text-xs text-zinc-400 leading-tight">Import a custom track</div>
                      </div>
                    </button>
                  </section>

                  {/* 5. Map & laps */}
                  <section className="space-y-2">
                    <h4 className="text-sm text-zinc-400 font-sports font-bold leading-tight flex items-center gap-2">
                      <Compass className="w-4 h-4 text-blue-400" />
                      Map & laps
                    </h4>

                    <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-zinc-800/80 border border-zinc-700 min-h-9">
                      <div className="min-w-0 pr-2">
                        <div className="font-sports font-bold text-white text-sm">Auto-center map</div>
                        <p className="text-xs text-zinc-400 mt-0.5 leading-tight">Follows your position</p>
                      </div>
                      <Switch
                        checked={autoCenter}
                        onCheckedChange={() => onToggleAutoCenter()}
                        aria-label="Auto-center map"
                        className="shrink-0"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-zinc-800/80 border border-zinc-700 min-h-9">
                      <div className="min-w-0 pr-2">
                        <div className="font-sports font-bold text-white text-sm">Invert heading</div>
                        <p className="text-xs text-zinc-400 mt-0.5 leading-tight">For reverse / handlebar mounts</p>
                      </div>
                      <Switch
                        checked={invertHeading}
                        onCheckedChange={() => onToggleInvertHeading()}
                        aria-label="Invert heading"
                        className="shrink-0"
                      />
                    </div>

                    <div className="rounded-xl bg-zinc-800/80 border border-zinc-700 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-sports font-bold text-white text-sm flex items-center gap-2">
                          <Flag className="w-5 h-5 text-blue-400" />
                          Auto-lap
                        </span>
                        <span className="text-sm font-sports font-bold text-blue-400 leading-tight">
                          {autoLapDistance === 5000 ? '5 km' : autoLapDistance === 10000 ? '10 km' : 'Off'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => onSetAutoLapDistance(5000)}
                          className={`min-h-9 rounded-xl font-sports font-bold text-sm transition-colors flex items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                            autoLapDistance === 5000
                              ? 'bg-blue-600 text-white'
                              : 'bg-zinc-900 text-zinc-400 border border-zinc-700'
                          }`}
                        >
                          {autoLapDistance === 5000 && <Check className="w-4 h-4" />}
                          <span>5 km</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onSetAutoLapDistance(10000)}
                          className={`min-h-9 rounded-xl font-sports font-bold text-sm transition-colors flex items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                            autoLapDistance === 10000
                              ? 'bg-blue-600 text-white'
                              : 'bg-zinc-900 text-zinc-400 border border-zinc-700'
                          }`}
                        >
                          {autoLapDistance === 10000 && <Check className="w-4 h-4" />}
                          <span>10 km</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onSetAutoLapDistance(0)}
                          className={`min-h-9 rounded-xl font-sports font-bold text-sm transition-colors flex items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
                            autoLapDistance === 0
                              ? 'bg-rose-600 text-white'
                              : 'bg-zinc-900 text-zinc-400 border border-zinc-700'
                          }`}
                        >
                          {autoLapDistance === 0 && <Check className="w-4 h-4" />}
                          <span>Off</span>
                        </button>
                      </div>
                    </div>
                  </section>
                </div>
              </TabsContent>
              <TabsContent value="history" className="mt-0 min-w-0 text-sm outline-none">
                <div className="min-w-0 space-y-2">
                  {activeSession && (
                    <section className="bg-emerald-950/40 border border-emerald-500/50 rounded-xl p-3 font-sports">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                          <span className={`w-2.5 h-2.5 rounded-full ${isPaused ? 'bg-amber-400' : 'bg-emerald-400 animate-ping'}`} />
                          <span>{isPaused ? 'Paused' : 'Recording'}</span>
                        </div>
                        <span className="text-xs font-mono text-zinc-400">
                          {activeSession.id.slice(-6)}
                        </span>
                      </div>
                      <div className="font-bold text-zinc-100 text-sm mt-2 truncate">
                        {activeSession.routeName}
                      </div>

                      <div className="grid grid-cols-3 gap-2 font-digital text-sm bg-zinc-900/80 p-3 rounded-xl mt-3">
                        <div>
                          <span className="text-xs font-sports text-zinc-500 block">Riding</span>
                          <span className="font-bold text-emerald-400">
                            {Math.floor((ridingTime || timeElapsed) / 60)}m {(ridingTime || timeElapsed) % 60}s
                          </span>
                        </div>
                        <div>
                          <span className="text-xs font-sports text-zinc-500 block">Saddle</span>
                          <span className="font-bold text-zinc-300">
                            {Math.floor((saddleTime || timeElapsed) / 60)}m {(saddleTime || timeElapsed) % 60}s
                          </span>
                        </div>
                        <div>
                          <span className="text-xs font-sports text-zinc-500 block">Dist</span>
                          <span className="font-bold text-white">
                            {(distanceTraveled / 1000).toFixed(2)} km
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          onOpenChange(false);
                          onStopActivity();
                        }}
                        className="mt-2 w-full min-h-9 px-3 bg-rose-600 hover:bg-rose-500 text-white font-sports font-bold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                      >
                        <Square className="w-4 h-4 fill-current" />
                        <span>Finish & save</span>
                      </button>
                    </section>
                  )}

                  <div className="flex min-w-0 items-center justify-between gap-2 pb-1 border-b border-zinc-800">
                    <h4 className="min-w-0 truncate font-sports font-bold text-sm text-zinc-400 leading-tight">
                      Past rides ({rideHistory.length})
                    </h4>
                    {rideHistory.length > 0 && (
                      <button
                        type="button"
                        onClick={onClearAllHistory}
                        className="shrink-0 min-h-9 px-2 text-sm text-red-400 hover:text-red-300 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded-lg"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {historyExportNotice && (
                    <div className="text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-800/50 rounded-xl px-3 py-2 leading-tight">
                      {historyExportNotice}
                    </div>
                  )}

                  {rideHistory.length === 0 ? (
                    <div className="p-4 bg-zinc-800/50 rounded-xl text-center text-xs text-zinc-500">
                      <History className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
                      <p className="text-sm text-zinc-400 leading-tight">No rides saved yet</p>
                      <p className="text-xs text-zinc-500 mt-2 leading-tight">
                        Finished rides appear here automatically.
                      </p>
                    </div>
                  ) : (
                    <div className="min-w-0 space-y-2">
                      {rideHistory.map(ride => {
                        const m = Math.floor(ride.timeElapsed / 60);
                        const s = ride.timeElapsed % 60;
                        const timeStr = `${m}m ${s}s`;

                        return (
                          <div
                            key={ride.id}
                            className="min-w-0 max-w-full overflow-hidden rounded-xl border border-zinc-700 bg-zinc-800/80 p-3 font-sports"
                          >
                            <div className="flex min-w-0 items-start justify-between gap-2">
                              <button
                                type="button"
                                className="min-w-0 flex-1 truncate text-left text-sm font-bold leading-tight text-zinc-100 transition-colors hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
                                title="View ride map"
                                onClick={() =>
                                  onSetHistoryMapRideId(
                                    historyMapRideId === ride.id ? null : ride.id
                                  )
                                }
                              >
                                {ride.routeName}
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteHistoryItem(ride.id)}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-zinc-500 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                                aria-label={`Delete ride ${ride.routeName}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>

                            <div className="mt-1 mb-2 text-xs leading-tight text-zinc-400">
                              {ride.dateFormatted}
                            </div>

                            <div className="grid min-w-0 grid-cols-3 gap-1.5 rounded-xl bg-zinc-900/60 p-2 font-digital text-xs">
                              <div className="min-w-0 overflow-hidden">
                                <span className="block font-sports text-[10px] text-zinc-500">Dist</span>
                                <span className="block truncate font-bold">{(ride.distanceMeters / 1000).toFixed(2)} km</span>
                              </div>
                              <div className="min-w-0 overflow-hidden">
                                <span className="block font-sports text-[10px] text-zinc-500">Gain</span>
                                <span className="block truncate font-bold text-emerald-400">+{ride.totalAscentMeters}m</span>
                              </div>
                              <div className="min-w-0 overflow-hidden">
                                <span className="block font-sports text-[10px] text-zinc-500">Time</span>
                                <span className="block truncate font-bold text-blue-400">{timeStr}</span>
                              </div>
                            </div>

                            {historyMapRideId === ride.id && (
                              <div className="mt-2 min-w-0 overflow-hidden">
                                <HistoryRideMap
                                  breadcrumbs={ride.breadcrumbs || []}
                                  className="h-[140px] w-full max-w-full"
                                />
                              </div>
                            )}

                            <div className="mt-2 grid min-w-0 grid-cols-2 gap-1.5 border-t border-zinc-700 pt-2">
                              <button
                                type="button"
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
                                    onSetHistoryExportNotice(formatExportNotice(result, 'FIT'));
                                  } catch (err) {
                                    onSetHistoryExportNotice(err instanceof Error ? err.message : 'FIT export failed');
                                  }
                                  setTimeout(() => onSetHistoryExportNotice(null), 4000);
                                }}
                                className="flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-xl border border-emerald-700/60 bg-emerald-950/40 font-sports text-xs font-bold text-emerald-300 transition-colors hover:bg-emerald-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                                title="Export FIT 2.0"
                              >
                                <Download className="h-3.5 w-3.5 shrink-0" />
                                <span>FIT</span>
                              </button>

                              <button
                                type="button"
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
                                    onSetHistoryExportNotice(formatExportNotice(result, 'GPX'));
                                  } catch (err) {
                                    onSetHistoryExportNotice(err instanceof Error ? err.message : 'GPX export failed');
                                  }
                                  setTimeout(() => onSetHistoryExportNotice(null), 4000);
                                }}
                                className="flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-xl border border-zinc-700 bg-zinc-900 font-sports text-xs font-bold text-zinc-200 transition-colors hover:bg-blue-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                title="Export GPX"
                              >
                                <Download className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                                <span>GPX</span>
                              </button>

                              <button
                                type="button"
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
                                    onSetHistoryExportNotice(formatExportNotice(result, 'JSON'));
                                  } catch (err) {
                                    onSetHistoryExportNotice(err instanceof Error ? err.message : 'JSON export failed');
                                  }
                                  setTimeout(() => onSetHistoryExportNotice(null), 4000);
                                }}
                                className="flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-xl border border-zinc-700 bg-zinc-900 font-sports text-xs font-bold text-zinc-200 transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                                title="Export JSON"
                              >
                                <Share2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                                <span>JSON</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => openStravaUpload()}
                                className="flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-xl border border-[#FC4C02]/40 bg-[#FC4C02]/20 font-sports text-xs font-bold text-[#FC4C02] transition-colors hover:bg-[#FC4C02]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FC4C02]"
                                title="Open Strava upload"
                              >
                                <span>Strava</span>
                                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="profile" className="mt-0 text-sm outline-none">
<div className="space-y-2 font-sports">
                  {/* Offline maps first */}
                  <section className="bg-zinc-800/80 p-3 rounded-xl border border-zinc-700 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-white text-sm flex items-center gap-2">
                        <Map className="w-5 h-5 text-emerald-400" />
                        Offline maps
                      </span>
                      <span className={`text-xs font-bold leading-tight ${
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
                    <p className="text-xs text-zinc-400 leading-tight">
                      {OFFLINE_MAP_LABEL} (OpenStreetMap). Download a country for offline detail. Guru packs not supported.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onOpenChange(false);
                          onOpenDownloadMaps();
                        }}
                        className="min-h-9 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-sports font-bold text-sm flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onOpenChange(false);
                          onOpenMapsStorage();
                        }}
                        className="min-h-9 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-zinc-200 font-sports font-bold text-sm flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                      >
                        <HardDrive className="w-4 h-4 text-emerald-400" />
                        Storage
                      </button>
                    </div>
                  </section>

                  {/* Battery Saver */}
                  <section className="bg-zinc-800/80 p-3 rounded-xl border border-zinc-700 space-y-2">
                    <div className="flex items-center justify-between gap-2 min-h-9">
                      <span className="font-bold text-white text-sm flex items-center gap-2">
                        <Battery className="w-5 h-5 text-emerald-400" />
                        Battery saver
                      </span>
                      <Switch
                        checked={batterySaver}
                        onCheckedChange={() => onToggleBatterySaver()}
                        aria-label="Battery saver"
                        className="shrink-0"
                      />
                    </div>
                    <p className="text-xs text-zinc-400 leading-tight">
                      Reduces map motion and GPS polling on long rides.
                    </p>
                  </section>

                  {/* Strava */}
                  <section className="bg-zinc-800/80 p-3 rounded-xl border border-zinc-700 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-white text-sm flex items-center gap-2">
                        <Share2 className="w-5 h-5 text-orange-500" />
                        Strava
                      </span>
                      <span className={`text-xs font-bold leading-tight ${stravaConnected ? 'text-emerald-400' : 'text-zinc-500'}`}>
                        {!isOnline ? 'Needs internet' : stravaConnected ? 'Connected' : 'Not connected'}
                      </span>
                    </div>
                    {stravaConnected ? (
                      <button
                        type="button"
                        onClick={() => {
                          clearStravaTokens();
                          onStravaConnectedChange(false);
                        }}
                        className="w-full min-h-9 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
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
                        className="w-full min-h-9 rounded-xl bg-[#FC4C02] text-white font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FC4C02]"
                      >
                        Connect with Strava
                      </button>
                    )}
                    <p className="text-xs text-zinc-400 leading-tight">
                      Needs internet and Strava API setup for connect.
                    </p>
                  </section>

                  {/* FTP */}
                  <section className="bg-zinc-800/80 p-3 rounded-xl border border-zinc-700 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-white text-sm flex items-center gap-2">
                        <Zap className="w-5 h-5 text-amber-400" />
                        FTP
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
                        onChange={e => onSaveFtp(parseInt(e.target.value, 10))}
                        className="w-full accent-blue-500 cursor-pointer h-3 bg-zinc-800 rounded-lg"
                        aria-label="FTP watts"
                      />
                      <input
                        type="number"
                        min="80"
                        max="600"
                        value={ftp}
                        onChange={e => onSaveFtp(parseInt(e.target.value, 10))}
                        className="w-20 min-h-9 bg-zinc-900 border border-zinc-700 rounded-xl px-2 font-digital font-bold text-center text-white text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      />
                    </div>
                    <p className="text-xs text-zinc-400 leading-tight">
                      60-minute sustainable power. Zones update below.
                    </p>
                  </section>

                  {/* HR Anchors */}
                  <section className="bg-zinc-800/80 p-3 rounded-xl border border-zinc-700 space-y-2">
                    <span className="font-bold text-white text-sm flex items-center gap-2">
                      <Heart className="w-5 h-5 text-red-400" />
                      Heart rate zones
                    </span>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1.5">
                        <span className="text-xs text-zinc-400 leading-tight">Max HR</span>
                        <input
                          type="number"
                          min="120"
                          max="230"
                          value={maxHeartRate}
                          onChange={e => onSaveMaxHr(parseInt(e.target.value, 10) || 190)}
                          className="w-full min-h-9 bg-zinc-900 border border-zinc-700 rounded-xl px-3 font-digital font-bold text-center text-white text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                        />
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-xs text-zinc-400 leading-tight">Resting HR</span>
                        <input
                          type="number"
                          min="30"
                          max="100"
                          value={restingHeartRate}
                          onChange={e => onSaveRestingHr(parseInt(e.target.value, 10) || 60)}
                          className="w-full min-h-9 bg-zinc-900 border border-zinc-700 rounded-xl px-3 font-digital font-bold text-center text-white text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                        />
                      </label>
                    </div>
                  </section>

                  {/* Power zones */}
                  <section className="space-y-2">
                    <h4 className="font-bold text-sm text-zinc-400 leading-tight">
                      Power zones ({ftp}W FTP)
                    </h4>
                    <div className="space-y-2">
                      {POWER_ZONES_CONFIG.map(z => {
                        const minW = Math.round((z.minPct / 100) * ftp);
                        const maxW = z.maxPct === 999 ? '∞' : `${Math.round((z.maxPct / 100) * ftp)}W`;
                        const isCurrent = metrics.powerZone === z.zone;

                        return (
                          <div
                            key={z.zone}
                            className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${
                              isCurrent
                                ? 'bg-zinc-800 border-white ring-1 ring-white/50'
                                : 'bg-zinc-800/60 border-zinc-700'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: z.color }}
                              />
                              <div>
                                <div className="font-bold text-zinc-200 text-sm">
                                  Z{z.zone} {z.name}
                                </div>
                                <div className="text-xs text-zinc-400">
                                  {z.minPct}% - {z.maxPct === 999 ? '150%+' : `${z.maxPct}%`}
                                </div>
                              </div>
                            </div>
                            <div className="font-digital font-bold text-right text-sm">
                              <span>{minW} - {maxW}</span>
                              {isCurrent && (
                                <span className="block text-xs text-emerald-400 uppercase font-sports">Active</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  {/* HR zones table */}
                  <section className="space-y-2">
                    <h4 className="font-bold text-sm text-zinc-400 leading-tight">
                      Heart rate zones (HRR)
                    </h4>
                    <div className="space-y-2">
                      {HR_ZONES_CONFIG.map(z => {
                        const hrr = Math.max(1, maxHeartRate - restingHeartRate);
                        const minBpm = Math.round(restingHeartRate + (z.minPct / 100) * hrr);
                        const maxBpm = Math.round(restingHeartRate + (z.maxPct / 100) * hrr);
                        const isCurrent = metrics.hrZone === z.zone;
                        return (
                          <div
                            key={z.zone}
                            className={`p-3 rounded-xl border flex items-center justify-between ${
                              isCurrent
                                ? 'bg-zinc-800 border-white ring-1 ring-white/50'
                                : 'bg-zinc-800/60 border-zinc-700'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: z.color }}
                              />
                              <div>
                                <div className="font-bold text-zinc-200 text-sm">Z{z.zone} {z.name}</div>
                                <div className="text-xs text-zinc-400">
                                  {z.minPct}% – {z.maxPct}% HRR
                                </div>
                              </div>
                            </div>
                            <div className="font-digital font-bold text-right text-sm">
                              {minBpm} – {maxBpm}
                              {isCurrent && (
                                <span className="block text-xs text-emerald-400 uppercase font-sports">Active</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        <Separator />
        <div className="shrink-0 px-3 pt-2 pb-3">
          <Button
            type="button"
            variant="outline"
            className="min-h-9 w-full gap-2 font-sports text-sm font-semibold leading-tight text-muted-foreground hover:text-destructive"
            onClick={onResetRide}
          >
            <RotateCcw className="h-5 w-5" />
            Reset ride (save to history)
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
