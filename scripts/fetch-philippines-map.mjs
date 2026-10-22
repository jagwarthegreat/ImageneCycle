/**
 * Publishes a Philippines PMTiles basemap for Download Maps hosting:
 *   public/maps/packs/philippines.pmtiles  (gitignored — not shipped in the app)
 *
 * Uses the go-pmtiles CLI (auto-downloaded once into tools/go-pmtiles/).
 *
 * Usage:
 *   npm run maps:ph
 *   PMTILES_URL=https://... npm run maps:ph
 *   PROTOMAPS_BUILD=20260315 npm run maps:ph
 *   FORCE=1 npm run maps:ph
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
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
const outFile = path.join(outDir, 'philippines.pmtiles');
const toolsDir = path.join(root, 'tools', 'go-pmtiles');

// Philippines coastal bbox (lon/lat)
const PH_BBOX = '116,4,127,21.5';
const AUTO_TRY_DAYS = 14;
const GOPMTILES_VERSION = '1.31.2';

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
    return {
      name: `go-pmtiles_${GOPMTILES_VERSION}_Windows_x86_64.zip`,
      bin: 'pmtiles.exe'
    };
  }
  if (platform === 'win32' && arch === 'arm64') {
    return {
      name: `go-pmtiles_${GOPMTILES_VERSION}_Windows_arm64.zip`,
      bin: 'pmtiles.exe'
    };
  }
  if (platform === 'darwin' && arch === 'arm64') {
    return {
      name: `go-pmtiles-${GOPMTILES_VERSION}_Darwin_arm64.zip`,
      bin: 'pmtiles'
    };
  }
  if (platform === 'darwin' && arch === 'x64') {
    return {
      name: `go-pmtiles-${GOPMTILES_VERSION}_Darwin_x86_64.zip`,
      bin: 'pmtiles'
    };
  }
  if (platform === 'linux' && arch === 'arm64') {
    return {
      name: `go-pmtiles_${GOPMTILES_VERSION}_Linux_arm64.tar.gz`,
      bin: 'pmtiles',
      tar: true
    };
  }
  // linux x64 default
  return {
    name: `go-pmtiles_${GOPMTILES_VERSION}_Linux_x86_64.tar.gz`,
    bin: 'pmtiles',
    tar: true
  };
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
  if (existsSync(binPath) && existsSync(marker)) {
    return binPath;
  }

  mkdirSync(toolsDir, { recursive: true });
  const url = `https://github.com/protomaps/go-pmtiles/releases/download/v${GOPMTILES_VERSION}/${asset.name}`;
  console.log('Downloading go-pmtiles CLI:', url);
  const archivePath = path.join(toolsDir, asset.name);
  writeFileSync(archivePath, await downloadBuffer(url));

  if (asset.tar) {
    const result = spawnSync('tar', ['-xzf', archivePath, '-C', toolsDir], { stdio: 'inherit' });
    if (result.status !== 0) throw new Error('Failed to extract go-pmtiles tar.gz (need tar)');
  } else {
    // unzip via PowerShell on Windows, unzip elsewhere
    if (process.platform === 'win32') {
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
  }

  // Binary may land as pmtiles / pmtiles.exe in toolsDir
  if (!existsSync(binPath)) {
    // some zips nest a folder
    const nested = path.join(toolsDir, 'pmtiles', asset.bin);
    if (existsSync(nested)) {
      // leave nested; return that path
      writeFileSync(marker, GOPMTILES_VERSION);
      try {
        chmodSync(nested, 0o755);
      } catch {
        /* win */
      }
      return nested;
    }
    throw new Error(`go-pmtiles binary not found after extract (expected ${binPath})`);
  }

  try {
    chmodSync(binPath, 0o755);
  } catch {
    /* win */
  }
  writeFileSync(marker, GOPMTILES_VERSION);
  try {
    unlinkSync(archivePath);
  } catch {
    /* ignore */
  }
  return binPath;
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

function tryPmtilesExtract(cliPath, sourceUrl) {
  console.log('Trying pmtiles extract from', sourceUrl);
  if (existsSync(outFile)) {
    try {
      unlinkSync(outFile);
    } catch {
      /* ignore */
    }
  }
  const result = spawnSync(
    cliPath,
    ['extract', sourceUrl, outFile, `--bbox=${PH_BBOX}`],
    { stdio: 'inherit', shell: false, cwd: root }
  );
  return result.status === 0 && existsSync(outFile) && statSync(outFile).size > 1024;
}

function logSuccess() {
  const size = statSync(outFile).size;
  const mb = (size / (1024 * 1024)).toFixed(1);
  console.log('');
  console.log('Published host pack:');
  console.log(' ', outFile);
  console.log(`  size: ${mb} MB (${size} bytes)`);
  console.log('  gitignored — for local/CDN hosting only; users download via Download Maps into phone storage.');
  console.log('  catalog URL: /maps/packs/philippines.pmtiles');
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  if (existsSync(outFile) && !process.env.FORCE) {
    console.log('Already present:', outFile);
    logSuccess();
    console.log('Set FORCE=1 to re-download.');
    return;
  }

  const direct = process.env.PMTILES_URL || process.env.PMTiles_URL;
  if (direct) {
    await downloadUrl(direct, outFile);
    logSuccess();
    return;
  }

  const cliPath = await ensureGoPmtilesCli();
  console.log('Using CLI:', cliPath);

  const dates = [];
  if (process.env.PROTOMAPS_BUILD) {
    dates.push(process.env.PROTOMAPS_BUILD);
  } else {
    dates.push(...recentBuildDates(AUTO_TRY_DAYS));
  }

  for (const dated of dates) {
    const planet = `https://build.protomaps.com/${dated}.pmtiles`;
    console.log(`Checking ${planet} …`);
    if (!(await planetExists(planet))) {
      console.log('  not available');
      continue;
    }
    if (tryPmtilesExtract(cliPath, planet)) {
      logSuccess();
      return;
    }
    console.log('  extract failed, trying older build…');
  }

  console.error(`
Could not fetch Philippines PMTiles automatically.

Host packs are NOT shipped in the app bundle. Publish for Download Maps:

  1) Place a file at:
       public/maps/packs/philippines.pmtiles
  2) Download a ready extract:
       PMTILES_URL=<url-to-ph.pmtiles> npm run maps:ph
  3) Pin a Protomaps planet build:
       PROTOMAPS_BUILD=20260315 npm run maps:ph

Users download from catalog URLs into phone storage (OPFS). See public/maps/README.md
`);
  process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
