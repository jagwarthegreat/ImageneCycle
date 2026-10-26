/**
 * One-shot: extract App.tsx menu portal into MenuSheet with shadcn Sheet shell.
 * Run: node scripts/build-menu-sheet.mjs
 */
import fs from 'fs';

const src = fs.readFileSync('src/App.tsx', 'utf8');
const lines = src.split(/\r?\n/);
const start = lines.findIndex(l => l.includes('DISCREET SLIDE-OVER MENU DRAWER'));
const end = lines.findIndex((l, i) => i > start && l.includes('Sensor Pairing, Manual Climb'));
if (start < 0 || end < 0) throw new Error('menu bounds not found');

// Lines inside portal: after createPortal( ... until , document.body)
let chunk = lines.slice(start, end).join('\n');

// Pull Ride / History / Settings bodies by marker comments
function extractBetween(text, startRe, endRe) {
  const s = text.search(startRe);
  if (s < 0) throw new Error('start not found: ' + startRe);
  const after = text.slice(s);
  const eRel = after.search(endRe);
  if (eRel < 0) throw new Error('end not found: ' + endRe);
  return after.slice(0, eRel);
}

const rideBody = extractBetween(
  chunk,
  /\{\/\* TAB 1: Ride \*\/\}/,
  /\{\/\* TAB 2: History \*\/\}/
)
  .replace(/^\{\/\* TAB 1: Ride \*\/\}\s*/, '')
  .replace(/\{drawerTab === 'routes' && \(\s*/, '')
  .replace(/\s*\)\}\s*$/, '');

const historyBody = extractBetween(
  chunk,
  /\{\/\* TAB 2: History \*\/\}/,
  /\{\/\* TAB 3: Settings/
)
  .replace(/^\{\/\* TAB 2: History \*\/\}\s*/, '')
  .replace(/\{drawerTab === 'history' && \(\s*/, '')
  .replace(/\s*\)\}\s*$/, '');

const profileBody = extractBetween(
  chunk,
  /\{\/\* TAB 3: Settings/,
  /\{\/\* Sticky footer/
)
  .replace(/^[\s\S]*?\{drawerTab === 'profile' && \(\s*/, '')
  .replace(/\s*\)\}\s*$/, '');

function rewriteHandlers(code) {
  return code
    .replace(/setIsMenuDrawerOpen\(false\)/g, 'onOpenChange(false)')
    .replace(/setIsRouteBuilderOpen\(true\)/g, 'onOpenRouteBuilder()')
    .replace(/setIsSensorModalOpen\(true\)/g, 'onOpenSensors()')
    .replace(/setIsClimbModalOpen\(true\)/g, 'onOpenClimbModal()')
    .replace(/setIsDownloadMapsOpen\(true\)/g, 'onOpenDownloadMaps()')
    .replace(/setIsMapsStorageOpen\(true\)/g, 'onOpenMapsStorage()')
    .replace(/activateRouteAsCurrentRide\(/g, 'onActivateRoute(')
    .replace(/handleClearRoute/g, 'onClearRoute')
    .replace(/handleUseSavedRoute/g, 'onUseSavedRoute')
    .replace(/handleDeleteSavedRoute/g, 'onDeleteSavedRoute')
    .replace(/handleLocateMe/g, 'onLocateMe')
    .replace(/handleFileUpload/g, 'onFileUpload')
    .replace(/handleToggleAutoCenter/g, 'onToggleAutoCenter')
    .replace(/handleToggleInvertHeading/g, 'onToggleInvertHeading')
    .replace(/handleSetAutoLapDistance/g, 'onSetAutoLapDistance')
    .replace(/handleStopActivity/g, 'onStopActivity')
    .replace(/handleClearAllHistory/g, 'onClearAllHistory')
    .replace(/handleDeleteHistoryItem/g, 'onDeleteHistoryItem')
    .replace(/setHistoryMapRideId/g, 'onSetHistoryMapRideId')
    .replace(/setHistoryExportNotice/g, 'onSetHistoryExportNotice')
    .replace(/handleSaveFtp/g, 'onSaveFtp')
    .replace(/handleSaveMaxHr/g, 'onSaveMaxHr')
    .replace(/handleSaveRestingHr/g, 'onSaveRestingHr')
    .replace(/handleToggleBatterySaver/g, 'onToggleBatterySaver')
    .replace(/setStravaConnected/g, 'onStravaConnectedChange')
    .replace(/fileInputRef/g, 'fileInputRef');
}

const ride = rewriteHandlers(rideBody.trim());
const history = rewriteHandlers(historyBody.trim());
const profile = rewriteHandlers(profileBody.trim());

const out = `import React, { useRef, useState } from 'react';
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
import { isStravaConnected } from '../utils/stravaAuth';

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
        className="dark z-[99999] flex w-full max-w-sm flex-col gap-0 border-r border-border bg-zinc-950 p-0 text-foreground sm:max-w-sm"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)'
        }}
      >
        <SheetHeader className="shrink-0 space-y-0 border-b border-border px-4 pt-4 pb-3 text-left">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary">
                <Navigation2 className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <SheetTitle className="truncate font-sports text-lg font-bold tracking-wide">
                  ImageneCycle
                </SheetTitle>
                <SheetDescription className="text-sm">Menu</SheetDescription>
              </div>
            </div>
            <SheetClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className="min-h-11 min-w-11"
                aria-label="Close menu"
              >
                <X className="h-6 w-6" />
              </Button>
            </SheetClose>
          </div>
        </SheetHeader>

        <Tabs
          value={tab}
          onValueChange={v => setTab(v as MenuDrawerTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="shrink-0 px-4 pt-3">
            <TabsList className="grid h-12 w-full grid-cols-3 bg-muted font-sports font-bold">
              <TabsTrigger value="routes" className="min-h-11 gap-1.5 text-sm">
                <Navigation2 className="h-4 w-4 shrink-0" />
                Ride
              </TabsTrigger>
              <TabsTrigger value="history" className="relative min-h-11 gap-1.5 text-sm">
                <History className="h-4 w-4 shrink-0" />
                History
                {rideHistory.length > 0 ? (
                  <Badge
                    variant="secondary"
                    className="ml-0.5 h-5 min-w-5 px-1 text-[10px]"
                  >
                    {rideHistory.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="profile" className="min-h-11 gap-1.5 text-sm">
                <Sliders className="h-4 w-4 shrink-0" />
                Settings
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="px-4 py-4">
              <TabsContent value="routes" className="mt-0 outline-none">
${ride}
              </TabsContent>
              <TabsContent value="history" className="mt-0 outline-none">
${history}
              </TabsContent>
              <TabsContent value="profile" className="mt-0 outline-none">
${profile}
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        <Separator />
        <div className="shrink-0 px-4 pt-3 pb-4">
          <Button
            type="button"
            variant="outline"
            className="min-h-12 w-full gap-2 font-sports font-semibold text-muted-foreground hover:text-destructive"
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
`;

fs.writeFileSync('src/components/MenuSheet.tsx', out);
console.log('Wrote src/components/MenuSheet.tsx', out.length, 'chars');
console.log({ ride: ride.length, history: history.length, profile: profile.length });
