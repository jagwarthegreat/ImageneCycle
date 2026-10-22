/**
 * Offline basemap helpers — country packs download to Maps Storage; app ships catalog only.
 */
export {
  resolveActiveBasemap,
  resolveActiveBasemapUrl,
  loadMapCatalog,
  isLayerInstalled,
  hasAnyInstalledBasemap
} from './mapPacks';

export const OFFLINE_MAP_LABEL = 'Downloaded country packs';

let cachedAvailable: boolean | null = null;

/** True when at least one country Map (M) pack is in local Maps Storage. */
export async function probeOfflineMapAvailable(force = false): Promise<boolean> {
  if (!force && cachedAvailable !== null) return cachedAvailable;
  const { hasAnyInstalledBasemap } = await import('./mapPacks');
  cachedAvailable = await hasAnyInstalledBasemap();
  return cachedAvailable;
}

export function getOfflineMapCachedStatus(): boolean | null {
  return cachedAvailable;
}

export function clearOfflineMapProbeCache(): void {
  cachedAvailable = null;
}
