/**
 * Android foreground service notification while a ride session is active.
 * No-op on web / non-native platforms.
 */
import { Capacitor } from '@capacitor/core';
import {
  ForegroundService,
  Importance,
  ServiceType
} from '@capawesome-team/capacitor-android-foreground-service';

const NOTIF_ID = 70601;
const CHANNEL_ID = 'imagenecycle_recording';

let started = false;
let tapBound = false;

function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

async function ensureTapOpensApp(): Promise<void> {
  if (!isAndroidNative() || tapBound) return;
  tapBound = true;
  try {
    await ForegroundService.addListener('notificationTapped', async () => {
      try {
        await ForegroundService.moveToForeground();
      } catch {
        /* overlay permission may be denied — system still brings task forward on many OEMs */
      }
    });
  } catch {
    /* ignore */
  }
}

export async function startRecordingNotification(body = 'Recording ride…'): Promise<void> {
  if (!isAndroidNative()) return;
  try {
    await ensureTapOpensApp();
    const perm = await ForegroundService.checkPermissions();
    if (perm.display !== 'granted') {
      await ForegroundService.requestPermissions();
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

    const opts = {
      id: NOTIF_ID,
      title: 'ImageneCycle',
      body,
      smallIcon: 'ic_stat_recording',
      notificationChannelId: CHANNEL_ID,
      silent: false,
      serviceType: ServiceType.Location
    };

    if (started) {
      await ForegroundService.updateForegroundService(opts);
    } else {
      await ForegroundService.startForegroundService(opts);
      started = true;
    }
  } catch (err) {
    console.warn('recordingForeground start:', err);
  }
}

export async function updateRecordingNotification(body: string): Promise<void> {
  if (!started) {
    await startRecordingNotification(body);
    return;
  }
  if (!isAndroidNative()) return;
  try {
    await ForegroundService.updateForegroundService({
      id: NOTIF_ID,
      title: 'ImageneCycle',
      body,
      smallIcon: 'ic_stat_recording',
      notificationChannelId: CHANNEL_ID,
      silent: true,
      serviceType: ServiceType.Location
    });
  } catch (err) {
    console.warn('recordingForeground update:', err);
  }
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
  }
}
