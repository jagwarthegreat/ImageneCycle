/**
 * Guru-style country map packs (Magene M/N/T).
 * App ships catalog only — country binaries install from local {slug}-maps.zip into Maps Storage.
 * Map = PMTiles (OSM/Protomaps); N = Magene JSON; T = topo JSON + contour PMTiles.
 * Not Guru .vm/.rt/.elv.
 */

import { Capacitor } from '@capacitor/core';
import { FileSource, PMTiles } from 'pmtiles';
import { deletePackFile, readPackBlob } from './mapStorage';
import {
  extractEntriesFromZipSource,
  resolveZipSource,
  slugFromPackUrl,
  zipEntryNames,
  type NeededZipEntry,
  type ZipSource
} from './mapZipInstall';

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
  /** Companion contour PMTiles URL (Topographic Data). */
  contourUrl?: string | null;
  contourBytes?: number;
  contourFileName?: string;
}

/** Parsed magene-topo-v2 (and v1) manifest. */
export interface TopoManifest {
  format?: string;
  id?: string;
  name?: string;
  contour?: {
    url?: string | null;
    fileName?: string;
    bytes?: number;
    dataLayer?: string;
  };
  elevation?: {
    source?: string;
    demPmtiles?: string | null;
    demNote?: string;
  };
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

const DEFAULT_CATALOG_URL = '/maps/catalog.json';
const IDB_NAME = 'magene-map-packs-meta';
const IDB_STORE = 'layers';
const IDB_VERSION = 2;
const PMTILES_MIN_BYTES = 1024;

let catalogCache: MapPackCatalogEntry[] | null = null;
/** Cached PMTiles readers (FileSource over OPFS File — works offline). */
const pmtilesByKey = new Map<string, PMTiles>();
const abortControllers = new Map<string, AbortController>();

/** Public Storage / CDN root (no trailing slash), e.g. Supabase map-packs bucket. */
export function mapPackBaseUrl(): string {
  const raw = (import.meta.env.VITE_MAP_PACK_BASE_URL as string | undefined)?.trim() || '';
  return raw.replace(/\/$/, '');
}

/** Catalog fetch URL — optional remote Edge Function; else bundled /maps/catalog.json. */
export function catalogUrl(): string {
  const remote = (import.meta.env.VITE_MAP_CATALOG_URL as string | undefined)?.trim();
  if (remote) return remote;
  return DEFAULT_CATALOG_URL;
}

/**
 * Resolve catalog-relative pack URLs against VITE_MAP_PACK_BASE_URL.
 * Absolute http(s) URLs are left unchanged; without a base URL, relative paths stay same-origin.
 */
export function resolvePackUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = mapPackBaseUrl();
  if (!base) return trimmed;
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${base}${path}`;
}

function rewriteLayerUrls(spec: MapLayerSpec | undefined): MapLayerSpec | undefined {
  if (!spec) return spec;
  return {
    ...spec,
    url: resolvePackUrl(spec.url),
    contourUrl: resolvePackUrl(spec.contourUrl ?? null) ?? undefined
  };
}

function rewriteCatalogPack(pack: MapPackCatalogEntry): MapPackCatalogEntry {
  return {
    ...pack,
    layers: {
      map: rewriteLayerUrls(pack.layers.map)!,
      navigation: rewriteLayerUrls(pack.layers.navigation),
      topo: rewriteLayerUrls(pack.layers.topo)
    }
  };
}

function clearPmtilesCache(key: string): void {
  pmtilesByKey.delete(key);
}

/** Drop cached PMTiles handles (e.g. after lock-screen resume / blank basemap). */
export function clearAllPmtilesCaches(): void {
  pmtilesByKey.clear();
}

/** Zip entries needed to install all installable layers (M+N+T) in one extract. */
export function neededZipEntriesForPack(pack: MapPackCatalogEntry): NeededZipEntry[] {
  const byZip = new Map<string, NeededZipEntry>();
  for (const layer of ['map', 'navigation', 'topo'] as MapLayerKind[]) {
    const spec = pack.layers[layer];
    if (!spec || spec.infoOnly) continue;
    for (const e of neededZipEntriesForLayer(pack, layer)) {
      byZip.set(e.zipName, e);
    }
  }
  return [...byZip.values()];
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

export function contourFileName(pack: MapPackCatalogEntry): string {
  const spec = pack.layers.topo;
  if (spec?.contourFileName) return spec.contourFileName;
  return `${pack.id} - ${pack.name}.contour.pmtiles`;
}

/** Catalog URL basename slug, e.g. philippines from …/philippines.pmtiles */
export function packSlug(pack: MapPackCatalogEntry): string {
  return slugFromPackUrl(pack.layers.map?.url, pack.name || pack.id);
}

function neededZipEntriesForLayer(pack: MapPackCatalogEntry, layer: MapLayerKind): NeededZipEntry[] {
  const names = zipEntryNames(packSlug(pack));
  if (layer === 'map') {
    return [{ zipName: names.map, storageName: layerFileName(pack, 'map'), kind: 'pmtiles' }];
  }
  if (layer === 'navigation') {
    return [
      {
        zipName: names.navigation,
        storageName: layerFileName(pack, 'navigation'),
        kind: 'json'
      }
    ];
  }
  return [
    { zipName: names.topo, storageName: layerFileName(pack, 'topo'), kind: 'json' },
    { zipName: names.contour, storageName: contourFileName(pack), kind: 'pmtiles' }
  ];
}

export function resolveContourUrl(pack: MapPackCatalogEntry, manifest?: TopoManifest | null): string | null {
  if (pack.layers.topo?.contourUrl) return resolvePackUrl(pack.layers.topo.contourUrl);
  if (manifest?.contour?.url) return resolvePackUrl(manifest.contour.url);
  // Convention: sibling of topo.json under /maps/packs/{slug}.contour.pmtiles
  const topoUrl = pack.layers.topo?.url;
  if (topoUrl && /\.topo\.json$/i.test(topoUrl)) {
    return resolvePackUrl(topoUrl.replace(/\.topo\.json$/i, '.contour.pmtiles'));
  }
  return null;
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
  return `Guru Maps proprietary pack${hint} is not supported. Download Magene .map.pmtiles / .nav.json / .topo.json (+ contour.pmtiles) from Download Maps (OpenStreetMap / Protomaps).`;
}

async function assertPmtilesBlob(blob: Blob, label: string): Promise<void> {
  if (blob.size < PMTILES_MIN_BYTES) throw new Error(`${label} too small to be a valid PMTiles pack.`);
  const head = await readMagic(blob, 16);
  if (isGuruProprietaryBlob(blob, head)) throw new Error(guruUnsupportedMessage());
  if (magicAscii(head, 7) !== 'PMTiles') {
    const sniff = magicAscii(head, 15).toLowerCase();
    if (sniff.includes('<!doc') || sniff.includes('<html') || sniff.includes('<!')) {
      throw new Error(`Server returned a web page instead of ${label}.`);
    }
    throw new Error(`Not a valid ${label} (expected PMTiles).`);
  }
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
    await assertPmtilesBlob(blob, 'PMTiles map file');
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

export function parseTopoManifest(blob: Blob): Promise<TopoManifest> {
  return blob.text().then(text => JSON.parse(text.trim()) as TopoManifest);
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
  const res = await fetch(catalogUrl(), { cache: 'no-cache' });
  if (!res.ok) throw new Error('Failed to load map catalog');
  const data = await res.json();
  const packs: MapPackCatalogEntry[] = Array.isArray(data.packs) ? data.packs : [];
  catalogCache = packs.map(rewriteCatalogPack);
  return catalogCache;
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

async function openLocalPmtiles(fileName: string, cacheId: string): Promise<PMTiles | null> {
  const cached = pmtilesByKey.get(cacheId);
  if (cached) return cached;

  const blob = await readPackBlob(fileName);
  if (!blob || blob.size < PMTILES_MIN_BYTES) return null;
  try {
    await assertPmtilesBlob(blob, fileName);
  } catch {
    return null;
  }

  try {
    const file = asFile(blob, fileName);
    const pmtiles = new PMTiles(new FileSource(file));
    await pmtiles.getHeader();
    pmtilesByKey.set(cacheId, pmtiles);
    return pmtiles;
  } catch (err) {
    console.warn('Failed to open local PMTiles:', fileName, err);
    clearPmtilesCache(cacheId);
    return null;
  }
}

/** Contour PMTiles for the pack covering lat/lng when Topographic Data is installed. */
export async function resolveActiveContour(
  lat: number,
  lng: number
): Promise<{ pmtiles: PMTiles; packId: string; packName: string } | null> {
  const packs = await loadMapCatalog();
  const covering = packs.filter(p => pointInBBox(lat, lng, p.bbox));

  for (const pack of covering) {
    if (!(await isLayerInstalled(pack, 'topo'))) continue;
    const fileName = contourFileName(pack);
    const key = `magene-map-${pack.id}-contour`;
    const pmtiles = await openLocalPmtiles(fileName, key);
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
  if (Capacitor.isNativePlatform()) {
    return `Map packs install from a local zip on this phone (Download/ImageneCycle), not from the network (${url}).`;
  }
  return `Map packs install from a local zip (Browse). Optional CDN URL unused for install: ${url}`;
}

function looksLikePmtilesUrl(url: string): boolean {
  return url.endsWith('.pmtiles') || url.includes('.pmtiles');
}

function magicLooksValid(url: string, buf: Uint8Array): boolean {
  if (!buf.length) return false;
  if (looksLikePmtilesUrl(url)) return magicAscii(buf, 7) === 'PMTiles';
  return buf[0] === 0x7b; // '{'
}

/**
 * Read only the first ~16 bytes then abort — Capacitor asset server often ignores Range.
 */
async function probePackMagicPrefix(url: string): Promise<boolean> {
  const ac = new AbortController();
  try {
    const res = await fetch(url, { signal: ac.signal, cache: 'no-cache' });
    if (!res.ok) return false;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/html')) return false;

    const reader = res.body?.getReader();
    if (!reader) {
      const buf = new Uint8Array(await res.arrayBuffer());
      return magicLooksValid(url, buf.slice(0, 16));
    }

    const chunks: Uint8Array[] = [];
    let got = 0;
    while (got < 16) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value?.length) {
        chunks.push(value);
        got += value.length;
      }
    }
    ac.abort();
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
    const merged = new Uint8Array(got);
    let off = 0;
    for (const c of chunks) {
      merged.set(c.subarray(0, Math.min(c.length, merged.length - off)), off);
      off += c.length;
      if (off >= merged.length) break;
    }
    return magicLooksValid(url, merged);
  } catch {
    return false;
  } finally {
    ac.abort();
  }
}

/**
 * True when catalog URL serves a valid pack (app-bundled asset or remote).
 * Tries Range first, then a short streamed GET for Capacitor/WebView hosts.
 */
export async function isPackSourceAvailable(url: string): Promise<boolean> {
  if (await isRemotePackHosted(url)) return true;
  return probePackMagicPrefix(url);
}

/**
 * Install a layer from local {slug}-maps.zip (Download/ImageneCycle scan or Browse File).
 */
export async function installMapLayerFromZip(
  pack: MapPackCatalogEntry,
  layer: MapLayerKind,
  opts?: { file?: File | null; source?: ZipSource },
  onProgress?: (p: DownloadProgress) => void
): Promise<void> {
  const spec = pack.layers[layer];
  if (!spec || spec.infoOnly) {
    throw new Error('This layer is not available for install.');
  }

  const key = cacheKey(pack.id, layer);
  const fileName = layerFileName(pack, layer);
  if (isGuruProprietaryFileName(fileName)) {
    throw new Error(guruUnsupportedMessage(fileName));
  }

  abortControllers.get(key)?.abort();
  const ac = new AbortController();
  abortControllers.set(key, ac);

  try {
    const slug = packSlug(pack);
    const source = opts?.source || (await resolveZipSource(slug, opts?.file));
    const entries = neededZipEntriesForLayer(pack, layer);
    const written = await extractEntriesFromZipSource(source, entries, onProgress, ac.signal);

    let totalBytes = 0;
    for (const n of written.values()) totalBytes += n;

    if (!written.has(fileName)) {
      throw new Error(`Zip did not contain the files needed for ${spec.label}.`);
    }

    // Re-validate installed bytes against layer rules
    const installedBlob = await readPackBlob(fileName);
    if (!installedBlob) throw new Error(`Failed to write ${fileName}`);
    await validatePackBlob(layer, installedBlob);

    if (layer === 'topo') {
      clearPmtilesCache(`magene-map-${pack.id}-contour`);
    }
    clearPmtilesCache(key);

    await metaPut({
      packId: pack.id,
      layer,
      installed: true,
      bytes: totalBytes,
      updatedAt: Date.now(),
      cacheKey: key,
      fileName
    });
  } finally {
    abortControllers.delete(key);
  }
}

/**
 * Install M + N + T from one {slug}-maps.zip (single extract).
 * Map layer missing → hard fail; N/T missing → skip that layer (partial).
 */
export async function installPackFromZip(
  pack: MapPackCatalogEntry,
  opts?: { file?: File | null; source?: ZipSource },
  onProgress?: (p: DownloadProgress) => void
): Promise<{ installed: MapLayerKind[]; missing: MapLayerKind[] }> {
  const packKey = `pack:${pack.id}`;
  abortControllers.get(packKey)?.abort();
  const ac = new AbortController();
  abortControllers.set(packKey, ac);

  const installed: MapLayerKind[] = [];
  const missing: MapLayerKind[] = [];

  try {
    const slug = packSlug(pack);
    const source = opts?.source || (await resolveZipSource(slug, opts?.file));
    const entries = neededZipEntriesForPack(pack);
    if (!entries.length) {
      throw new Error('This pack has no installable layers.');
    }

    const written = await extractEntriesFromZipSource(source, entries, onProgress, ac.signal);

    for (const layer of ['map', 'navigation', 'topo'] as MapLayerKind[]) {
      const spec = pack.layers[layer];
      if (!spec || spec.infoOnly) continue;

      const fileName = layerFileName(pack, layer);
      if (isGuruProprietaryFileName(fileName)) {
        throw new Error(guruUnsupportedMessage(fileName));
      }

      if (!written.has(fileName)) {
        if (layer === 'map') {
          throw new Error(`Zip did not contain the map file (${fileName}).`);
        }
        missing.push(layer);
        console.warn(`Zip missing ${layer} entry for ${pack.name}:`, fileName);
        continue;
      }

      if (layer === 'topo') {
        const contourName = contourFileName(pack);
        if (!written.has(contourName)) {
          missing.push(layer);
          console.warn(`Zip missing contour for ${pack.name}:`, contourName);
          continue;
        }
      }

      const installedBlob = await readPackBlob(fileName);
      if (!installedBlob) {
        if (layer === 'map') throw new Error(`Failed to write ${fileName}`);
        missing.push(layer);
        continue;
      }
      await validatePackBlob(layer, installedBlob);

      let totalBytes = installedBlob.size;
      if (layer === 'topo') {
        const contourBlob = await readPackBlob(contourFileName(pack));
        if (contourBlob) totalBytes += contourBlob.size;
        clearPmtilesCache(`magene-map-${pack.id}-contour`);
      }

      const key = cacheKey(pack.id, layer);
      clearPmtilesCache(key);

      await metaPut({
        packId: pack.id,
        layer,
        installed: true,
        bytes: totalBytes,
        updatedAt: Date.now(),
        cacheKey: key,
        fileName
      });
      installed.push(layer);
    }

    return { installed, missing };
  } finally {
    abortControllers.delete(packKey);
  }
}

/** @deprecated Use installMapLayerFromZip — network CDN install removed. */
export async function downloadMapLayer(
  pack: MapPackCatalogEntry,
  layer: MapLayerKind,
  onProgress?: (p: DownloadProgress) => void
): Promise<void> {
  return installMapLayerFromZip(pack, layer, undefined, onProgress);
}

export function cancelDownload(packId: string, layer?: MapLayerKind): void {
  if (layer) {
    const key = cacheKey(packId, layer);
    abortControllers.get(key)?.abort();
    abortControllers.delete(key);
  }
  const packKey = `pack:${packId}`;
  abortControllers.get(packKey)?.abort();
  abortControllers.delete(packKey);
}

export async function deleteMapLayer(pack: MapPackCatalogEntry, layer: MapLayerKind): Promise<void> {
  const key = cacheKey(pack.id, layer);
  const fileName = layerFileName(pack, layer);
  await deletePackFile(fileName);
  if (layer === 'topo') {
    const cName = contourFileName(pack);
    await deletePackFile(cName);
    clearPmtilesCache(`magene-map-${pack.id}-contour`);
  }
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
  // topo.bytes should already include contour; add contourBytes only if topo.bytes omitted it
  if (pack.layers.topo?.contourBytes && !pack.layers.topo?.bytes) {
    n += pack.layers.topo.contourBytes;
  }
  return n;
}

/**
 * True when the layer URL is still same-origin relative (no VITE_MAP_PACK_BASE_URL).
 * After catalog rewrite, remote CDN URLs are absolute https — not "in app".
 */
export function isLayerBundled(pack: MapPackCatalogEntry, layer: MapLayerKind): boolean {
  const url = pack.layers[layer]?.url;
  return !!url && url.startsWith('/');
}

/** Probe via HTTP Range (CDN / Vite). Capacitor assets often ignore Range — use isPackSourceAvailable. */
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

    // Hosts that ignore Range may return the whole ~700MB body as 200 — never buffer that.
    const contentRange = res.headers.get('content-range');
    const contentLength = Number(res.headers.get('content-length') || 0);
    if (res.status !== 206 && !contentRange && contentLength > 64) {
      try {
        await res.body?.cancel();
      } catch {
        /* ignore */
      }
      return false;
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    return magicLooksValid(url, buf);
  } catch {
    return false;
  }
}
