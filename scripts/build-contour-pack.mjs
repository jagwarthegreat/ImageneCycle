/**
 * Build Magene contour PMTiles for Topographic Data (T):
 *   public/maps/packs/{slug}.contour.pmtiles  (gitignored)
 *
 * Pipeline:
 *   1) Build contour GeoJSON (synthetic DEM by default, or CONTOUR_GEOJSON / gdal_contour)
 *   2) Slice to MVT with geojson-vt + vt-pbf
 *   3) Write MBTiles via sql.js
 *   4) Convert with go-pmtiles → .contour.pmtiles
 *
 * Usage:
 *   npm run maps:contours -- --id=ph
 *   npm run maps:contours -- --id=sg
 *   FORCE=1 npm run maps:contours -- --id=bn
 *   CONTOUR_GEOJSON=./ph-contours.geojson npm run maps:contours -- --id=ph
 *   CONTOUR_PMTILES_URL=https://… npm run maps:contours -- --id=ph
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  chmodSync,
  statSync
} from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { gunzipSync } from 'zlib';

const require = createRequire(import.meta.url);
const geojsonvtMod = require('geojson-vt');
const geojsonvt = geojsonvtMod.default || geojsonvtMod;
const vtpbf = require('vt-pbf');
const initSqlJs = require('sql.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'public', 'maps', 'packs');
const catalogPath = path.join(root, 'public', 'maps', 'catalog.json');
const toolsDir = path.join(root, 'tools', 'go-pmtiles');
const GOPMTILES_VERSION = '1.31.2';

const MIN_ZOOM = 9;
const MAX_ZOOM = 14;
const INTERVAL_M = 50;

function parseArgs(argv) {
  const out = { id: process.env.MAP_ID || null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--id' && argv[i + 1]) out.id = argv[++i];
    else if (a.startsWith('--id=')) out.id = a.slice('--id='.length);
  }
  return out;
}

function platformAsset() {
  const { platform, arch } = process;
  if (platform === 'win32' && arch === 'x64') {
    return { name: `go-pmtiles_${GOPMTILES_VERSION}_Windows_x86_64.zip`, bin: 'pmtiles.exe' };
  }
  if (platform === 'win32' && arch === 'arm64') {
    return { name: `go-pmtiles_${GOPMTILES_VERSION}_Windows_arm64.zip`, bin: 'pmtiles.exe' };
  }
  if (platform === 'darwin' && arch === 'arm64') {
    return { name: `go-pmtiles-${GOPMTILES_VERSION}_Darwin_arm64.zip`, bin: 'pmtiles' };
  }
  if (platform === 'darwin' && arch === 'x64') {
    return { name: `go-pmtiles-${GOPMTILES_VERSION}_Darwin_x86_64.zip`, bin: 'pmtiles' };
  }
  if (platform === 'linux' && arch === 'arm64') {
    return { name: `go-pmtiles_${GOPMTILES_VERSION}_Linux_arm64.tar.gz`, bin: 'pmtiles', tar: true };
  }
  return { name: `go-pmtiles_${GOPMTILES_VERSION}_Linux_x86_64.tar.gz`, bin: 'pmtiles', tar: true };
}

async function downloadBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function ensureGoPmtilesCli() {
  const asset = platformAsset();
  const binPath = path.join(toolsDir, asset.bin);
  const marker = path.join(toolsDir, `.version-${GOPMTILES_VERSION}`);
  if (existsSync(binPath) && existsSync(marker)) return binPath;

  mkdirSync(toolsDir, { recursive: true });
  const url = `https://github.com/protomaps/go-pmtiles/releases/download/v${GOPMTILES_VERSION}/${asset.name}`;
  console.log('Downloading go-pmtiles CLI:', url);
  const archivePath = path.join(toolsDir, asset.name);
  writeFileSync(archivePath, await downloadBuffer(url));

  if (asset.tar) {
    const result = spawnSync('tar', ['-xzf', archivePath, '-C', toolsDir], { stdio: 'inherit' });
    if (result.status !== 0) throw new Error('Failed to extract go-pmtiles tar.gz');
  } else if (process.platform === 'win32') {
    const ps = spawnSync(
      'powershell',
      ['-NoProfile', '-Command', `Expand-Archive -Force -Path '${archivePath}' -DestinationPath '${toolsDir}'`],
      { stdio: 'inherit' }
    );
    if (ps.status !== 0) throw new Error('Failed to unzip go-pmtiles');
  } else {
    const result = spawnSync('unzip', ['-o', archivePath, '-d', toolsDir], { stdio: 'inherit' });
    if (result.status !== 0) throw new Error('Failed to unzip go-pmtiles');
  }

  let resolved = binPath;
  if (!existsSync(resolved)) {
    const nested = path.join(toolsDir, 'pmtiles', asset.bin);
    if (existsSync(nested)) resolved = nested;
    else throw new Error(`go-pmtiles binary not found (expected ${binPath})`);
  }
  try {
    chmodSync(resolved, 0o755);
  } catch {
    /* win */
  }
  writeFileSync(marker, GOPMTILES_VERSION);
  try {
    unlinkSync(archivePath);
  } catch {
    /* ignore */
  }
  return resolved;
}

function loadPack(id) {
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const pack = (catalog.packs || []).find(p => p.id === id);
  if (!pack) {
    const ids = (catalog.packs || []).map(p => p.id).join(', ');
    throw new Error(`Unknown pack id "${id}". Known: ${ids}`);
  }
  const mapUrl = pack.layers?.map?.url || '';
  const slug =
    path.basename(mapUrl).replace(/\.pmtiles$/i, '') ||
    pack.name.toLowerCase().replace(/\s+/g, '-');
  return { pack, slug, bbox: pack.bbox };
}

/** Deterministic pseudo-elevation (meters) for a lon/lat — enough for ride-map contour look. */
function syntheticElev(lon, lat, bbox) {
  const nx = (lon - bbox.minLng) / Math.max(0.001, bbox.maxLng - bbox.minLng);
  const ny = (lat - bbox.minLat) / Math.max(0.001, bbox.maxLat - bbox.minLat);
  const ridge =
    900 * Math.sin(nx * Math.PI * 2.2) * Math.sin(ny * Math.PI * 1.7) +
    450 * Math.sin(nx * Math.PI * 5.1 + 0.4) * Math.cos(ny * Math.PI * 3.3) +
    220 * Math.sin((nx + ny) * Math.PI * 8);
  const coastal = Math.max(0, 1 - Math.min(nx, 1 - nx, ny, 1 - ny) * 8) * -80;
  return Math.max(0, ridge + coastal + 120);
}

/**
 * Marching-squares style isolines on a coarse grid → MultiLineString features.
 */
function buildSyntheticContours(bbox, interval = INTERVAL_M) {
  const cols = 80;
  const rows = 80;
  const grid = [];
  for (let r = 0; r <= rows; r++) {
    const row = [];
    const lat = bbox.minLat + ((bbox.maxLat - bbox.minLat) * r) / rows;
    for (let c = 0; c <= cols; c++) {
      const lon = bbox.minLng + ((bbox.maxLng - bbox.minLng) * c) / cols;
      row.push(syntheticElev(lon, lat, bbox));
    }
    grid.push(row);
  }

  let minE = Infinity;
  let maxE = -Infinity;
  for (const row of grid) {
    for (const v of row) {
      if (v < minE) minE = v;
      if (v > maxE) maxE = v;
    }
  }
  const start = Math.ceil(minE / interval) * interval;
  const features = [];

  for (let elev = start; elev <= maxE; elev += interval) {
    const lines = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const z00 = grid[r][c];
        const z10 = grid[r][c + 1];
        const z01 = grid[r + 1][c];
        const z11 = grid[r + 1][c + 1];
        const bits =
          (z00 >= elev ? 1 : 0) |
          (z10 >= elev ? 2 : 0) |
          (z11 >= elev ? 4 : 0) |
          (z01 >= elev ? 8 : 0);
        if (bits === 0 || bits === 15) continue;

        const lon0 = bbox.minLng + ((bbox.maxLng - bbox.minLng) * c) / cols;
        const lon1 = bbox.minLng + ((bbox.maxLng - bbox.minLng) * (c + 1)) / cols;
        const lat0 = bbox.minLat + ((bbox.maxLat - bbox.minLat) * r) / rows;
        const lat1 = bbox.minLat + ((bbox.maxLat - bbox.minLat) * (r + 1)) / rows;
        const lerp = (a, b, t) => a + (b - a) * t;
        const edge = (side) => {
          // 0 top, 1 right, 2 bottom, 3 left
          if (side === 0) {
            const t = (elev - z00) / (z10 - z00 || 1e-9);
            return [lerp(lon0, lon1, t), lat0];
          }
          if (side === 1) {
            const t = (elev - z10) / (z11 - z10 || 1e-9);
            return [lon1, lerp(lat0, lat1, t)];
          }
          if (side === 2) {
            const t = (elev - z01) / (z11 - z01 || 1e-9);
            return [lerp(lon0, lon1, t), lat1];
          }
          const t = (elev - z00) / (z01 - z00 || 1e-9);
          return [lon0, lerp(lat0, lat1, t)];
        };

        const pairs = {
          1: [0, 3],
          2: [0, 1],
          3: [3, 1],
          4: [1, 2],
          5: [0, 1, 3, 2],
          6: [0, 2],
          7: [3, 2],
          8: [3, 2],
          9: [0, 2],
          10: [0, 3, 1, 2],
          11: [1, 2],
          12: [3, 1],
          13: [0, 1],
          14: [0, 3]
        };
        const segs = pairs[bits];
        if (!segs) continue;
        for (let i = 0; i < segs.length; i += 2) {
          lines.push([edge(segs[i]), edge(segs[i + 1])]);
        }
      }
    }
    if (!lines.length) continue;
    features.push({
      type: 'Feature',
      properties: { ele: elev, elevation: elev, level: elev },
      geometry: { type: 'MultiLineString', coordinates: lines }
    });
  }

  console.log(`Synthetic contours: ${features.length} levels (${interval} m), elev ${minE.toFixed(0)}–${maxE.toFixed(0)} m`);
  return { type: 'FeatureCollection', features };
}

function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

async function writeMbtiles(geojson, bbox, mbtilesPath) {
  const index = new geojsonvt(geojson, {
    maxZoom: MAX_ZOOM,
    indexMaxZoom: MAX_ZOOM,
    indexMaxPoints: 0,
    tolerance: 2,
    extent: 4096,
    buffer: 64
  });

  const WASM = path.join(root, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const SQL = await initSqlJs({
    locateFile: () => WASM
  });
  const db = new SQL.Database();
  db.run('CREATE TABLE metadata (name text, value text);');
  db.run(
    'CREATE TABLE tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob);'
  );
  db.run('CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row);');

  const meta = {
    name: 'magene-contours',
    format: 'pbf',
    type: 'overlay',
    version: '1',
    description: 'Magene topographic contours',
    minzoom: String(MIN_ZOOM),
    maxzoom: String(MAX_ZOOM),
    bounds: `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`,
    center: `${(bbox.minLng + bbox.maxLng) / 2},${(bbox.minLat + bbox.maxLat) / 2},${MIN_ZOOM}`,
    json: JSON.stringify({
      vector_layers: [{ id: 'contours', description: 'Elevation contours', fields: { ele: 'Number' } }]
    })
  };
  const metaStmt = db.prepare('INSERT INTO metadata (name, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(meta)) {
    metaStmt.run([k, v]);
  }
  metaStmt.free();

  const insert = db.prepare(
    'INSERT OR REPLACE INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?)'
  );

  let tileCount = 0;
  for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
    const tl = lonLatToTile(bbox.minLng, bbox.maxLat, z);
    const br = lonLatToTile(bbox.maxLng, bbox.minLat, z);
    const x0 = Math.min(tl.x, br.x);
    const x1 = Math.max(tl.x, br.x);
    const y0 = Math.min(tl.y, br.y);
    const y1 = Math.max(tl.y, br.y);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const tile = index.getTile(z, x, y);
        if (!tile || !tile.features?.length) continue;
        const buf = vtpbf.fromGeojsonVt({ contours: tile });
        const tmsY = 2 ** z - 1 - y; // MBTiles uses TMS
        insert.run([z, x, tmsY, buf]);
        tileCount++;
      }
    }
  }
  insert.free();
  console.log(`MBTiles tiles written: ${tileCount}`);

  const data = db.export();
  writeFileSync(mbtilesPath, Buffer.from(data));
  db.close();
}

async function downloadUrl(url, dest) {
  console.log('Downloading', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  if (!res.body) throw new Error('No response body');
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

function loadGeojson() {
  const p = process.env.CONTOUR_GEOJSON;
  if (!p) return null;
  const abs = path.isAbsolute(p) ? p : path.join(root, p);
  const raw = readFileSync(abs);
  const text = abs.endsWith('.gz') ? gunzipSync(raw).toString('utf8') : raw.toString('utf8');
  return JSON.parse(text);
}

async function main() {
  const { id } = parseArgs(process.argv.slice(2));
  if (!id) {
    console.error('Usage: npm run maps:contours -- --id=ph|vn|sg|my|id|tw|bn');
    process.exit(1);
  }

  const { pack, slug, bbox } = loadPack(id);
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${slug}.contour.pmtiles`);

  if (existsSync(outFile) && !process.env.FORCE) {
    console.log('Already present:', outFile);
    console.log(`  size: ${(statSync(outFile).size / (1024 * 1024)).toFixed(1)} MB`);
    console.log('Set FORCE=1 to rebuild.');
    return;
  }

  if (process.env.CONTOUR_PMTILES_URL) {
    await downloadUrl(process.env.CONTOUR_PMTILES_URL, outFile);
    console.log('Wrote', outFile);
    return;
  }

  let geojson = loadGeojson();
  if (!geojson) {
    console.log(`Building synthetic contours for ${pack.name} (set CONTOUR_GEOJSON for real DEM isolines)`);
    geojson = buildSyntheticContours(bbox);
  } else {
    console.log('Using CONTOUR_GEOJSON features:', geojson.features?.length ?? 0);
  }

  const tmpDir = path.join(root, 'tools', 'contour-tmp');
  mkdirSync(tmpDir, { recursive: true });
  const mbtilesPath = path.join(tmpDir, `${slug}.contours.mbtiles`);
  if (existsSync(mbtilesPath)) unlinkSync(mbtilesPath);

  console.log('Slicing MVT → MBTiles…');
  await writeMbtiles(geojson, bbox, mbtilesPath);

  const cli = await ensureGoPmtilesCli();
  if (existsSync(outFile)) unlinkSync(outFile);
  console.log('Converting MBTiles → PMTiles…');
  const conv = spawnSync(cli, ['convert', mbtilesPath, outFile], { stdio: 'inherit', cwd: root });
  if (conv.status !== 0 || !existsSync(outFile)) {
    throw new Error('pmtiles convert failed');
  }

  const size = statSync(outFile).size;
  console.log('');
  console.log('Published contour pack:');
  console.log(' ', outFile);
  console.log(`  size: ${(size / (1024 * 1024)).toFixed(2)} MB (${size} bytes)`);
  console.log(`  catalog URL: /maps/packs/${slug}.contour.pmtiles`);
  console.log('  Update catalog topo.bytes / contourBytes after publishing.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
