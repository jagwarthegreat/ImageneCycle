/**
 * Maps Storage backends (Guru-style):
 * - Internal → Origin Private File System (OPFS)
 * - Custom → user-picked directory via File System Access API (Chromium)
 */

export type StorageMode = 'internal' | 'custom';

export type MoveProgress = {
  done: number;
  total: number;
  pct: number;
  fileName?: string;
};

export interface StorageInfo {
  mode: StorageMode;
  freeBytes: number | null;
  usageBytes: number | null;
  quotaBytes: number | null;
  customSupported: boolean;
  customName: string | null;
  packCount: number;
}

const LS_MODE = 'magene-map-storage-mode';
const IDB_NAME = 'magene-map-storage';
const IDB_STORE = 'handles';
const IDB_VERSION = 1;
const HANDLE_KEY = 'custom-dir';
const PACKS_SUBDIR = 'MageneMaps';

let cachedCustomHandle: FileSystemDirectoryHandle | null = null;

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
  });
}

async function idbGetHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openHandleDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbPutHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClearHandle(): Promise<void> {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function isCustomDirectorySupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export function getStorageMode(): StorageMode {
  try {
    const v = localStorage.getItem(LS_MODE);
    if (v === 'custom') return 'custom';
  } catch {
    /* ignore */
  }
  return 'internal';
}

export function setStorageModePreference(mode: StorageMode): void {
  try {
    localStorage.setItem(LS_MODE, mode);
  } catch {
    /* ignore */
  }
}

async function ensurePermission(
  handle: FileSystemDirectoryHandle,
  mode: 'read' | 'readwrite' = 'readwrite'
): Promise<boolean> {
  try {
    const q = await handle.queryPermission({ mode });
    if (q === 'granted') return true;
    const r = await handle.requestPermission({ mode });
    return r === 'granted';
  } catch {
    return false;
  }
}

async function getOpfsRoot(): Promise<FileSystemDirectoryHandle> {
  if (!navigator.storage?.getDirectory) {
    throw new Error('Internal storage (OPFS) is not supported in this browser.');
  }
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(PACKS_SUBDIR, { create: true });
}

export async function pickCustomDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!window.showDirectoryPicker) {
    throw new Error('Custom directory requires Chromium (File System Access API).');
  }
  const handle = await window.showDirectoryPicker({
    id: 'magene-maps',
    mode: 'readwrite'
  });
  const ok = await ensurePermission(handle, 'readwrite');
  if (!ok) throw new Error('Permission denied for the selected folder.');
  const packsDir = await handle.getDirectoryHandle(PACKS_SUBDIR, { create: true });
  cachedCustomHandle = packsDir;
  await idbPutHandle(packsDir);
  return packsDir;
}

async function resolveCustomDir(createIfMissing = false): Promise<FileSystemDirectoryHandle | null> {
  if (cachedCustomHandle) {
    const ok = await ensurePermission(cachedCustomHandle, 'readwrite');
    if (ok) return cachedCustomHandle;
  }
  const stored = await idbGetHandle();
  if (!stored) {
    if (createIfMissing) return pickCustomDirectory();
    return null;
  }
  const ok = await ensurePermission(stored, 'readwrite');
  if (!ok) {
    if (createIfMissing) return pickCustomDirectory();
    return null;
  }
  cachedCustomHandle = stored;
  return stored;
}

async function getActiveDir(mode = getStorageMode()): Promise<FileSystemDirectoryHandle> {
  if (mode === 'custom') {
    const dir = await resolveCustomDir(true);
    if (!dir) throw new Error('No custom maps folder selected.');
    return dir;
  }
  return getOpfsRoot();
}

export async function ensureStorageReady(): Promise<void> {
  const mode = getStorageMode();
  if (mode === 'custom') {
    const dir = await resolveCustomDir(false);
    if (!dir) {
      setStorageModePreference('internal');
    }
  }
  await getActiveDir(getStorageMode());
}

async function listFilesIn(dir: FileSystemDirectoryHandle): Promise<string[]> {
  const names: string[] = [];
  try {
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'file') names.push(name);
    }
  } catch {
    /* older browsers may lack async iterator — ignore */
  }
  return names;
}

export async function listStoredPackFiles(mode = getStorageMode()): Promise<string[]> {
  try {
    if (mode === 'custom') {
      const dir = await resolveCustomDir(false);
      if (!dir) return [];
      return listFilesIn(dir);
    }
    const dir = await getOpfsRoot();
    return listFilesIn(dir);
  } catch {
    return [];
  }
}

export async function writePackBlob(
  fileName: string,
  blob: Blob,
  onProgress?: (pct: number) => void
): Promise<void> {
  const dir = await getActiveDir();
  const fh = await dir.getFileHandle(fileName, { create: true });
  const writable = await fh.createWritable();
  try {
    // Stream in chunks so progress can update for large PMTiles
    const chunkSize = 1024 * 1024;
    let offset = 0;
    const total = blob.size || 1;
    while (offset < blob.size) {
      const slice = blob.slice(offset, offset + chunkSize);
      await writable.write(slice);
      offset += slice.size;
      onProgress?.(Math.min(100, Math.round((offset / total) * 100)));
    }
  } finally {
    await writable.close();
  }
}

/** Write binary chunks without buffering the whole file as a Blob first. */
export async function writePackChunks(
  fileName: string,
  chunks: AsyncIterable<Uint8Array>,
  expectedBytes?: number,
  onProgress?: (pct: number) => void
): Promise<number> {
  const dir = await getActiveDir();
  const fh = await dir.getFileHandle(fileName, { create: true });
  const writable = await fh.createWritable();
  let written = 0;
  try {
    for await (const chunk of chunks) {
      if (!chunk?.byteLength) continue;
      // Copy into ArrayBuffer-backed view for FileSystemWritableFileStream typings
      const copy = new Uint8Array(chunk.byteLength);
      copy.set(chunk);
      await writable.write(copy);
      written += chunk.byteLength;
      if (expectedBytes && expectedBytes > 0) {
        onProgress?.(Math.min(100, Math.round((written / expectedBytes) * 100)));
      }
    }
    onProgress?.(100);
  } finally {
    await writable.close();
  }
  return written;
}

export async function readPackBlob(fileName: string, mode = getStorageMode()): Promise<Blob | null> {
  try {
    let dir: FileSystemDirectoryHandle;
    if (mode === 'custom') {
      const d = await resolveCustomDir(false);
      if (!d) return null;
      dir = d;
    } else {
      dir = await getOpfsRoot();
    }
    const fh = await dir.getFileHandle(fileName, { create: false });
    return fh.getFile();
  } catch {
    return null;
  }
}

export async function deletePackFile(fileName: string, mode = getStorageMode()): Promise<void> {
  try {
    let dir: FileSystemDirectoryHandle;
    if (mode === 'custom') {
      const d = await resolveCustomDir(false);
      if (!d) return;
      dir = d;
    } else {
      dir = await getOpfsRoot();
    }
    await dir.removeEntry(fileName);
  } catch {
    /* missing is fine */
  }
}

export async function hasPackFile(fileName: string, mode = getStorageMode()): Promise<boolean> {
  const blob = await readPackBlob(fileName, mode);
  return !!blob && blob.size > 0;
}

async function copyFile(
  from: FileSystemDirectoryHandle,
  to: FileSystemDirectoryHandle,
  name: string
): Promise<void> {
  const src = await from.getFileHandle(name);
  const file = await src.getFile();
  const dest = await to.getFileHandle(name, { create: true });
  const w = await dest.createWritable();
  try {
    await w.write(file);
  } finally {
    await w.close();
  }
}

/**
 * Switch storage location, copying packs (Guru “Moving files”).
 * When switching to custom without a handle, prompts for a folder.
 */
export async function switchStorageMode(
  next: StorageMode,
  onProgress?: (p: MoveProgress) => void
): Promise<void> {
  const prev = getStorageMode();
  if (prev === next) {
    if (next === 'custom') await resolveCustomDir(true);
    return;
  }

  const fromDir =
    prev === 'internal' ? await getOpfsRoot() : await resolveCustomDir(false);
  let toDir: FileSystemDirectoryHandle;
  if (next === 'internal') {
    toDir = await getOpfsRoot();
  } else {
    toDir = (await resolveCustomDir(false)) || (await pickCustomDirectory());
  }

  const files = fromDir ? await listFilesIn(fromDir) : [];
  const total = Math.max(files.length, 1);
  let done = 0;
  if (fromDir && files.length) {
    for (const name of files) {
      onProgress?.({ done, total: files.length, pct: Math.round((done / total) * 100), fileName: name });
      await copyFile(fromDir, toDir, name);
      done += 1;
      onProgress?.({ done, total: files.length, pct: Math.round((done / files.length) * 100), fileName: name });
    }
    // Remove from source after successful copy
    for (const name of files) {
      try {
        await fromDir.removeEntry(name);
      } catch {
        /* ignore */
      }
    }
  } else {
    onProgress?.({ done: 1, total: 1, pct: 100 });
  }

  setStorageModePreference(next);
  if (next === 'internal') {
    cachedCustomHandle = null;
  }
}

export async function getStorageInfo(): Promise<StorageInfo> {
  const mode = getStorageMode();
  const customSupported = isCustomDirectorySupported();
  let customName: string | null = null;
  if (mode === 'custom') {
    const dir = await resolveCustomDir(false);
    customName = dir?.name ?? null;
  }

  const files = await listStoredPackFiles(mode);
  let usageBytes: number | null = null;
  let quotaBytes: number | null = null;
  let freeBytes: number | null = null;

  if (mode === 'internal' && navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      usageBytes = est.usage ?? null;
      quotaBytes = est.quota ?? null;
      if (usageBytes != null && quotaBytes != null) {
        freeBytes = Math.max(0, quotaBytes - usageBytes);
      }
    } catch {
      /* ignore */
    }
  }

  return {
    mode,
    freeBytes,
    usageBytes,
    quotaBytes,
    customSupported,
    customName,
    packCount: files.length
  };
}

export function formatStorageBytes(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return 'Unknown';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
