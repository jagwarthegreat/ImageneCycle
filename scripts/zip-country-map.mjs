/**
 * Pack a country map folder into dist-map-zips/{slug}-maps.zip (STORE / no recompress).
 *
 * Usage:
 *   npm run maps:zip -- --id=ph
 *   npm run maps:zip -- --id=vn
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { zipSync } from 'fflate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const packsDir = path.join(root, 'public', 'maps', 'packs');
const catalogPath = path.join(root, 'public', 'maps', 'catalog.json');
const outDir = path.join(root, 'dist-map-zips');

function parseArgs(argv) {
  const out = { id: process.env.MAP_ID || null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--id' && argv[i + 1]) out.id = argv[++i];
    else if (a.startsWith('--id=')) out.id = a.slice('--id='.length);
  }
  return out;
}

function slugFromPack(pack) {
  const url = pack.layers?.map?.url || '';
  const m = String(url).match(/\/([^/]+)\.pmtiles$/i);
  if (m) return m[1];
  return String(pack.name || pack.id)
    .toLowerCase()
    .replace(/\s+/g, '');
}

function memberNames(slug) {
  return [
    `${slug}.pmtiles`,
    `${slug}.contour.pmtiles`,
    `${slug}.nav.json`,
    `${slug}.topo.json`
  ];
}

function main() {
  const { id } = parseArgs(process.argv.slice(2));
  if (!id) {
    console.error('Usage: npm run maps:zip -- --id=ph');
    process.exit(1);
  }

  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const pack = (catalog.packs || []).find(p => p.id === id);
  if (!pack) {
    console.error(`Unknown pack id "${id}". Check public/maps/catalog.json`);
    process.exit(1);
  }

  const slug = slugFromPack(pack);
  const files = {};
  let totalBytes = 0;
  const included = [];

  for (const name of memberNames(slug)) {
    const fp = path.join(packsDir, name);
    if (!existsSync(fp)) {
      console.warn(`skip missing: ${name}`);
      continue;
    }
    const buf = readFileSync(fp);
    files[name] = new Uint8Array(buf);
    totalBytes += buf.length;
    included.push({ name, bytes: buf.length });
  }

  if (!files[`${slug}.pmtiles`]) {
    console.error(
      `Required ${slug}.pmtiles not found under public/maps/packs/. Run maps:extract first.`
    );
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });
  const zipName = `${slug}-maps.zip`;
  const outPath = path.join(outDir, zipName);
  // level 0 = STORE (no recompression) — PMTiles is already compressed
  const zipped = zipSync(files, { level: 0 });
  writeFileSync(outPath, zipped);

  const zipBytes = statSync(outPath).size;
  console.log(`Wrote ${outPath}`);
  console.log(`Members (${included.length}):`);
  for (const m of included) {
    console.log(`  ${m.name}  ${(m.bytes / (1024 * 1024)).toFixed(2)} MB`);
  }
  console.log(
    `Raw sum ${(totalBytes / (1024 * 1024)).toFixed(2)} MB → zip ${(zipBytes / (1024 * 1024)).toFixed(2)} MB`
  );
  console.log(`Copy to phone: Download/ImageneCycle/${zipName}`);
}

main();
