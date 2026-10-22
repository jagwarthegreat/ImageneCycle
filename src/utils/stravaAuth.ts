/**
 * Client-side Strava token storage + refresh helper.
 * Token exchange happens on Express; SPA only stores results.
 */

const ACCESS_KEY = 'magene-strava-access';
const REFRESH_KEY = 'magene-strava-refresh';
const EXPIRES_KEY = 'magene-strava-expires';

export interface StravaTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix seconds
}

export function loadStravaTokens(): StravaTokens | null {
  if (typeof window === 'undefined') return null;
  try {
    const accessToken = localStorage.getItem(ACCESS_KEY);
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    const expiresAt = parseInt(localStorage.getItem(EXPIRES_KEY) || '0', 10);
    if (!accessToken || !refreshToken) return null;
    return { accessToken, refreshToken, expiresAt };
  } catch {
    return null;
  }
}

export function saveStravaTokens(tokens: StravaTokens) {
  try {
    localStorage.setItem(ACCESS_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
    localStorage.setItem(EXPIRES_KEY, String(tokens.expiresAt));
  } catch {}
}

export function clearStravaTokens() {
  try {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(EXPIRES_KEY);
  } catch {}
}

/** Capture tokens from OAuth redirect hash (?strava=connected#access_token=...) */
export function captureStravaRedirectTokens(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('strava') !== 'connected') return false;

  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return false;

  const hashParams = new URLSearchParams(hash);
  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');
  const expiresAt = parseInt(hashParams.get('expires_at') || '0', 10);

  if (!accessToken || !refreshToken) return false;

  saveStravaTokens({ accessToken, refreshToken, expiresAt });

  // Clean URL
  const url = new URL(window.location.href);
  url.searchParams.delete('strava');
  url.hash = '';
  window.history.replaceState({}, '', url.pathname + url.search);

  return true;
}

export function isStravaConnected(): boolean {
  return !!loadStravaTokens()?.accessToken;
}

/** Returns a valid access token, refreshing via Express if near expiry */
export async function getValidStravaAccessToken(): Promise<string | null> {
  let tokens = loadStravaTokens();
  if (!tokens) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  // Refresh if expiring within 60s
  if (tokens.expiresAt > nowSec + 60) {
    return tokens.accessToken;
  }

  try {
    const res = await fetch('/api/strava/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tokens.refreshToken })
    });
    if (!res.ok) {
      clearStravaTokens();
      return null;
    }
    const data = await res.json();
    tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || tokens.refreshToken,
      expiresAt: data.expires_at
    };
    saveStravaTokens(tokens);
    return tokens.accessToken;
  } catch {
    return null;
  }
}

export function startStravaConnect() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Strava needs an internet connection.');
  }
  if (typeof window !== 'undefined') {
    window.location.href = '/api/strava/auth';
  }
}
