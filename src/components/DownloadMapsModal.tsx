import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, ChevronDown, ChevronRight, Download, Trash2, Map as MapIcon, RefreshCw } from 'lucide-react';
import {
  MapPackCatalogEntry,
  MapLayerKind,
  loadMapCatalog,
  getInstallSnapshot,
  downloadMapLayer,
  deleteMapLayer,
  cancelDownload,
  formatBytes,
  packTotalBytes,
  packCenter,
  haversineKm,
  mntBadges,
  isPackSourceAvailable,
  isLayerBundled
} from '../utils/mapPacks';
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
  /** packId → whether Map (M) source is installable (bundled asset or remote) */
  const [mapHosted, setMapHosted] = useState<Record<string, boolean | null>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await loadMapCatalog(true);
      setPacks(list);
      setInstalled(await getInstallSnapshot());
      const hosted: Record<string, boolean | null> = {};
      await Promise.all(
        list.map(async p => {
          const url = p.layers.map?.url;
          hosted[p.id] = url ? await isPackSourceAvailable(url) : false;
        })
      );
      setMapHosted(hosted);
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

  const handleDownload = async (pack: MapPackCatalogEntry, layer: MapLayerKind) => {
    const key = layerKey(pack.id, layer);
    setBusyKey(key);
    setError(null);
    setProgress(p => ({ ...p, [key]: 0 }));
    try {
      await downloadMapLayer(pack, layer, prog => {
        setProgress(p => ({ ...p, [key]: prog.pct }));
      });
      setInstalled(await getInstallSnapshot());
      clearOfflineMapProbeCache();
      onPacksChanged?.();
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setBusyKey(null);
      setProgress(p => {
        const next = { ...p };
        delete next[key];
        return next;
      });
    }
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

  const handleUpdateAll = () => {
    setError(null);
    // Stub: catalog has no versioned remote manifests yet
    setError('Update All is not available yet — re-download a layer to refresh a hosted pack.');
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
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleUpdateAll}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400"
              title="Update All"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex border-b border-zinc-800 shrink-0">
          {([
            ['nearest', 'Nearest'],
            ['az', 'A–Z']
          ] as const).map(([id, label]) => (
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
          OpenStreetMap packs (M = map, N = routing, T = topo). Install to this phone for offline rides.
          Philippines map can install from the app bundle when included. Guru .vm / .rt / .elv are not supported.
        </p>

        {error && (
          <div className="mx-4 mt-2 px-2 py-1.5 rounded-lg bg-rose-950/60 border border-rose-700 text-rose-200 text-[11px]">
            {error}
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
                        {total > 0 ? formatBytes(total) : 'Size TBD'}
                      </div>
                    </div>
                  </button>

                  {open && (
                    <div className="border-t border-zinc-800 px-3 py-2 space-y-2 bg-zinc-950/50">
                      {(['map', 'navigation', 'topo'] as MapLayerKind[]).map(layer => {
                        const spec = pack.layers[layer];
                        if (!spec) return null;
                        const key = layerKey(pack.id, layer);
                        const isInst = !!inst[layer];
                        const pct = progress[key];
                        const busy = busyKey === key;
                        const remoteOk = layer === 'map' ? mapHosted[pack.id] : true;
                        const notHosted = layer === 'map' && !isInst && remoteOk === false;
                        const bundled = isLayerBundled(pack, layer);

                        return (
                          <div
                            key={layer}
                            className="flex items-start justify-between gap-2 py-1.5 border-b border-zinc-800/80 last:border-0"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-sports font-bold text-zinc-200">{spec.label}</div>
                              <div className="text-[10px] text-zinc-500">
                                {notHosted
                                  ? 'Not in this build — cloud packs later'
                                  : isInst
                                  ? 'On this device'
                                  : bundled && layer === 'map' && remoteOk
                                  ? `In app — install (${spec.bytes ? formatBytes(spec.bytes) : 'large'})`
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
                                <button
                                  type="button"
                                  onClick={() => void handleDelete(pack, layer)}
                                  className="p-1.5 rounded-lg bg-zinc-800 text-rose-400 hover:bg-rose-950"
                                  title="Delete from phone"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ) : notHosted ? (
                                <span className="text-[10px] font-bold font-sports px-2 uppercase text-amber-400">
                                  Not hosted
                                </span>
                              ) : busy ? (
                                <button
                                  type="button"
                                  onClick={() => cancelDownload(pack.id, layer)}
                                  className="px-2 py-1 rounded-lg bg-zinc-800 text-[10px] font-bold text-amber-400"
                                >
                                  Cancel
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={!spec.url || !!busyKey || remoteOk === false}
                                  onClick={() => void handleDownload(pack, layer)}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-[10px] font-bold uppercase"
                                >
                                  <Download className="w-3 h-3" />
                                  Download
                                </button>
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
