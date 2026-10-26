/** Self-check — run: npx tsx src/utils/mapPackInstallAll.test.ts */
import { neededZipEntriesForPack, type MapPackCatalogEntry } from './mapPacks';

export function runMapPackInstallAllValidation(): void {
  const pack: MapPackCatalogEntry = {
    id: 'ph',
    name: 'Philippines',
    bbox: { minLng: 116, minLat: 4, maxLng: 127, maxLat: 21 },
    layers: {
      map: {
        url: 'https://example.com/philippines.pmtiles',
        label: 'Map',
        fileName: 'ph - Philippines.map.pmtiles'
      },
      navigation: {
        url: 'https://example.com/philippines.nav.json',
        label: 'Navigation',
        fileName: 'ph - Philippines.nav.json'
      },
      topo: {
        url: 'https://example.com/philippines.topo.json',
        label: 'Topo',
        fileName: 'ph - Philippines.topo.json',
        contourFileName: 'ph - Philippines.contour.pmtiles'
      }
    }
  };

  const entries = neededZipEntriesForPack(pack);
  const names = entries.map(e => e.zipName).sort();
  const expect = [
    'philippines.contour.pmtiles',
    'philippines.nav.json',
    'philippines.pmtiles',
    'philippines.topo.json'
  ];
  if (JSON.stringify(names) !== JSON.stringify(expect)) {
    throw new Error(`Unexpected zip entries: ${names.join(', ')}`);
  }
  console.log('mapPackInstallAll.test.ts: OK');
}

runMapPackInstallAllValidation();
