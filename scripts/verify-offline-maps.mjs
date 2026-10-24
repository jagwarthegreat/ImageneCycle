/**
 * Smoke-check offline contours + DET rules (no browser).
 *   node scripts/verify-offline-maps.mjs
 */
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const catalog = JSON.parse(readFileSync(path.join(root, 'public', 'maps', 'catalog.json'), 'utf8'));
const ids = (catalog.packs || []).map(p => p.id);
assert(ids.join(',') === 'ph,vn,sg,my,id,tw,bn', `Unexpected pack ids: ${ids}`);

for (const p of catalog.packs) {
  assert(p.layers?.topo?.contourUrl, `${p.id} missing topo.contourUrl`);
  assert(p.layers?.topo?.contourFileName, `${p.id} missing contourFileName`);
  const topoPath = path.join(root, 'public', p.layers.topo.url.replace(/^\//, ''));
  assert(existsSync(topoPath), `Missing hostable topo stub ${topoPath}`);
  const topo = JSON.parse(readFileSync(topoPath, 'utf8'));
  assert(topo.format === 'magene-topo-v2', `${p.id} topo format not v2`);
  assert(topo.contour?.url, `${p.id} topo.contour.url missing`);
}

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

const phContour = path.join(root, 'public', 'maps', 'packs', 'philippines.contour.pmtiles');
assert(existsSync(phContour), 'philippines.contour.pmtiles missing — run npm run maps:contours -- --id=ph');
const head = readFileSync(phContour).subarray(0, 7).toString('ascii');
assert(head === 'PMTiles', 'contour pack magic != PMTiles');
console.log('PH contour pack:', (statSync(phContour).size / (1024 * 1024)).toFixed(2), 'MB');

const phMap = path.join(root, 'public', 'maps', 'packs', 'philippines.pmtiles');
if (existsSync(phMap)) {
  const mHead = readFileSync(phMap).subarray(0, 7).toString('ascii');
  assert(mHead === 'PMTiles', 'map pack magic != PMTiles');
  console.log('PH map pack:', (statSync(phMap).size / (1024 * 1024)).toFixed(1), 'MB');
} else {
  console.warn('WARN: philippines.pmtiles not present — run npm run maps:extract -- --id=ph');
}

console.log('verify-offline-maps: OK');
