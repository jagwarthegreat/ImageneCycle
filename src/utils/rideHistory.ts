import { RideHistoryItem, ActiveRideSession, BreadcrumbPoint } from '../types/cycling';

const STORAGE_KEY = 'magene-c706-ride-history';
const ACTIVE_SESSION_KEY = 'magene-active-session-v1';

export function loadRideHistory(): RideHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function loadActiveSession(): ActiveRideSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveActiveSession(session: ActiveRideSession): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
  } catch (err) {
    console.error('Failed to save active session:', err);
  }
}

export function clearActiveSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {}
}

export function saveRideToHistory(data: {
  routeName: string;
  timeElapsed: number;
  ridingTimeSeconds?: number;
  saddleTimeSeconds?: number;
  distanceMeters: number;
  totalAscentMeters: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  calories: number;
  avgPowerWatts?: number | null;
  avgCadenceRpm?: number | null;
  avgHeartRateBpm?: number | null;
  breadcrumbs?: BreadcrumbPoint[];
}): RideHistoryItem | null {
  if (typeof window === 'undefined') return null;
  // Ignore negligible rides (under 10 meters and under 5 seconds)
  if (data.distanceMeters < 10 && data.timeElapsed < 5) return null;

  try {
    const existing = loadRideHistory();
    const now = new Date();
    const dateFormatted = `${now.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })} at ${now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;

    const newItem: RideHistoryItem = {
      id: `ride-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      dateFormatted,
      routeName: data.routeName || 'Road Ride',
      timeElapsed: data.timeElapsed,
      ridingTimeSeconds: data.ridingTimeSeconds ?? data.timeElapsed,
      saddleTimeSeconds: data.saddleTimeSeconds ?? data.timeElapsed,
      distanceMeters: Math.round(data.distanceMeters),
      totalAscentMeters: Math.round(data.totalAscentMeters),
      avgSpeedKmh: Math.round(data.avgSpeedKmh * 10) / 10,
      maxSpeedKmh: Math.round(data.maxSpeedKmh * 10) / 10,
      calories: Math.round(data.calories),
      avgPowerWatts: data.avgPowerWatts ? Math.round(data.avgPowerWatts) : null,
      avgCadenceRpm: data.avgCadenceRpm ? Math.round(data.avgCadenceRpm) : null,
      avgHeartRateBpm: data.avgHeartRateBpm ? Math.round(data.avgHeartRateBpm) : null,
      breadcrumbs: data.breadcrumbs && data.breadcrumbs.length > 0 ? data.breadcrumbs : undefined
    };

    const updated = [newItem, ...existing.slice(0, 49)]; // store up to 50 rides
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // If full array exceeds storage quota, save with slightly downsampled points
      const compactUpdated = updated.map(item => {
        if (!item.breadcrumbs || item.breadcrumbs.length <= 1500) return item;
        const step = Math.ceil(item.breadcrumbs.length / 1500);
        return {
          ...item,
          breadcrumbs: item.breadcrumbs.filter((_, idx) => idx % step === 0)
        };
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(compactUpdated));
    }
    // Clear active session once completed and archived
    clearActiveSession();
    return newItem;
  } catch (err) {
    console.error('Failed to save ride to localStorage:', err);
    return null;
  }
}

export function deleteRideFromHistory(id: string): RideHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const existing = loadRideHistory();
    const updated = existing.filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function clearRideHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
