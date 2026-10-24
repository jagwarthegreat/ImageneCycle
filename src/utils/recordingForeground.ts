/**
 * Android foreground service notification while a ride session is active.
 * Metrics + Pause/Resume/Stop; route snapshot attached when plugin accepts it.
 */
import { Capacitor } from '@capacitor/core';
import {
  ForegroundService,
  Importance,
  ServiceType
} from '@capawesome-team/capacitor-android-foreground-service';
import { renderRouteSnapshot } from './routeSnapshot';

const NOTIF_ID = 70601;
const CHANNEL_ID = 'imagenecycle_recording';
const BTN_PAUSE = 1;
const BTN_RESUME = 2;
const BTN_STOP = 3;

let started = false;
let listenersBound = false;
let lastSyncAt = 0;
let lastSnapshotAt = 0;

export type RecordingNotifAction = 'pause' | 'resume' | 'stop';

export interface RecordingNotifMetrics {
  status: string;
  distanceKm: number;
  gainM: number;
  ridingSeconds: number;
  paused: boolean;
  breadcrumbs?: { lat: number; lng: number }[];
  headingDeg?: number;
}

type ActionHandlers = {
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
};

let handlers: ActionHandlers | null = null;

function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function formatRidingTime(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}m ${String(r).padStart(2, '0')}s`;
}

export function formatRecordingNotifBody(m: RecordingNotifMetrics): string {
  const dist = `${m.distanceKm.toFixed(2)} km`;
  const gain = `+${Math.round(m.gainM)} m`;
  const time = formatRidingTime(m.ridingSeconds);
  return `${m.status} · ${dist} · ${gain} · ${time}`;
}

async function ensureListeners(): Promise<void> {
  if (!isAndroidNative() || listenersBound) return;
  listenersBound = true;
  try {
    await ForegroundService.addListener('notificationTapped', async () => {
      try {
        await ForegroundService.moveToForeground();
      } catch {
        /* overlay may be denied */
      }
    });
    await ForegroundService.addListener('buttonClicked', async (event: { buttonId?: number }) => {
      const id = event?.buttonId;
      if (id === BTN_PAUSE) handlers?.onPause();
      else if (id === BTN_RESUME) handlers?.onResume();
      else if (id === BTN_STOP) {
        try {
          await ForegroundService.moveToForeground();
        } catch {
          /* ignore */
        }
        handlers?.onStop();
      }
    });
  } catch {
    /* ignore */
  }
}

export function bindRecordingNotificationActions(next: ActionHandlers): void {
  handlers = next;
  void ensureListeners();
}

function buttonsFor(paused: boolean) {
  return paused
    ? [
        { title: 'Resume', id: BTN_RESUME },
        { title: 'Stop', id: BTN_STOP }
      ]
    : [
        { title: 'Pause', id: BTN_PAUSE },
        { title: 'Stop', id: BTN_STOP }
      ];
}

async function applyNotification(body: string, paused: boolean, silent: boolean, largeImage?: string | null): Promise<void> {
  if (!isAndroidNative()) return;
  await ensureListeners();

  try {
    const perm = await ForegroundService.checkPermissions();
    if (perm.display !== 'granted') {
      await ForegroundService.requestPermissions();
    }
  } catch {
    /* ignore */
  }

  try {
    await ForegroundService.createNotificationChannel({
      id: CHANNEL_ID,
      name: 'Ride recording',
      description: 'Shown while an ImageneCycle activity is running',
      importance: Importance.Default
    });
  } catch {
    /* channel may already exist */
  }

  const opts: Record<string, unknown> = {
    id: NOTIF_ID,
    title: 'ImageneCycle',
    body,
    smallIcon: 'ic_stat_recording',
    notificationChannelId: CHANNEL_ID,
    silent,
    serviceType: ServiceType.Location,
    buttons: buttonsFor(paused)
  };
  if (largeImage) {
    opts.largeBody = body;
    opts.largeIcon = largeImage;
  }

  // Cast via unknown: Capawesome types omit optional largeIcon extras we try best-effort.
  const castOpts = opts as unknown as Parameters<typeof ForegroundService.startForegroundService>[0];
  try {
    if (started) {
      await ForegroundService.updateForegroundService(castOpts);
    } else {
      await ForegroundService.startForegroundService(castOpts);
      started = true;
    }
  } catch (err) {
    if (largeImage) {
      delete opts.largeIcon;
      delete opts.largeBody;
      const bare = opts as unknown as Parameters<typeof ForegroundService.startForegroundService>[0];
      try {
        if (started) {
          await ForegroundService.updateForegroundService(bare);
        } else {
          await ForegroundService.startForegroundService(bare);
          started = true;
        }
        return;
      } catch (err2) {
        console.warn('recordingForeground retry:', err2);
      }
    }
    console.warn('recordingForeground apply:', err);
  }
}

/** @deprecated Prefer syncRecordingNotification */
export async function startRecordingNotification(body = 'Recording ride…'): Promise<void> {
  await applyNotification(body, false, false);
}

/** @deprecated Prefer syncRecordingNotification */
export async function updateRecordingNotification(body: string): Promise<void> {
  if (!started) {
    await startRecordingNotification(body);
    return;
  }
  await applyNotification(body, body.toLowerCase().includes('pause'), true);
}

export async function syncRecordingNotification(m: RecordingNotifMetrics): Promise<void> {
  if (!isAndroidNative()) return;
  const now = Date.now();
  if (started && now - lastSyncAt < 1000) return;
  lastSyncAt = now;

  let snapshot: string | null = null;
  if (m.breadcrumbs && m.breadcrumbs.length > 1 && now - lastSnapshotAt >= 20_000) {
    lastSnapshotAt = now;
    const recent = m.breadcrumbs.slice(-200);
    snapshot = renderRouteSnapshot({
      breadcrumbs: recent,
      headingDeg: m.headingDeg
    });
  }

  const body = formatRecordingNotifBody(m);
  await applyNotification(body, m.paused, started, snapshot);
}

export async function stopRecordingNotification(): Promise<void> {
  if (!isAndroidNative()) {
    started = false;
    return;
  }
  try {
    if (started) {
      await ForegroundService.stopForegroundService();
    }
  } catch (err) {
    console.warn('recordingForeground stop:', err);
  } finally {
    started = false;
    lastSyncAt = 0;
    lastSnapshotAt = 0;
  }
}
