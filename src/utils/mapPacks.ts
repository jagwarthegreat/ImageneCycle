/**
 * Guru-style country map packs (Magene M/N/T).
 * App ships catalog only — country binaries download into Maps Storage (OPFS/custom).
 * Map = PMTiles (OSM/Protomaps); N/T = Magene JSON. Not Guru .vm/.rt/.elv.
 */

import { FileSource, PMTiles } from 'pmtiles';
import {
  deletePackFile,
  readPackBlob,
  writePackBlob
} from './mapStorage';

export type MapLayerKind = 'map' | 'navigation' | 'topo';

export interface MapLayerSpec {
  url: string | null;
  bytes?: number;
  label: string;
  infoOnly?: boolean;
  note?: string;
  /** @deprecated Country packs are never bundled; ignored for install. */
  bundled?: boolean;
  /** Guru-style Magene filename stored in Maps Storage */
  fileName?: string;
}

export interface MapPackBBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface MapPackCatalogEntry {
  id: string;
  name: string;
  /** @deprecated No country pack ships with the app. */
  preloaded?: boolean;
  bbox: MapPackBBox;
  layers: {
    map: MapLayerSpec;
    navigation?: MapLayerSpec;
    topo?: MapLayerSpec;
  };
}

export interface LayerInstallState {
  packId: string;
  layer: MapLayerKind;
  installed: boolean;
  bytes: number;
  updatedAt: number;
  cacheKey: string;
  fileName: string;
}

const CATALOG_URL = '/maps/catalog.json';
const IDB_NAME = 'magene-map-packs-meta';
const IDB_STORE = 'layers';
const IDB_VERSION = 2;
const PMTILES_MIN_BYTES = 1024;

let catalogCache: MapPackCatalogEntry[] | null = null;
/** Cached PMTiles readers (FileSource over OPFS File — works offline). */
const pmtilesByKey = new Map<string, PMTiles>();
const abortControllers = new Map<string, AbortController>();

function clearPmtilesCache(key: string): void {
  pmtilesByKey.delete(key);
}

function asFile(blob: Blob, fileName: string): File {
  if (blob instanceof File) return blob;
  return new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
}

function cacheKey(packId: string, layer: MapLayerKind): string {
  return `magene-map-${packId}-${layer}`;
}

export function layerFileName(pack: MapPackCatalogEntry, layer: MapLayerKind): string {
  const spec = pack.layers[layer];
  if (spec?.fileName) return spec.fileName;
  const ext =
    layer === 'map' ? 'map.pmtiles' : layer === 'navigation' ? 'nav.json' : 'topo.json';
  return `${pack.id} - ${pack.name}.${ext}`;
}

/** True when filename looks like a Guru Maps Pro proprietary pack. */
export function isGuruProprietaryFileName(fileName: string): boolean {
  const n = fileName.toLowerCase();
  return (
    n.endsWith('.vm') ||
    n.endsWith('.rt') ||
    n.endsWith('.elv') ||
    n.includes('.vm.') ||
    n.includes('.rt.') ||
    n.includes('.elv.')
  );
}

export function guruUnsupportedMessage(fileName?: string): string {
  const hint = fileName ? ` (${fileName})` : '';
  return `Guru Maps proprietary pack${hint} is not supported. Download Magene .map.pmtiles / .nav.json / .topo.json from Download Maps (OpenStreetMap / Protomaps).`;
}

async function readMagic(blob: Blob, n: number): Promise<Uint8Array> {
  const buf = await blob.slice(0, n).arrayBuffer();
  return new Uint8Array(buf);
}

function magicAscii(bytes: Uint8Array, len: number): string {
  return String.fromCharCode(...bytes.slice(0, len));
}

/** Detect Guru GLMap magic (4mog / 0lcg / 0cbd). */
export function isGuruProprietaryBlob(blob: Blob, magic?: Uint8Array): boolean {
  // sync path when magic already read
  if (magic && magic.length >= 4) {
    const a = magicAscii(magic, 4);
    return a === '4mog' || a === '0lcg' || a === '0cbd';
  }
  return false;
}

export async function validatePackBlob(layer: MapLayerKind, blob: Blob): Promise<void> {
  if (!blob || blob.size <= 0) throw new Error('Empty download.');

  const head = await readMagic(blob, 16);
  if (isGuruProprietaryBlob(blob, head)) {
    throw new Error(guruUnsupportedMessage());
  }

  if (layer === 'map') {
    if (blob.size < PMTILES_MIN_BYTES) throw new Error('Map file too small to be a valid PMTiles pack.');
    if (magicAscii(head, 7) !== 'PMTiles') {
      // SPA/HTML 200 often starts with <!DOCTYPE or <html
      const sniff = magicAscii(head, 15).toLowerCase();
      if (sniff.includes('<!doc') || sniff.includes('<html') || sniff.includes('<!')) {
        throw new Error('Server returned a web page instead of PMTiles. Host the country pack at the catalog URL.');
      }
      throw new Error('Not a valid PMTiles map file (expected OSM/Protomaps extract).');
    }
    return;
  }

  // nav / topo JSON
  try {
    const text = await blob.text();
    const trimmed = text.trim();
    if (!trimmed.startsWith('{')) throw new Error('not json');
    JSON.parse(trimmed);
  } catch {
    throw new Error(`Invalid ${layer} pack — expected Magene JSON.`);
  }
}

async function isValidLocalLayer(fileName: string, layer: MapLayerKind): Promise<boolean> {
  if (isGuruProprietaryFileName(fileName)) return false;
  const blob = await readPackBlob(fileName);
  if (!blob || blob.size <= 0) return false;
  try {
    await validatePackBlob(layer, blob);
    return true;
  } catch {
    return false;
  }
}

function openMetaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'cacheKey' });
      }
    };
  });
}

async function metaGetAll(): Promise<LayerInstallState[]> {
  try {
    const db = await openMetaDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).getAll();
      req.onsuccess = () => resolve((req.result as LayerInstallState[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function metaPut(state: LayerInstallState): Promise<void> {
  const db = await openMetaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(state);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function metaDelete(key: string): Promise<void> {
  const db = await openMetaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadMapCatalog(force = false): Promise<MapPackCatalogEntry[]> {
  if (!force && catalogCache) return catalogCache;
  const res = await fetch(CATALOG_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error('Failed to load map catalog');
  const data = await res.json();
  const packs: MapPackCatalogEntry[] = Array.isArray(data.packs) ? data.packs : [];
  catalogCache = packs;
  return packs;
}

export function pointInBBox(lat: number, lng: number, bbox: MapPackBBox): boolean {
  return lat >= bbox.minLat && lat <= bbox.maxLat && lng >= bbox.minLng && lng <= bbox.maxLng;
}

export function formatBytes(n: number): string {
  if (!n || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(0)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function packCenter(bbox: MapPackBBox): { lat: number; lng: number } {
  return {
    lat: (bbox.minLat + bbox.maxLat) / 2,
    lng: (bbox.minLng + bbox.maxLng) / 2
  };
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** Installed = valid file in Maps Storage (never remote HEAD / SPA HTML). */
export async function isLayerInstalled(pack: MapPackCatalogEntry, layer: MapLayerKind): Promise<boolean> {
  const spec = pack.layers[layer];
  if (!spec || spec.infoOnly) return false;

  const fileName = layerFileName(pack, layer);
  if (await isValidLocalLayer(fileName, layer)) return true;

  const key = cacheKey(pack.id, layer);
  const meta = (await metaGetAll()).find(m => m.cacheKey === key && m.installed);
  if (!meta) return false;
  return isValidLocalLayer(meta.fileName || fileName, layer);
}

export async function getInstallSnapshot(): Promise<Record<string, Partial<Record<MapLayerKind, boolean>>>> {
  const packs = await loadMapCatalog();
  const out: Record<string, Partial<Record<MapLayerKind, boolean>>> = {};
  await Promise.all(
    packs.map(async p => {
      out[p.id] = {
        map: await isLayerInstalled(p, 'map'),
        navigation: await isLayerInstalled(p, 'navigation'),
        topo: await isLayerInstalled(p, 'topo')
      };
    })
  );
  return out;
}

/** True when any country Map (M) pack is installed locally. */
export async function hasAnyInstalledBasemap(): Promise<boolean> {
  const packs = await loadMapCatalog();
  for (const p of packs) {
    if (await isLayerInstalled(p, 'map')) return true;
  }
  return false;
}

/** Open an installed Map (M) pack as a PMTiles reader (ranged FileSource — offline-safe). */
export async function resolveLayerPmtiles(pack: MapPackCatalogEntry): Promise<PMTiles | null> {
  const spec = pack.layers.map;
  if (!spec || spec.infoOnly) return null;

  const key = cacheKey(pack.id, 'map');
  const cached = pmtilesByKey.get(key);
  if (cached) return cached;

  const fileName = layerFileName(pack, 'map');
  if (!(await isValidLocalLayer(fileName, 'map'))) return null;

  const blob = await readPackBlob(fileName);
  if (!blob) return null;

  try {
    const file = asFile(blob, fileName);
    const pmtiles = new PMTiles(new FileSource(file));
    await pmtiles.getHeader(); // prove archive opens
    pmtilesByKey.set(key, pmtiles);
    return pmtiles;
  } catch (err) {
    console.warn('Failed to open local PMTiles:', fileName, err);
    clearPmtilesCache(key);
    return null;
  }
}

/**
 * Active country basemap from local storage covering lat/lng.
 * Returns null when none installed → GpsMapView shows world overview.
 */
export async function resolveActiveBasemap(
  lat: number,
  lng: number
): Promise<{ pmtiles: PMTiles; packId: string; packName: string } | null> {
  const packs = await loadMapCatalog();
  const covering = packs.filter(p => pointInBBox(lat, lng, p.bbox));

  for (const pack of covering) {
    const pmtiles = await resolveLayerPmtiles(pack);
    if (pmtiles) return { pmtiles, packId: pack.id, packName: pack.name };
  }
  return null;
}

/** @deprecated use resolveActiveBasemap — blob URLs do not paint PMTiles reliably */
export async function resolveActiveBasemapUrl(
  lat: number,
  lng: number
): Promise<{ url: string; packId: string; packName: string } | null> {
  const active = await resolveActiveBasemap(lat, lng);
  if (!active) return null;
  // Callers must use resolveActiveBasemap; keep shape for old imports
  return { url: '', packId: active.packId, packName: active.packName };
}

export type DownloadProgress = { done: number; total: number; pct: number };

export function mapPackNotHostedMessage(url: string): string {
  return `Map pack not published yet at ${url}. On the server run: npm run maps:ph`;
}

export async function downloadMapLayer(
  pack: MapPackCatalogEntry,
  layer: MapLayerKind,
  onProgress?: (p: DownloadProgress) => void
): Promise<void> {
  const spec = pack.layers[layer];
  if (!spec?.url || spec.infoOnly) {
    throw new Error('This layer is not available for download.');
  }

  const key = cacheKey(pack.id, layer);
  const fileName = layerFileName(pack, layer);
  if (isGuruProprietaryFileName(fileName)) {
    throw new Error(guruUnsupportedMessage(fileName));
  }

  if (layer === 'map') {
    const hosted = await isRemotePackHosted(spec.url);
    if (!hosted) {
      throw new Error(mapPackNotHostedMessage(spec.url));
    }
  }

  abortControllers.get(key)?.abort();
  const ac = new AbortController();
  abortControllers.set(key, ac);

  const res = await fetch(spec.url, { signal: ac.signal, cache: 'no-cache' });
  if (!res.ok) {
    if (layer === 'map') throw new Error(mapPackNotHostedMessage(spec.url));
    throw new Error(`Download failed (${res.status}). Host the OSM pack at ${spec.url} or check your connection.`);
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (layer === 'map' && contentType.includes('text/html')) {
    throw new Error(mapPackNotHostedMessage(spec.url));
  }

  const total = Number(res.headers.get('content-length') || spec.bytes || 0);
  const reader = res.body?.getReader();
  if (!reader) throw new Error('Download stream unavailable');

  const chunks: Uint8Array[] = [];
  let done = 0;
  while (true) {
    const { value, done: finished } = await reader.read();
    if (finished) break;
    if (value) {
      chunks.push(value);
      done += value.length;
      onProgress?.({
        done,
        total: total || done,
        pct: total ? Math.min(50, Math.round((done / total) * 50)) : 0
      });
    }
  }

  const blob = new Blob(chunks as BlobPart[], { type: 'application/octet-stream' });
  try {
    await validatePackBlob(layer, blob);
  } catch (err) {
    if (layer === 'map') {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('web page') || msg.includes('PMTiles') || msg.includes('HTML')) {
        throw new Error(mapPackNotHostedMessage(spec.url));
      }
    }
    throw err;
  }

  await writePackBlob(fileName, blob, pct => {
    onProgress?.({ done: blob.size, total: blob.size, pct: 50 + Math.round(pct / 2) });
  });

  clearPmtilesCache(key);

  await metaPut({
    packId: pack.id,
    layer,
    installed: true,
    bytes: blob.size,
    updatedAt: Date.now(),
    cacheKey: key,
    fileName
  });

  abortControllers.delete(key);
}

export function cancelDownload(packId: string, layer: MapLayerKind): void {
  const key = cacheKey(packId, layer);
  abortControllers.get(key)?.abort();
  abortControllers.delete(key);
}

export async function deleteMapLayer(pack: MapPackCatalogEntry, layer: MapLayerKind): Promise<void> {
  const key = cacheKey(pack.id, layer);
  const fileName = layerFileName(pack, layer);
  await deletePackFile(fileName);
  await metaDelete(key);
  clearPmtilesCache(key);
}

export function mntBadges(installed: Partial<Record<MapLayerKind, boolean>>): string {
  const parts: string[] = [];
  if (installed.map) parts.push('M');
  if (installed.navigation) parts.push('N');
  if (installed.topo) parts.push('T');
  return parts.length ? parts.join('') : '';
}

export function packTotalBytes(pack: MapPackCatalogEntry): number {
  let n = 0;
  if (pack.layers.map?.bytes) n += pack.layers.map.bytes;
  if (pack.layers.navigation?.bytes) n += pack.layers.navigation.bytes;
  if (pack.layers.topo?.bytes) n += pack.layers.topo.bytes;
  return n;
}

/** Country layers are never bundled with the SPA. */
export function isLayerBundled(_pack: MapPackCatalogEntry, _layer: MapLayerKind): boolean {
  return false;
}

/** Optional: probe whether a remote catalog URL is currently hostable (for UI hints). */
export async function isRemotePackHosted(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-15' },
      cache: 'no-cache'
    });
    if (!(res.ok || res.status === 206)) return false;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/html')) return false;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (url.endsWith('.pmtiles') || url.includes('.pmtiles')) {
      return magicAscii(buf, 7) === 'PMTiles';
    }
    return buf.length > 0 && buf[0] === 0x7b; // '{'
  } catch {
    return false;
  }
}
