import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, ChevronDown, ChevronRight, Download, Trash2, Map as MapIcon, FolderOpen } from 'lucide-react';
import {
  MapPackCatalogEntry,
  MapLayerKind,
  loadMapCatalog,
  getInstallSnapshot,
  installMapLayerFromZip,
  installPackFromZip,
  deleteMapLayer,
  cancelDownload,
  formatBytes,
  packTotalBytes,
  packCenter,
  haversineKm,
  mntBadges,
  packSlug
} from '../utils/mapPacks';
import {
  MAP_ZIP_DIR,
  MapZipMissingError,
  pickMapZipFile,
  zipFileName
} from '../utils/mapZipInstall';
import { clearOfflineMapProbeCache } from '../utils/offlineMap';

interface DownloadMapsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLat: number;
  currentLng: number;
  onPacksChanged?: () => void;
}

type Tab = 'nearest' | 'az';

export const DownloadMapsModal: React.FC<DownloadMapsModalProps> = ({
  isOpen,
  onClose,
  currentLat,
  currentLng,
  onPacksChanged
}) => {
  const [tab, setTab] = useState<Tab>('nearest');
  const [packs, setPacks] = useState<MapPackCatalogEntry[]>([]);
  const [installed, setInstalled] = useState<Record<string, Partial<Record<MapLayerKind, boolean>>>>({});
  const [expanded, setExpanded] = useState<string | null>('ph');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [browseHint, setBrowseHint] = useState<{
    slug: string;
    packId: string;
    layer?: MapLayerKind;
  } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await loadMapCatalog(true);
      setPacks(list);
      setInstalled(await getInstallSnapshot());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) void refresh();
  }, [isOpen, refresh]);

  const sorted = useMemo(() => {
    const here = { lat: currentLat || 14.6, lng: currentLng || 121.0 };
    const copy = [...packs];
    if (tab === 'az') {
      copy.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      copy.sort(
        (a, b) =>
          haversineKm(here, packCenter(a.bbox)) - haversineKm(here, packCenter(b.bbox))
      );
    }
    return copy;
  }, [packs, tab, currentLat, currentLng]);

  const layerKey = (packId: string, layer: MapLayerKind) => `${packId}:${layer}`;

  const runInstallLayer = async (pack: MapPackCatalogEntry, layer: MapLayerKind, file?: File | null) => {
    const key = layerKey(pack.id, layer);
    setBusyKey(key);
    setError(null);
    setBrowseHint(null);
    setProgress(p => ({ ...p, [key]: 0 }));
    try {
      await installMapLayerFromZip(pack, layer, { file }, prog => {
        setProgress(p => ({ ...p, [key]: prog.pct }));
      });
      setInstalled(await getInstallSnapshot());
      clearOfflineMapProbeCache();
      onPacksChanged?.();
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      if (err instanceof MapZipMissingError) {
        setBrowseHint({ slug: err.slug, packId: pack.id, layer });
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Install failed');
      }
    } finally {
      setBusyKey(null);
      setProgress(p => {
        const next = { ...p };
        delete next[key];
        return next;
      });
    }
  };

  /** One zip → extract M + N + T together. */
  const runInstallPack = async (pack: MapPackCatalogEntry, file?: File | null) => {
    const key = `pack:${pack.id}`;
    setBusyKey(key);
    setError(null);
    setBrowseHint(null);
    setProgress(p => ({ ...p, [key]: 0 }));
    try {
      const result = await installPackFromZip(pack, { file }, prog => {
        setProgress(p => ({ ...p, [key]: prog.pct }));
      });
      setInstalled(await getInstallSnapshot());
      clearOfflineMapProbeCache();
      onPacksChanged?.();
      if (result.missing.length) {
        setError(`Installed ${result.installed.join(', ').toUpperCase()}; missing ${result.missing.join(', ').toUpperCase()} in zip.`);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      if (err instanceof MapZipMissingError) {
        setBrowseHint({ slug: err.slug, packId: pack.id });
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Install failed');
      }
    } finally {
      setBusyKey(null);
      setProgress(p => {
        const next = { ...p };
        delete next[key];
        return next;
      });
    }
  };

  const handleInstallPack = async (pack: MapPackCatalogEntry) => {
    await runInstallPack(pack);
  };

  const handleBrowsePack = async (pack: MapPackCatalogEntry) => {
    const file = await pickMapZipFile();
    if (!file) return;
    await runInstallPack(pack, file);
  };

  const handleInstallLayer = async (pack: MapPackCatalogEntry, layer: MapLayerKind) => {
    await runInstallLayer(pack, layer);
  };

  const handleBrowseLayer = async (pack: MapPackCatalogEntry, layer: MapLayerKind) => {
    const file = await pickMapZipFile();
    if (!file) return;
    await runInstallLayer(pack, layer, file);
  };

  const handleDelete = async (pack: MapPackCatalogEntry, layer: MapLayerKind) => {
    setError(null);
    try {
      await deleteMapLayer(pack, layer);
      setInstalled(await getInstallSnapshot());
      clearOfflineMapProbeCache();
      onPacksChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100000] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-xs">
      <div className="w-full max-w-md max-h-[90dvh] bg-zinc-950 border border-zinc-800 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col text-zinc-100 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <MapIcon className="w-4 h-4 text-blue-400" />
            <h2 className="font-sports font-bold text-sm tracking-wider uppercase">Download Maps</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-zinc-800 shrink-0">
          {(
            [
              ['nearest', 'Nearest'],
              ['az', 'A–Z']
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex-1 py-2.5 text-xs font-sports font-bold uppercase tracking-wider ${
                tab === id
                  ? 'text-blue-400 border-b-2 border-blue-500'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <p className="px-4 pt-2 text-[10px] text-zinc-500 font-sports leading-relaxed">
          One Install extracts M + N + T from {'{country}'}-maps.zip in {MAP_ZIP_DIR}/ (or Browse). Guru .vm /
          .rt / .elv are not supported.
        </p>

        {error && (
          <div className="mx-4 mt-2 px-2 py-1.5 rounded-lg bg-rose-950/60 border border-rose-700 text-rose-200 text-[11px]">
            <div>{error}</div>
            {browseHint && (
              <button
                type="button"
                className="mt-1.5 inline-flex items-center gap-1 text-blue-300 font-bold uppercase tracking-wider"
                onClick={() => {
                  const pack = packs.find(p => p.id === browseHint.packId);
                  if (!pack) return;
                  if (browseHint.layer) void handleBrowseLayer(pack, browseHint.layer);
                  else void handleBrowsePack(pack);
                }}
              >
                <FolderOpen className="w-3 h-3" />
                Browse for {zipFileName(browseHint.slug)}
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {loading && (
            <div className="text-center text-xs text-zinc-500 py-8 font-sports">Loading catalog…</div>
          )}

          {!loading &&
            sorted.map(pack => {
              const open = expanded === pack.id;
              const inst = installed[pack.id] || {};
              const badge = mntBadges(inst);
              const total = packTotalBytes(pack);
              const slug = packSlug(pack);
              const packKey = `pack:${pack.id}`;
              const packBusy = busyKey === packKey;
              const packPct = progress[packKey];
              const allInstalled = !!(inst.map && inst.navigation && inst.topo);

              return (
                <div key={pack.id} className="rounded-xl border border-zinc-800 bg-zinc-900/80 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : pack.id)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-800/60"
                  >
                    {open ? (
                      <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-sports font-bold text-sm text-white truncate">{pack.name}</span>
                        {badge && (
                          <span className="text-[10px] font-bold text-blue-400 tracking-wider">{badge}</span>
                        )}
                        {inst.map && (
                          <span className="text-[9px] font-bold uppercase text-emerald-400">Installed</span>
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">
                        {total > 0 ? formatBytes(total) : 'Size TBD'} · {zipFileName(slug)}
                      </div>
                    </div>
                  </button>

                  {open && (
                    <div className="border-t border-zinc-800 px-3 py-2 space-y-2 bg-zinc-950/50">
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-zinc-800">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-sports font-bold text-zinc-200">Full pack (M + N + T)</div>
                          <div className="text-[10px] text-zinc-500">
                            {allInstalled ? 'All layers on device' : 'Install map, navigation, and topo from one zip'}
                          </div>
                          {typeof packPct === 'number' && (
                            <div className="mt-1 h-1 rounded bg-zinc-800 overflow-hidden">
                              <div className="h-full bg-blue-500 transition-all" style={{ width: `${packPct}%` }} />
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 flex items-center gap-1">
                          {packBusy ? (
                            <button
                              type="button"
                              onClick={() => cancelDownload(pack.id)}
                              className="px-2 py-1 rounded-lg bg-zinc-800 text-[10px] font-bold text-amber-400"
                            >
                              Cancel
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={!!busyKey}
                                onClick={() => void handleBrowsePack(pack)}
                                className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
                                title="Browse for zip"
                              >
                                <FolderOpen className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={!!busyKey}
                                onClick={() => void handleInstallPack(pack)}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-[10px] font-bold uppercase"
                              >
                                <Download className="w-3 h-3" />
                                {allInstalled ? 'Reinstall' : 'Install'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {(['map', 'navigation', 'topo'] as MapLayerKind[]).map(layer => {
                        const spec = pack.layers[layer];
                        if (!spec) return null;
                        const key = layerKey(pack.id, layer);
                        const isInst = !!inst[layer];
                        const pct = progress[key];
                        const busy = busyKey === key;

                        return (
                          <div
                            key={layer}
                            className="flex items-start justify-between gap-2 py-1.5 border-b border-zinc-800/80 last:border-0"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-sports font-bold text-zinc-200">{spec.label}</div>
                              <div className="text-[10px] text-zinc-500">
                                {isInst
                                  ? 'On this device'
                                  : spec.note
                                    ? spec.note
                                    : spec.bytes
                                      ? formatBytes(spec.bytes)
                                      : '—'}
                              </div>
                              {typeof pct === 'number' && (
                                <div className="mt-1 h-1 rounded bg-zinc-800 overflow-hidden">
                                  <div className="h-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                                </div>
                              )}
                            </div>
                            <div className="shrink-0 flex items-center gap-1">
                              {spec.infoOnly ? (
                                <span className="text-[10px] text-zinc-600 font-sports px-2">—</span>
                              ) : isInst ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={!!busyKey}
                                    onClick={() => void handleInstallLayer(pack, layer)}
                                    className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-[10px] font-bold uppercase"
                                    title="Reinstall layer from zip"
                                  >
                                    Repair
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleDelete(pack, layer)}
                                    className="p-1.5 rounded-lg bg-zinc-800 text-rose-400 hover:bg-rose-950"
                                    title="Delete from phone"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : busy ? (
                                <button
                                  type="button"
                                  onClick={() => cancelDownload(pack.id, layer)}
                                  className="px-2 py-1 rounded-lg bg-zinc-800 text-[10px] font-bold text-amber-400"
                                >
                                  Cancel
                                </button>
                              ) : (
                                <span className="text-[10px] text-zinc-600 font-sports px-2">via Full pack</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
