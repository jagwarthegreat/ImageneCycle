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

/** OsmAnd-style map object categories → Protomaps `pois.kind` values. */
const POI_CATEGORY_COLORS: Record<string, string> = {
  // Banks, ATMs, currency
  bank: '#2ecc71',
  atm: '#27ae60',
  bureau_de_change: '#27ae60',
  // Beauty
  hairdresser: '#e91e8c',
  beauty: '#e91e8c',
  beauty_salon: '#e91e8c',
  // Entertainment / arts
  theatre: '#f1c40f',
  theater: '#f1c40f',
  cinema: '#f1c40f',
  arts_centre: '#f1c40f',
  museum: '#f1c40f',
  gallery: '#f1c40f',
  nightlife: '#f1c40f',
  // Health
  hospital: '#e74c3c',
  clinic: '#e74c3c',
  doctors: '#e74c3c',
  pharmacy: '#c0392b',
  dentist: '#e74c3c',
  // Lodging
  hotel: '#9b59b6',
  hostel: '#9b59b6',
  motel: '#9b59b6',
  guest_house: '#9b59b6',
  camp_site: '#8e44ad',
  campsite: '#8e44ad',
  // Monuments / worship
  monument: '#1abc9c',
  memorial: '#1abc9c',
  place_of_worship: '#16a085',
  church: '#16a085',
  temple: '#16a085',
  mosque: '#16a085',
  // Shops
  shop: '#3498db',
  mall: '#5dade2',
  department_store: '#5dade2',
  supermarket: '#5dade2',
  convenience: '#3498db',
  grocery: '#3498db',
  clothes: '#3498db',
  // Ski (rare in SEA)
  piste: '#a0522d',
  ski: '#a0522d',
  chair_lift: '#a0522d',
  // Police / embassies
  police: '#82e0aa',
  embassy: '#82e0aa',
  fire_station: '#82e0aa',
  // Post
  post_office: '#27ae60',
  parcel_locker: '#27ae60',
  // Transit
  bus_stop: '#95a5a6',
  tram_stop: '#95a5a6',
  ferry_terminal: '#95a5a6',
  station: '#7f8c8d',
  subway_entrance: '#7f8c8d',
  railway_station: '#7f8c8d',
  // Food / drink
  bar: '#e67e22',
  pub: '#e67e22',
  biergarten: '#e67e22',
  restaurant: '#d35400',
  cafe: '#d35400',
  fast_food: '#d35400',
  food_court: '#d35400',
  // Sports
  sports_centre: '#e59866',
  stadium: '#e59866',
  pitch: '#e59866',
  fitness_centre: '#e59866',
  // Education
  university: '#229954',
  college: '#229954',
  school: '#27ae60',
  kindergarten: '#27ae60',
  // Bike / outdoor (Magene defaults)
  bicycle: '#2980b9',
  bicycle_rental: '#2980b9',
  bicycle_repair_station: '#2980b9',
  bicycle_parking: '#2980b9',
  fuel: '#f39c12',
  park: '#2ecc71',
  toilets: '#bdc3c7',
  drinking_water: '#3498db',
  viewpoint: '#e74c3c',
  picnic_site: '#2ecc71',
  shelter: '#95a5a6'
};

const POI_KINDS = new Set(Object.keys(POI_CATEGORY_COLORS));

const DEFAULT_POI_COLOR = '#e67e22';

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

function poiColor(_z: number, f?: { props?: Record<string, unknown> }): string {
  const kind = typeof f?.props?.kind === 'string' ? f.props.kind : '';
  return POI_CATEGORY_COLORS[kind] || DEFAULT_POI_COLOR;
}

export function buildDenseLabelRules(flavorName: 'light' | 'dark', lang = 'en'): LabelRule[] {
  const flavor = namedFlavor(flavorName);
  const nametags = [`name:${lang}`, 'name', 'addr:housenumber', 'housenumber'];
  const base = labelRules(flavor, lang).map(rule => {
    if (rule.dataLayer === 'roads' && rule.minzoom === 16) {
      return { ...rule, minzoom: 14 };
    }
    if (rule.dataLayer === 'buildings' && typeof rule.minzoom === 'number' && rule.minzoom > 15) {
      return { ...rule, minzoom: 15 };
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
      return kind === 'neighbourhood' || kind === 'macrohood' || kind === 'borough';
    }
  };

  const buildingNames: LabelRule = {
    dataLayer: 'buildings',
    minzoom: 16,
    symbolizer: new CenteredTextSymbolizer({
      labelProps: nametags,
      fill: flavor.city_label,
      stroke: flavor.city_label_halo,
      width: 1,
      font: '400 9px sans-serif'
    }),
    filter: (_z, f) => {
      const name = f.props.name || f.props['name:en'] || f.props['addr:housenumber'];
      return typeof name === 'string' && name.length > 0;
    }
  };

  const pois: LabelRule = {
    dataLayer: 'pois',
    minzoom: 14,
    symbolizer: new GroupSymbolizer([
      new CircleSymbolizer({
        radius: 3.5,
        fill: poiColor,
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

  return [...base, neighbourhood, buildingNames, pois];
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
  if (!rules.some(r => r.dataLayer === 'buildings' && r.minzoom === 16)) {
    throw new Error('dense rules missing building names');
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
