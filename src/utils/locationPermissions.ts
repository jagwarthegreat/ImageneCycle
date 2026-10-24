/**
 * Fine location → Android “Allow all the time” (background) for lock-screen recording.
 *
 * Callers: App.tsx handleStartNewActivity / Start gate.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export interface RideLocationPermissionResult {
  ok: boolean;
  /** Fine / while-in-use granted but background missing — open settings. */
  needSettings: boolean;
  location: 'granted' | 'denied' | 'prompt' | 'unknown';
  background: 'granted' | 'denied' | 'prompt' | 'unknown' | 'n/a';
}

interface BackgroundLocationPlugin {
  check(): Promise<{ granted: boolean }>;
  request(): Promise<{ granted: boolean; openedSettings?: boolean }>;
  openSettings(): Promise<{ granted?: boolean; openedSettings?: boolean } | void>;
}

const BackgroundLocation = registerPlugin<BackgroundLocationPlugin>('BackgroundLocation');

function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

let lastResult: RideLocationPermissionResult | null = null;

export function getLastRideLocationPermission(): RideLocationPermissionResult | null {
  return lastResult;
}

/** Wait until the WebView is visible again (return from system Location settings). */
export function waitForAppVisible(): Promise<void> {
  if (typeof document === 'undefined' || document.visibilityState === 'visible') {
    return Promise.resolve();
  }
  return new Promise(resolve => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        document.removeEventListener('visibilitychange', onVis);
        resolve();
      }
    };
    document.addEventListener('visibilitychange', onVis);
  });
}

export async function openRideLocationSettings(): Promise<void> {
  if (!isAndroidNative()) return;
  try {
    await BackgroundLocation.openSettings();
  } catch (err) {
    console.warn('openRideLocationSettings:', err);
  }
}

export async function ensureRideLocationPermissions(
  opts?: { skipBackgroundRationale?: boolean }
): Promise<RideLocationPermissionResult> {
  if (!isAndroidNative()) {
    lastResult = { ok: true, needSettings: false, location: 'granted', background: 'n/a' };
    return lastResult;
  }

  try {
    let status = await Geolocation.checkPermissions();
    if (status.location !== 'granted') {
      status = await Geolocation.requestPermissions({ permissions: ['location'] });
    }
    if (status.location !== 'granted') {
      lastResult = {
        ok: false,
        needSettings: status.location === 'denied',
        location: status.location === 'denied' ? 'denied' : 'prompt',
        background: 'unknown'
      };
      return lastResult;
    }

    let bg = await BackgroundLocation.check();
    if (!bg.granted) {
      if (!opts?.skipBackgroundRationale) {
        const proceed = window.confirm(
          'Next, choose Location → “Allow all the time” so recording continues with the screen locked.\n\nContinue?'
        );
        if (!proceed) {
          lastResult = {
            ok: false,
            needSettings: true,
            location: 'granted',
            background: 'denied'
          };
          return lastResult;
        }
      }
      const req = await BackgroundLocation.request();
      bg = { granted: !!req.granted };
    }

    lastResult = {
      ok: bg.granted,
      needSettings: !bg.granted,
      location: 'granted',
      background: bg.granted ? 'granted' : 'denied'
    };
    return lastResult;
  } catch (err) {
    console.warn('ensureRideLocationPermissions:', err);
    lastResult = { ok: false, needSettings: true, location: 'unknown', background: 'unknown' };
    return lastResult;
  }
}
