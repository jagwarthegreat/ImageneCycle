/**
 * Local country map zip install: scan Download/ImageneCycle/{slug}-maps.zip
 * or user-picked File → stream-extract into Maps Storage.
 */

import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Unzip, UnzipInflate } from 'fflate';
import { readPackBlob, writePackBlob, writePackChunks } from './mapStorage';

export const MAP_ZIP_DIR = 'Download/ImageneCycle';

export type DownloadProgress = { done: number; total: number; pct: number };

export type ZipSource = { kind: 'file'; file: File } | { kind: 'uri'; uri: string };

export type NeededZipEntry = {
  zipName: string;
  storageName: string;
  /** 'pmtiles' | 'json' */
  kind: 'pmtiles' | 'json';
};

export function zipFileName(slug: string): string {
  return `${slug}-maps.zip`;
}

export function mapZipMissingMessage(slug: string): string {
  return `Put ${zipFileName(slug)} in ${MAP_ZIP_DIR}/ or use Browse.`;
}

export class MapZipMissingError extends Error {
  readonly slug: string;
  constructor(slug: string) {
    super(mapZipMissingMessage(slug));
    this.name = 'MapZipMissingError';
    this.slug = slug;
  }
}

/** Basename entries expected inside {slug}-maps.zip */
export function zipEntryNames(slug: string): {
  map: string;
  contour: string;
  navigation: string;
  topo: string;
} {
  return {
    map: `${slug}.pmtiles`,
    contour: `${slug}.contour.pmtiles`,
    navigation: `${slug}.nav.json`,
    topo: `${slug}.topo.json`
  };
}

export function slugFromPackUrl(mapUrl: string | null | undefined, fallbackName: string): string {
  const m = String(mapUrl || '').match(/\/([^/]+)\.pmtiles$/i);
  if (m) return m[1];
  return fallbackName.toLowerCase().replace(/\s+/g, '');
}

function normalizeZipEntryName(name: string): string {
  const parts = name.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || name;
}

/** Scan phone Download/ImageneCycle for {slug}-maps.zip. Web → null. */
export async function findCountryMapZip(slug: string): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;

  const name = zipFileName(slug);
  const relative = `${MAP_ZIP_DIR}/${name}`;

  try {
    try {
      await Filesystem.requestPermissions();
    } catch {
      /* may already be granted or unsupported */
    }

    await Filesystem.stat({
      path: relative,
      directory: Directory.ExternalStorage
    });
    const { uri } = await Filesystem.getUri({
      path: relative,
      directory: Directory.ExternalStorage
    });
    return uri || null;
  } catch {
    try {
      const listing = await Filesystem.readdir({
        path: MAP_ZIP_DIR,
        directory: Directory.ExternalStorage
      });
      const hit = (listing.files || []).find(f => {
        const n = typeof f === 'string' ? f : f.name;
        return n?.toLowerCase() === name.toLowerCase();
      });
      if (!hit) return null;
      const { uri } = await Filesystem.getUri({
        path: relative,
        directory: Directory.ExternalStorage
      });
      return uri || null;
    } catch {
      return null;
    }
  }
}

/** System file picker for a .zip (Browse fallback). */
export function pickMapZipFile(): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip,application/x-zip-compressed';
    input.style.display = 'none';
    const cleanup = () => {
      input.remove();
    };
    input.onchange = () => {
      const file = input.files?.[0] || null;
      cleanup();
      resolve(file);
    };
    input.addEventListener('cancel', () => {
      cleanup();
      resolve(null);
    });
    document.body.appendChild(input);
    input.click();
  });
}

async function readableFromZipSource(
  source: ZipSource,
  signal?: AbortSignal
): Promise<{ stream: ReadableStream<Uint8Array>; sizeHint: number }> {
  if (source.kind === 'file') {
    return { stream: source.file.stream(), sizeHint: source.file.size || 0 };
  }
  // Prefer convertFileSrc + fetch. Never Filesystem.readFile (base64).
  const src = Capacitor.convertFileSrc(source.uri);
  const res = await fetch(src, { cache: 'no-cache', signal });
  if (!res.ok || !res.body) {
    throw new Error(`Could not open map zip (${res.status}). Try Browse.`);
  }
  const len = Number(res.headers.get('content-length') || 0);
  return { stream: res.body, sizeHint: len };
}

async function* uint8StreamFromReadable(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const { value, done } = await reader.read();
      if (done) break;
      if (value) yield value;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
  }
}

type ChunkQueue = {
  push: (chunk: Uint8Array | null, err?: Error) => void;
  iterable: AsyncIterable<Uint8Array>;
};

function makeChunkQueue(): ChunkQueue {
  const buf: Array<Uint8Array | null> = [];
  let wake: (() => void) | null = null;
  let error: Error | null = null;
  const wait = () =>
    new Promise<void>(r => {
      wake = r;
    });

  return {
    push(chunk, err) {
      if (err) error = err;
      buf.push(chunk);
      wake?.();
      wake = null;
    },
    iterable: {
      async *[Symbol.asyncIterator]() {
        while (true) {
          while (buf.length === 0) await wait();
          if (error) throw error;
          const next = buf.shift()!;
          if (next === null) return;
          yield next;
        }
      }
    }
  };
}

async function assertPmtilesMagic(fileName: string): Promise<void> {
  const blob = await readPackBlob(fileName);
  if (!blob || blob.size < 1024) throw new Error(`${fileName} too small to be a valid PMTiles pack.`);
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const magic = String.fromCharCode(...head.slice(0, 7));
  if (magic !== 'PMTiles') throw new Error(`Not a valid PMTiles file (${fileName}).`);
}

async function assertJsonFile(fileName: string): Promise<void> {
  const blob = await readPackBlob(fileName);
  if (!blob || blob.size <= 0) throw new Error(`Empty ${fileName}`);
  const text = (await blob.text()).trim();
  if (!text.startsWith('{')) throw new Error(`Invalid JSON pack (${fileName}).`);
  JSON.parse(text);
}

/**
 * Stream-unzip selected entries from a zip source into Maps Storage.
 * Large PMTiles are written chunk-by-chunk (not held as one giant array).
 */
export async function extractEntriesFromZipSource(
  source: ZipSource,
  entries: NeededZipEntry[],
  onProgress?: (p: DownloadProgress) => void,
  signal?: AbortSignal
): Promise<Map<string, number>> {
  const want = new Map(entries.map(e => [e.zipName.toLowerCase(), e]));
  const written = new Map<string, number>();
  const pending = new Set(want.keys());
  const writers: Promise<void>[] = [];

  const { stream, sizeHint } = await readableFromZipSource(source, signal);
  const totalEstimate = sizeHint || 1;
  let zipBytesRead = 0;

  await new Promise<void>((resolve, reject) => {
    const uz = new Unzip();
    uz.register(UnzipInflate);

    let settled = false;
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const ok = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    uz.onfile = file => {
      const base = normalizeZipEntryName(file.name);
      const key = base.toLowerCase();
      const spec = want.get(key);

      if (!spec) {
        file.ondata = err => {
          if (err) fail(err);
        };
        file.start();
        return;
      }

      if (spec.kind === 'pmtiles') {
        const q = makeChunkQueue();
        const expected = file.originalSize || undefined;
        const writePromise = (async () => {
          const n = await writePackChunks(spec.storageName, q.iterable, expected, pct => {
            const basePct = Math.round((zipBytesRead / totalEstimate) * 60);
            onProgress?.({
              done: zipBytesRead,
              total: totalEstimate,
              pct: Math.min(95, basePct + Math.round(pct * 0.35))
            });
          });
          await assertPmtilesMagic(spec.storageName);
          written.set(spec.storageName, n);
          pending.delete(key);
        })().catch(fail);

        writers.push(writePromise);

        file.ondata = (err, data, final) => {
          if (err) {
            q.push(null, err);
            return;
          }
          if (data?.length) q.push(data);
          if (final) q.push(null);
        };
        file.start();
        return;
      }

      // Small JSON — buffer then write
      const q = makeChunkQueue();
      const writePromise = (async () => {
        const parts: Uint8Array[] = [];
        for await (const c of q.iterable) parts.push(c);
        const blob = new Blob(parts as BlobPart[], { type: 'application/json' });
        await writePackBlob(spec.storageName, blob);
        await assertJsonFile(spec.storageName);
        written.set(spec.storageName, blob.size);
        pending.delete(key);
      })().catch(fail);
      writers.push(writePromise);

      file.ondata = (err, data, final) => {
        if (err) {
          q.push(null, err);
          return;
        }
        if (data?.length) q.push(data);
        if (final) q.push(null);
      };
      file.start();
    };

    void (async () => {
      try {
        for await (const chunk of uint8StreamFromReadable(stream, signal)) {
          if (settled) break;
          zipBytesRead += chunk.byteLength;
          onProgress?.({
            done: zipBytesRead,
            total: totalEstimate,
            pct: Math.min(60, Math.round((zipBytesRead / totalEstimate) * 60))
          });
          uz.push(chunk, false);
        }
        if (!settled) uz.push(new Uint8Array(0), true);

        await Promise.all(writers);

        const deadline = Date.now() + 60_000;
        while (pending.size > 0 && Date.now() < deadline) {
          if (settled) return;
          await new Promise(r => setTimeout(r, 20));
          await Promise.all(writers);
        }
        if (pending.size > 0) {
          fail(new Error(`Zip is missing required file(s): ${[...pending].join(', ')}`));
          return;
        }
        onProgress?.({ done: totalEstimate, total: totalEstimate, pct: 100 });
        ok();
      } catch (e) {
        fail(e);
      }
    })();
  });

  return written;
}

/** @deprecated alias — prefer extractEntriesFromZipSource */
export async function extractEntriesFromZipBlob(
  zipBlob: Blob,
  entries: NeededZipEntry[],
  onProgress?: (p: DownloadProgress) => void,
  signal?: AbortSignal
): Promise<Map<string, number>> {
  return extractEntriesFromZipSource(
    { kind: 'file', file: zipBlob instanceof File ? zipBlob : new File([zipBlob], 'pack.zip') },
    entries,
    onProgress,
    signal
  );
}

export async function resolveZipSource(slug: string, file?: File | null): Promise<ZipSource> {
  if (file) return { kind: 'file', file };
  const uri = await findCountryMapZip(slug);
  if (uri) return { kind: 'uri', uri };
  throw new MapZipMissingError(slug);
}
