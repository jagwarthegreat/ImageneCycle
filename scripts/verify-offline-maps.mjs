/**
 * Smoke-check dehydrated offline-maps surface + DET/contour style rules (no browser).
 * Does not require local .pmtiles (those are sideloaded via maps:zip).
 *   node scripts/verify-offline-maps.mjs
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const mapsDir = path.join(root, 'public', 'maps');
const packsDir = path.join(mapsDir, 'packs');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function walkPmtiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkPmtiles(full, out);
    else if (name.toLowerCase().endsWith('.pmtiles')) out.push(full);
  }
  return out;
}

const catalog = JSON.parse(readFileSync(path.join(mapsDir, 'catalog.json'), 'utf8'));
const ids = (catalog.packs || []).map(p => p.id);
assert(ids.join(',') === 'ph,vn,sg,my,id,tw,bn', `Unexpected pack ids: ${ids}`);

for (const p of catalog.packs) {
  assert(p.layers?.map?.url, `${p.id} missing map.url`);
  assert(p.layers?.topo?.contourUrl, `${p.id} missing topo.contourUrl`);
  assert(p.layers?.topo?.contourFileName, `${p.id} missing contourFileName`);

  const navUrl = p.layers?.navigation?.url;
  if (navUrl) {
    const navPath = path.join(root, 'public', navUrl.replace(/^\//, ''));
    assert(existsSync(navPath), `Missing nav stub ${navPath}`);
  }

  const topoPath = path.join(root, 'public', p.layers.topo.url.replace(/^\//, ''));
  assert(existsSync(topoPath), `Missing hostable topo stub ${topoPath}`);
  const topo = JSON.parse(readFileSync(topoPath, 'utf8'));
  assert(topo.format === 'magene-topo-v2', `${p.id} topo format not v2`);
  assert(topo.contour?.url, `${p.id} topo.contour.url missing`);
}

const bundled = walkPmtiles(mapsDir);
assert(
  bundled.length === 0,
  `Dehydrated tree must not contain .pmtiles under public/maps (found ${bundled.length}). Run maps:guard / delete binaries.`
);

assert(existsSync(packsDir), 'public/maps/packs missing');

const tmp = path.join(root, 'tools', 'contour-tmp', 'verify-styles.mts');
mkdirSync(path.dirname(tmp), { recursive: true });
writeFileSync(
  tmp,
  `
import { assertDenseLabelRules, buildDenseLabelRules } from '../../src/utils/offlineMapStyle.ts';
import { buildContourPaintRules } from '../../src/utils/contourOverlay.ts';
assertDenseLabelRules();
const rules = buildDenseLabelRules('dark');
if (!rules.some(r => r.dataLayer === 'pois')) throw new Error('pois rule missing');
if (!rules.some(r => r.dataLayer === 'buildings' && r.minzoom === 16)) throw new Error('building names missing');
const paints = buildContourPaintRules(true);
if (!paints.some(p => p.dataLayer === 'contours')) throw new Error('contour paint missing');
console.log('DET + contour style rules OK');
`
);

const r = spawnSync('npx', ['tsx', tmp], { cwd: root, stdio: 'inherit', shell: true });
assert(r.status === 0, 'Style self-check failed');

console.log('verify-offline-maps: OK (catalog + stubs; no bundled pmtiles)');
