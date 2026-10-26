import { BreadcrumbPoint } from '../types/cycling';

const WEAK_MIN_INTERVAL_MS = 5000;
const WEAK_MIN_DIST_M = 20;
const STITCH_GAP_MS = 45000;
const STITCH_GAP_M = 80;

function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Thinned weak-GPS trail point (does not advance ride distance). */
export function shouldAppendWeakBreadcrumb(
  last: BreadcrumbPoint | null | undefined,
  fix: { lat: number; lng: number; time?: number }
): boolean {
  if (!last) return true;
  const dt = (fix.time ?? Date.now()) - (last.time ?? 0);
  if (dt >= WEAK_MIN_INTERVAL_MS) return true;
  return haversineM(last, fix) >= WEAK_MIN_DIST_M;
}

/** True when a good fix returns after a long outage — insert stitch then good point. */
export function shouldStitchBreadcrumb(
  last: BreadcrumbPoint | null | undefined,
  fix: { lat: number; lng: number; time?: number }
): boolean {
  if (!last) return false;
  const dt = (fix.time ?? Date.now()) - (last.time ?? 0);
  if (dt >= STITCH_GAP_MS) return true;
  return haversineM(last, fix) >= STITCH_GAP_M;
}

export function splitBreadcrumbsForMap(points: BreadcrumbPoint[]): {
  good: [number, number][];
  weak: [number, number][];
} {
  const good: [number, number][] = [];
  const weak: [number, number][] = [];
  for (const p of points) {
    const ll: [number, number] = [p.lat, p.lng];
    if (p.quality === 'weak' || p.quality === 'stitch') weak.push(ll);
    else good.push(ll);
  }
  // Keep trail continuous: weak path includes last good as anchor when both exist
  if (good.length && weak.length) {
    const lastGood = good[good.length - 1];
    if (weak[0][0] !== lastGood[0] || weak[0][1] !== lastGood[1]) {
      weak.unshift(lastGood);
    }
  }
  return { good, weak };
}
