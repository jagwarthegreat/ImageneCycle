/**
 * Offline PMTiles basemap styles. Details mode paints denser labels/POIs
 * already present in Protomaps tiles (default flavor skips most of them).
 */

import { namedFlavor } from '@protomaps/basemaps';
import type { PMTiles } from 'pmtiles';
import type L from 'leaflet';
import {
  CenteredTextSymbolizer,
  CircleSymbolizer,
  GroupSymbolizer,
  type LabelRule,
  labelRules,
  leafletLayer,
  OffsetTextSymbolizer,
  paintRules
} from 'protomaps-leaflet';

const MAP_DETAILS_KEY = 'magene-map-details';

const POI_KINDS = new Set([
  'cafe',
  'restaurant',
  'fast_food',
  'fuel',
  'hospital',
  'clinic',
  'doctors',
  'pharmacy',
  'bicycle',
  'bicycle_rental',
  'bicycle_repair_station',
  'bicycle_parking',
  'supermarket',
  'convenience',
  'grocery',
  'park',
  'toilets',
  'drinking_water',
  'atm',
  'bank',
  'hotel',
  'viewpoint',
  'picnic_site',
  'shelter'
]);

export function loadMapDetailsPref(): boolean {
  try {
    const v = localStorage.getItem(MAP_DETAILS_KEY);
    if (v === null) return true;
    return v === '1' || v === 'true';
  } catch {
    return true;
  }
}

export function saveMapDetailsPref(on: boolean): void {
  try {
    localStorage.setItem(MAP_DETAILS_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function buildDenseLabelRules(flavorName: 'light' | 'dark', lang = 'en'): LabelRule[] {
  const flavor = namedFlavor(flavorName);
  const nametags = [`name:${lang}`, 'name'];
  const base = labelRules(flavor, lang).map(rule => {
    if (rule.dataLayer === 'roads' && rule.minzoom === 16) {
      return { ...rule, minzoom: 14 };
    }
    return rule;
  });

  const neighbourhood: LabelRule = {
    dataLayer: 'places',
    minzoom: 13,
    symbolizer: new CenteredTextSymbolizer({
      labelProps: nametags,
      fill: flavor.subplace_label,
      stroke: flavor.subplace_label_halo,
      width: 1.5,
      font: '500 10px sans-serif',
      textTransform: 'uppercase'
    }),
    filter: (_z, f) => {
      const kind = f.props.kind;
      return kind === 'neighbourhood' || kind === 'macrohood';
    }
  };

  const pois: LabelRule = {
    dataLayer: 'pois',
    minzoom: 15,
    symbolizer: new GroupSymbolizer([
      new CircleSymbolizer({
        radius: 3,
        fill: flavor.pois?.tangerine || '#e67e22',
        stroke: flavor.city_label_halo,
        width: 1
      }),
      new OffsetTextSymbolizer({
        labelProps: nametags,
        fill: flavor.city_label,
        stroke: flavor.city_label_halo,
        width: 1,
        offsetX: 5,
        offsetY: 4,
        font: '400 10px sans-serif'
      })
    ]),
    filter: (_z, f) => {
      const kind = typeof f.props.kind === 'string' ? f.props.kind : '';
      return POI_KINDS.has(kind);
    }
  };

  return [...base, neighbourhood, pois];
}

/** Assert dense rules include neighbourhood + pois (self-check). */
export function assertDenseLabelRules(): void {
  const rules = buildDenseLabelRules('light');
  if (!rules.some(r => r.dataLayer === 'pois')) {
    throw new Error('dense rules missing pois');
  }
  if (!rules.some(r => r.dataLayer === 'places' && r.minzoom === 13)) {
    throw new Error('dense rules missing neighbourhood places');
  }
  if (!rules.some(r => r.dataLayer === 'roads' && r.minzoom === 14)) {
    throw new Error('dense rules missing earlier minor road labels');
  }
}

export function createOfflineBasemapLayer(opts: {
  pmtiles: PMTiles;
  isDarkMode: boolean;
  details: boolean;
}): L.GridLayer {
  const flavorName = opts.isDarkMode ? 'dark' : 'light';
  const attribution = '© OpenStreetMap · Protomaps';

  if (!opts.details) {
    return leafletLayer({
      url: opts.pmtiles as unknown as string,
      flavor: flavorName,
      lang: 'en',
      attribution
    }) as unknown as L.GridLayer;
  }

  const flavor = namedFlavor(flavorName);
  return leafletLayer({
    url: opts.pmtiles as unknown as string,
    paintRules: paintRules(flavor),
    labelRules: buildDenseLabelRules(flavorName),
    backgroundColor: flavor.background,
    attribution
  }) as unknown as L.GridLayer;
}
