/**
 * Persist user-created RouteData — localStorage first, IndexedDB if quota exceeded.
 */
import { RouteData } from '../types/cycling';

const STORAGE_KEY = 'magene-user-routes';
const IDB_NAME = 'magene-routes-idb';
const IDB_STORE = 'routes';
const IDB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
  });
}

async function idbGetAll(): Promise<RouteData[]> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as RouteData[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function idbPut(route: RouteData): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(route);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(routeId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(routeId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbReplaceAll(routes: RouteData[]): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.clear();
    for (const r of routes) store.put(r);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function loadUserRoutes(): RouteData[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Async load merges localStorage + IndexedDB (IDB wins on id conflict). */
export async function loadUserRoutesAsync(): Promise<RouteData[]> {
  const fromLs = loadUserRoutes();
  const fromIdb = await idbGetAll();
  if (fromIdb.length === 0) return fromLs;
  const map = new Map<string, RouteData>();
  for (const r of fromLs) map.set(r.id, r);
  for (const r of fromIdb) map.set(r.id, r);
  return Array.from(map.values());
}

export function saveUserRoute(route: RouteData): RouteData[] {
  const existing = loadUserRoutes().filter(r => r.id !== route.id);
  const updated = [route, ...existing];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('localStorage quota — persisting route to IndexedDB', err);
    void idbPut(route);
    // Keep a slim index in LS without full point arrays if needed
    try {
      const slim = updated.map(r =>
        r.id === route.id
          ? {
              ...r,
              points: r.points?.slice(0, 2) || [],
              climbs: r.climbs || [],
              turns: r.turns || []
            }
          : r
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    } catch {
      /* ignore */
    }
    void idbPut(route);
    return updated;
  }
  // Also mirror to IDB for large rides / offline reliability
  void idbPut(route);
  return updated;
}

export function deleteUserRoute(routeId: string): RouteData[] {
  const updated = loadUserRoutes().filter(r => r.id !== routeId);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to delete user route:', err);
  }
  void idbDelete(routeId);
  return updated;
}

export async function persistRoutesMirror(routes: RouteData[]): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
  } catch {
    await idbReplaceAll(routes);
  }
}
