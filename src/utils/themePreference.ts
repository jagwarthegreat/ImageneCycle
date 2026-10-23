/**
 * Day/night theme preference — auto switches at 06:00 / 18:00 local time.
 */

export type ThemeMode = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'magene-theme-mode';

/** Dark from 18:00 inclusive through 05:59; light from 06:00 through 17:59. */
export function isNightByLocalClock(date: Date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= 18 || hour < 6;
}

export function loadThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'auto';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'auto') return raw;
  } catch {
    /* ignore */
  }
  return 'auto';
}

export function saveThemeMode(mode: ThemeMode): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function resolveIsDarkMode(mode: ThemeMode, date: Date = new Date()): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return isNightByLocalClock(date);
}

export function cycleThemeMode(mode: ThemeMode): ThemeMode {
  if (mode === 'auto') return 'light';
  if (mode === 'light') return 'dark';
  return 'auto';
}
