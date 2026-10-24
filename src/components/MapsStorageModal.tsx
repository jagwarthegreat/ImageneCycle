import React, { useCallback, useEffect, useState } from 'react';
import { X, HardDrive, FolderOpen, Loader2 } from 'lucide-react';
import {
  StorageInfo,
  StorageMode,
  formatStorageBytes,
  getStorageInfo,
  isCustomDirectorySupported,
  listStoredPackFiles,
  pickCustomDirectory,
  setStorageModePreference,
  switchStorageMode
} from '../utils/mapStorage';
import { guruUnsupportedMessage, isGuruProprietaryFileName } from '../utils/mapPacks';

interface MapsStorageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MapsStorageModal: React.FC<MapsStorageModalProps> = ({ isOpen, onClose }) => {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guruWarn, setGuruWarn] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [movePct, setMovePct] = useState(0);
  const [moveFile, setMoveFile] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setInfo(await getStorageInfo());
      const files = await listStoredPackFiles();
      const guru = files.find(isGuruProprietaryFileName);
      setGuruWarn(guru ? guruUnsupportedMessage(guru) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read storage');
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      void refresh();
    }
  }, [isOpen, refresh]);

  const selectMode = async (mode: StorageMode) => {
    if (!info || info.mode === mode || moving) return;
    setError(null);

    if (mode === 'custom' && !isCustomDirectorySupported()) {
      setError('Custom directory needs Chromium (Chrome / Edge) with File System Access.');
      return;
    }

    setMoving(true);
    setMovePct(0);
    setMoveFile(null);
    try {
      await switchStorageMode(mode, p => {
        setMovePct(p.pct);
        setMoveFile(p.fileName || null);
      });
      await refresh();
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        /* user cancelled picker */
      } else {
        setError(err instanceof Error ? err.message : 'Could not switch storage');
      }
    } finally {
      setMoving(false);
      setMovePct(0);
      setMoveFile(null);
    }
  };

  const changeCustomFolder = async () => {
    setError(null);
    try {
      await pickCustomDirectory();
      setStorageModePreference('custom');
      await refresh();
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Folder selection failed');
      }
    }
  };

  if (!isOpen) return null;

  const mode = info?.mode ?? 'internal';

  return (
    <div className="fixed inset-0 z-[100000] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-xs">
      <div className="w-full max-w-md max-h-[90dvh] bg-zinc-950 border border-zinc-800 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col text-zinc-100 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-emerald-400" />
            <h2 className="font-sports font-bold text-sm tracking-wider uppercase">Maps Storage</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800" disabled={moving}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3 overflow-y-auto flex-1">
          <p className="text-[10px] text-zinc-500 font-sports leading-relaxed">
            Downloaded Magene packs (PMTiles + .nav.json / .topo.json + contour.pmtiles) live here — not shipped in the app.
            Guru .vm / .rt / .elv are unsupported. Default Internal = browser OPFS; Custom needs Chromium.
          </p>

          {guruWarn && (
            <div className="px-2 py-1.5 rounded-lg bg-amber-950/60 border border-amber-700 text-amber-100 text-[11px]">
              {guruWarn}
            </div>
          )}

          {error && (
            <div className="px-2 py-1.5 rounded-lg bg-rose-950/60 border border-rose-700 text-rose-200 text-[11px]">
              {error}
            </div>
          )}

          {moving && (
            <div className="rounded-xl border border-amber-700/60 bg-amber-950/40 px-3 py-3 space-y-2">
              <div className="flex items-center gap-2 text-amber-200 text-xs font-sports font-bold uppercase">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Moving files…
              </div>
              {moveFile && <div className="text-[10px] text-zinc-400 font-mono truncate">{moveFile}</div>}
              <div className="h-1.5 rounded bg-zinc-800 overflow-hidden">
                <div className="h-full bg-amber-500 transition-all" style={{ width: `${movePct}%` }} />
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={moving}
            onClick={() => void selectMode('internal')}
            className={`w-full text-left rounded-xl border px-3 py-3 space-y-1 transition-colors ${
              mode === 'internal'
                ? 'border-emerald-500/70 bg-emerald-950/30'
                : 'border-zinc-800 bg-zinc-900/80 hover:border-zinc-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-sports font-bold text-sm text-white">Internal storage</span>
              {mode === 'internal' && (
                <span className="text-[9px] font-bold uppercase text-emerald-400">Active</span>
              )}
            </div>
            <p className="text-[10px] text-zinc-500">
              Origin Private File System in this browser. Free space:{' '}
              <span className="text-zinc-300 font-mono">
                {mode === 'internal' ? formatStorageBytes(info?.freeBytes) : '—'}
              </span>
            </p>
            {mode === 'internal' && info?.usageBytes != null && (
              <p className="text-[10px] text-zinc-600 font-mono">
                Used {formatStorageBytes(info.usageBytes)}
                {info.quotaBytes != null ? ` / ${formatStorageBytes(info.quotaBytes)}` : ''}
              </p>
            )}
          </button>

          <button
            type="button"
            disabled={moving || !isCustomDirectorySupported()}
            onClick={() => void selectMode('custom')}
            className={`w-full text-left rounded-xl border px-3 py-3 space-y-1 transition-colors ${
              mode === 'custom'
                ? 'border-blue-500/70 bg-blue-950/30'
                : 'border-zinc-800 bg-zinc-900/80 hover:border-zinc-600 disabled:opacity-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-sports font-bold text-sm text-white flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                Custom directory
              </span>
              {mode === 'custom' && (
                <span className="text-[9px] font-bold uppercase text-blue-400">Active</span>
              )}
            </div>
            <p className="text-[10px] text-zinc-500">
              {isCustomDirectorySupported()
                ? 'Pick a folder (packs stored under MageneMaps/). Free space: Unknown (OS-managed).'
                : 'Not supported in this browser — use Chrome or Edge.'}
            </p>
            {mode === 'custom' && info?.customName && (
              <p className="text-[10px] text-zinc-300 font-mono truncate">Folder: {info.customName}</p>
            )}
          </button>

          {mode === 'custom' && isCustomDirectorySupported() && (
            <button
              type="button"
              disabled={moving}
              onClick={() => void changeCustomFolder()}
              className="w-full py-2 rounded-lg border border-zinc-700 text-[11px] font-sports font-bold uppercase tracking-wider text-zinc-300 hover:bg-zinc-900"
            >
              Change folder…
            </button>
          )}

          <p className="text-[10px] text-zinc-600 font-sports">
            Stored download packs: {info?.packCount ?? 0}. Country maps appear here after Download Maps — the app
            does not ship them.
          </p>
        </div>
      </div>
    </div>
  );
};
