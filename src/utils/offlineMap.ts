/**
 * Offline basemap helpers — country packs download to Maps Storage; app ships catalog only.
 * Fast gate: localStorage map_packs = "installed" (set on zip install, checked on load/render).
 */
export {
  resolveActiveBasemap,
  resolveActiveBasemapUrl,
  loadMapCatalog,
  isLayerInstalled,
  hasAnyInstalledBasemap,
  isMapPacksInstalledFlag,
  markMapPacksInstalled,
  clearMapPacksInstalledFlag,
  MAP_PACKS_LS_KEY,
  MAP_PACKS_LS_VALUE
} from './mapPacks';

export const OFFLINE_MAP_LABEL = 'Downloaded country packs';

let cachedAvailable: boolean | null = null;

/**
 * Sync flag with OPFS: if packs exist but flag missing → set; if flag set but no packs → clear.
 * Call on app load / refresh.
 */
export async function reconcileMapPacksInstalledFlag(): Promise<boolean> {
  const {
    hasAnyInstalledBasemap,
    isMapPacksInstalledFlag,
    markMapPacksInstalled,
    clearMapPacksInstalledFlag
  } = await import('./mapPacks');
  const hasPacks = await hasAnyInstalledBasemap();
  if (hasPacks) {
    markMapPacksInstalled();
    cachedAvailable = true;
  } else if (isMapPacksInstalledFlag()) {
    clearMapPacksInstalledFlag();
    cachedAvailable = false;
  } else {
    cachedAvailable = false;
  }
  return hasPacks;
}

/** True when at least one country Map (M) pack is in local Maps Storage. */
export async function probeOfflineMapAvailable(force = false): Promise<boolean> {
  if (!force && cachedAvailable !== null) return cachedAvailable;
  const { isMapPacksInstalledFlag } = await import('./mapPacks');
  // Fast path: localStorage gate
  if (!force && isMapPacksInstalledFlag()) {
    cachedAvailable = true;
    return true;
  }
  return reconcileMapPacksInstalledFlag();
}

export function getOfflineMapCachedStatus(): boolean | null {
  return cachedAvailable;
}

export function clearOfflineMapProbeCache(): void {
  cachedAvailable = null;
}
