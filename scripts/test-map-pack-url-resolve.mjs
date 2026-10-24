/**
 * Smoke-test URL resolution rules used by mapPacks.resolvePackUrl (no Vite runtime).
 */
function resolvePackUrl(url, baseRaw) {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = (baseRaw || '').replace(/\/$/, '');
  if (!base) return trimmed;
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${base}${path}`;
}

const base = 'https://abc.supabase.co/storage/v1/object/public/map-packs';
const cases = [
  ['/maps/packs/philippines.pmtiles', base, `${base}/maps/packs/philippines.pmtiles`],
  ['https://cdn.example/x.pmtiles', base, 'https://cdn.example/x.pmtiles'],
  ['/maps/packs/philippines.pmtiles', '', '/maps/packs/philippines.pmtiles'],
  [null, base, null],
];

let failed = 0;
for (const [url, b, expected] of cases) {
  const got = resolvePackUrl(url, b);
  if (got !== expected) {
    console.error('FAIL', { url, b, expected, got });
    failed++;
  }
}
if (failed) process.exit(1);
console.log('resolvePackUrl smoke OK');
