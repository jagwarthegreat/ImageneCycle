/**
 * Offline contour overlay from Magene Topographic (T) contour PMTiles.
 * Painted when T is installed for the active pack — not gated on DET.
 */

import type { PMTiles } from 'pmtiles';
import type L from 'leaflet';
import { LineSymbolizer, leafletLayer, type PaintRule } from 'protomaps-leaflet';

function elevOf(f: { props?: Record<string, unknown> } | undefined): number {
  const p = f?.props || {};
  const raw = p.ele ?? p.elevation ?? p.height ?? p.level ?? 0;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function isMajor(elev: number): boolean {
  return elev % 100 === 0;
}

export function buildContourPaintRules(isDarkMode: boolean): PaintRule[] {
  const minor = isDarkMode ? 'rgba(210,200,160,0.45)' : 'rgba(120,90,40,0.4)';
  const major = isDarkMode ? 'rgba(240,230,190,0.7)' : 'rgba(90,60,30,0.65)';

  return [
    {
      dataLayer: 'contours',
      minzoom: 9,
      maxzoom: 18,
      symbolizer: new LineSymbolizer({
        perFeature: true,
        color: (_z, f) => (isMajor(elevOf(f)) ? major : minor),
        width: (z, f) => {
          const majorLine = isMajor(elevOf(f));
          if (z < 11) return majorLine ? 1.1 : 0.5;
          if (z < 14) return majorLine ? 1.4 : 0.7;
          return majorLine ? 1.8 : 0.9;
        },
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round'
      })
    }
  ];
}

/** Transparent vector overlay — no background fill so the basemap shows through. */
export function createContourOverlayLayer(opts: {
  pmtiles: PMTiles;
  isDarkMode: boolean;
}): L.GridLayer {
  return leafletLayer({
    url: opts.pmtiles as unknown as string,
    paintRules: buildContourPaintRules(opts.isDarkMode),
    labelRules: [],
    attribution: ''
  }) as unknown as L.GridLayer;
}
