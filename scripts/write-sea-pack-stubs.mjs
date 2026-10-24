/**
 * Write hostable N/T JSON stubs for all SEA catalog packs.
 *   node scripts/write-sea-pack-stubs.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const packsDir = path.join(root, 'public', 'maps', 'packs');
const catalog = JSON.parse(readFileSync(path.join(root, 'public', 'maps', 'catalog.json'), 'utf8'));

mkdirSync(packsDir, { recursive: true });

for (const pack of catalog.packs || []) {
  const mapUrl = pack.layers?.map?.url || '';
  const slug =
    path.basename(mapUrl).replace(/\.pmtiles$/i, '') ||
    pack.name.toLowerCase().replace(/\s+/g, '-');

  const nav = {
    format: 'magene-nav-v1',
    id: pack.id,
    name: pack.name,
    fileHint: `${pack.id} - ${pack.name}.nav.json`,
    bbox: pack.bbox,
    routing: {
      offlineRouterGraph: false,
      note: 'Create routes online; saved turn-by-turn works offline.'
    },
    notes: ['Magene Navigation Data pack (not Guru .rt).'],
    updatedAt: new Date().toISOString().slice(0, 10)
  };

  const contourFile = `${pack.id} - ${pack.name}.contour.pmtiles`;
  const topo = {
    format: 'magene-topo-v2',
    id: pack.id,
    name: pack.name,
    fileHint: `${pack.id} - ${pack.name}.topo.json`,
    bbox: pack.bbox,
    elevation: {
      source: 'route-embedded',
      demPmtiles: null,
      demNote: 'Climb elevation uses saved routes. Contour lines come from the companion contour PMTiles.'
    },
    contour: {
      url: `/maps/packs/${slug}.contour.pmtiles`,
      fileName: contourFile,
      bytes: pack.layers?.topo?.contourBytes || 0,
      dataLayer: 'contours'
    },
    notes: [
      'Magene Topographic Data pack (not Guru .elv).',
      'Installing T downloads this manifest plus contour PMTiles for offline contour lines.',
      'Per-route elevation profiles remain the primary offline elev source.'
    ],
    updatedAt: new Date().toISOString().slice(0, 10)
  };

  writeFileSync(path.join(packsDir, `${slug}.nav.json`), JSON.stringify(nav, null, 2) + '\n');
  writeFileSync(path.join(packsDir, `${slug}.topo.json`), JSON.stringify(topo, null, 2) + '\n');
  console.log('Wrote', slug, 'nav + topo');
}

console.log('Done.');
