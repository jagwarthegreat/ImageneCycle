import { assertDenseLabelRules } from './offlineMapStyle';
import { isLayerBundled, mapPackNotHostedMessage, type MapPackCatalogEntry } from './mapPacks';

/** Self-check — run: npx tsx src/utils/offlineMapStyle.test.ts */
export function assertOfflineMapHelpers(): void {
  assertDenseLabelRules();

  const pack: MapPackCatalogEntry = {
    id: 'ph',
    name: 'Philippines',
    bbox: { minLat: 4, maxLat: 21.5, minLng: 116, maxLng: 127 },
    layers: {
      map: {
        url: '/maps/packs/philippines.pmtiles',
        label: 'Map',
        fileName: 'ph - Philippines.map.pmtiles'
      }
    }
  };
  if (!isLayerBundled(pack, 'map')) {
    throw new Error('relative catalog URL should count as bundled');
  }

  const msg = mapPackNotHostedMessage('/maps/packs/vietnam.pmtiles');
  if (msg.includes('On the server run')) {
    throw new Error('hosted message should not tell mobile users to run npm on a server');
  }
}

const isMain =
  typeof process !== 'undefined' &&
  (process.argv[1]?.endsWith('offlineMapStyle.test.ts') ||
    process.argv[1]?.endsWith('offlineMapStyle.test.js'));

if (isMain) {
  try {
    assertOfflineMapHelpers();
    console.log('offlineMapStyle helpers ok');
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
