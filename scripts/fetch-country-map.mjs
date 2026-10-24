/**
 * Extract a country Protomaps PMTiles pack for Download Maps hosting:
 *   public/maps/packs/{slug}.pmtiles  (gitignored)
 *
 * Usage:
 *   npm run maps:extract -- --id=ph
 *   npm run maps:extract -- --id=vn
 *   PMTILES_URL=https://… npm run maps:extract -- --id=ph
 *   PROTOMAPS_BUILD=YYYYMMDD npm run maps:extract -- --id=sg
 *   FORCE=1 npm run maps:extract -- --id=ph
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  chmodSync,
  writeFileSync
} from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import path from 'path';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'public', 'maps', 'packs');
const catalogPath = path.join(root, 'public', 'maps', 'catalog.json');
const toolsDir = path.join(root, 'tools', 'go-pmtiles');
const AUTO_TRY_DAYS = 14;
const GOPMTILES_VERSION = '1.31.2';

function parseArgs(argv) {
  const out = { id: process.env.MAP_ID || null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--id' && argv[i + 1]) {
      out.id = argv[++i];
    } else if (a.startsWith('--id=')) {
      out.id = a.slice('--id='.length);
    }
  }
  return out;
}

function yyyymmdd(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function recentBuildDates(count) {
  const out = [];
  const now = new Date();
  for (let i = 1; i <= count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    out.push(yyyymmdd(d));
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
    if (result.status !== 0) throw new Error('Failed to extract go-pmtiles tar.gz (need tar)');
  } else if (process.platform === 'win32') {
    const ps = spawnSync(
      'powershell',
      ['-NoProfile', '-Command', `Expand-Archive -Force -Path '${archivePath}' -DestinationPath '${toolsDir}'`],
      { stdio: 'inherit' }
    );
    if (ps.status !== 0) throw new Error('Failed to unzip go-pmtiles');
  } else {
    const result = spawnSync('unzip', ['-o', archivePath, '-d', toolsDir], { stdio: 'inherit' });
    if (result.status !== 0) throw new Error('Failed to unzip go-pmtiles (need unzip)');
  }

  let resolved = binPath;
  if (!existsSync(resolved)) {
    const nested = path.join(toolsDir, 'pmtiles', asset.bin);
    if (existsSync(nested)) resolved = nested;
    else throw new Error(`go-pmtiles binary not found after extract (expected ${binPath})`);
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

async function downloadUrl(url, dest) {
  console.log('Downloading', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  if (!res.body) throw new Error('No response body');
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  console.log('Wrote', dest);
}

async function planetExists(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (res.ok) return true;
    const get = await fetch(url, { headers: { Range: 'bytes=0-6' } });
    if (!(get.ok || get.status === 206)) return false;
    const buf = new Uint8Array(await get.arrayBuffer());
    return String.fromCharCode(...buf.slice(0, 7)) === 'PMTiles';
  } catch {
    return false;
  }
}

function loadPack(id) {
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const pack = (catalog.packs || []).find(p => p.id === id);
  if (!pack) {
    const ids = (catalog.packs || []).map(p => p.id).join(', ');
    throw new Error(`Unknown pack id "${id}". Known: ${ids}`);
  }
  const mapUrl = pack.layers?.map?.url || '';
  const slug = path.basename(mapUrl).replace(/\.pmtiles$/i, '') || pack.name.toLowerCase().replace(/\s+/g, '-');
  const bbox = pack.bbox;
  const bboxStr = `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`;
  return { pack, slug, bboxStr, outFile: path.join(outDir, `${slug}.pmtiles`) };
}

function tryPmtilesExtract(cliPath, sourceUrl, outFile, bboxStr) {
  console.log('Trying pmtiles extract from', sourceUrl);
  if (existsSync(outFile)) {
    try {
      unlinkSync(outFile);
    } catch {
      /* ignore */
    }
  }
  const result = spawnSync(cliPath, ['extract', sourceUrl, outFile, `--bbox=${bboxStr}`], {
    stdio: 'inherit',
    shell: false,
    cwd: root
  });
  return result.status === 0 && existsSync(outFile) && statSync(outFile).size > 1024;
}

function logSuccess(outFile, slug) {
  const size = statSync(outFile).size;
  const mb = (size / (1024 * 1024)).toFixed(1);
  console.log('');
  console.log('Published host pack:');
  console.log(' ', outFile);
  console.log(`  size: ${mb} MB (${size} bytes)`);
  console.log('  gitignored — users download via Download Maps into phone storage.');
  console.log(`  catalog URL: /maps/packs/${slug}.pmtiles`);
}

async function main() {
  const { id } = parseArgs(process.argv.slice(2));
  if (!id) {
    console.error('Usage: npm run maps:extract -- --id=ph|vn|sg|my|id|tw|bn');
    process.exit(1);
  }

  const { pack, slug, bboxStr, outFile } = loadPack(id);
  mkdirSync(outDir, { recursive: true });

  if (existsSync(outFile) && !process.env.FORCE) {
    console.log('Already present:', outFile);
    logSuccess(outFile, slug);
    console.log('Set FORCE=1 to re-download.');
    return;
  }

  const direct = process.env.PMTILES_URL || process.env.PMTiles_URL;
  if (direct) {
    await downloadUrl(direct, outFile);
    logSuccess(outFile, slug);
    return;
  }

  const cliPath = await ensureGoPmtilesCli();
  console.log('Using CLI:', cliPath);
  console.log(`Pack: ${pack.name} (${id}) bbox=${bboxStr}`);

  const dates = [];
  if (process.env.PROTOMAPS_BUILD) dates.push(process.env.PROTOMAPS_BUILD);
  else dates.push(...recentBuildDates(AUTO_TRY_DAYS));

  for (const dated of dates) {
    const planet = `https://build.protomaps.com/${dated}.pmtiles`;
    console.log(`Checking ${planet} …`);
    if (!(await planetExists(planet))) {
      console.log('  not available');
      continue;
    }
    if (tryPmtilesExtract(cliPath, planet, outFile, bboxStr)) {
      logSuccess(outFile, slug);
      return;
    }
    console.log('  extract failed, trying older build…');
  }

  console.error(`
Could not fetch ${pack.name} PMTiles automatically.

  1) Place a file at: public/maps/packs/${slug}.pmtiles
  2) PMTILES_URL=<url> npm run maps:extract -- --id=${id}
  3) PROTOMAPS_BUILD=YYYYMMDD npm run maps:extract -- --id=${id}
`);
  process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
