import { RoutePoint } from '../types/cycling';
import { haversineDistanceMeters } from './gpsService';
import { ellipsoidToEgm96 } from 'egm96-universal';

/**
 * Elevation Service
 * Provides:
 * 1. Accurate route profile elevation interpolation (Course Elevation Snapping)
 * 2. EGM96 Geoid Undulation correction (converting mobile WGS84 ellipsoidal height to true Mean Sea Level)
 * 3. Digital Elevation Model (DEM) ground-truth calibration via Open-Meteo with local caching
 */

const DEM_CACHE_PREFIX = 'magene-dem-';

/**
 * Interpolate the planned route elevation at the given distance along the route.
 * If the rider is near the course, this matches the ClimbPro profile chart 100%.
 */
export function getRouteElevation(
  points: RoutePoint[] | undefined,
  distanceTraveled: number,
  coords?: { lat: number; lng: number }
): number | null {
  if (!points || points.length === 0) return null;
  if (points.length === 1) return points[0].ele;

  // 1. If at start or negative distance, return first point's elevation
  if (distanceTraveled <= (points[0].distFromStart || 0)) {
    return points[0].ele;
  }

  // 2. If past the end, return the summit/finish elevation
  const last = points[points.length - 1];
  if (distanceTraveled >= last.distFromStart) {
    return last.ele;
  }

  // 3. Optional GPS proximity check: if rider coordinates are close to a specific route point
  if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
    let closestIdx = -1;
    let closestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const d = haversineDistanceMeters(coords.lat, coords.lng, p.lat, p.lng);
      if (d < closestDist) {
        closestDist = d;
        closestIdx = i;
      }
    }
    // If rider is close to start (< 150m) and distance traveled is minimal (< 50m)
    if (closestIdx === 0 && closestDist <= 150 && distanceTraveled < 50) {
      return points[0].ele;
    }
  }

  // 4. Binary search / scan for distance bounding segment and linearly interpolate
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (distanceTraveled >= p1.distFromStart && distanceTraveled <= p2.distFromStart) {
      const span = p2.distFromStart - p1.distFromStart;
      if (span <= 0) return p1.ele;
      const t = (distanceTraveled - p1.distFromStart) / span;
      const interpolated = p1.ele + t * (p2.ele - p1.ele);
      return Math.round(interpolated * 10) / 10;
    }
  }

  return points[0].ele;
}

/**
 * Converts raw GPS WGS84 ellipsoidal height into true Mean Sea Level (MSL) orthometric height
 * using the EGM96 Geoid Model.
 * On Android / mobile browsers, coords.altitude is ellipsoidal height (e.g. +60m in the Philippines).
 */
export function correctEllipsoidalAltitude(lat: number, lng: number, rawAltitude: number): number {
  if (!Number.isFinite(rawAltitude) || rawAltitude === 0) return 0;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return rawAltitude;

  try {
    const msl = ellipsoidToEgm96(lat, lng, rawAltitude);
    // Sanity check: keep elevation within realistic terrestrial bounds (-500m to 9000m)
    if (Number.isFinite(msl) && msl >= -500 && msl <= 9000) {
      return Math.round(msl * 10) / 10;
    }
  } catch (err) {
    console.warn('Geoid undulation error:', err);
  }

  return Math.round(rawAltitude * 10) / 10;
}

// In-memory cache for fast repeated lookups
const inMemoryDemCache = new Map<string, number>();

/**
 * Fetches accurate 90m SRTM/Copernicus ground elevation from Open-Meteo API with caching.
 */
export async function fetchDemElevation(lat: number, lng: number): Promise<number | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const key = `${lat.toFixed(3)}_${lng.toFixed(3)}`;

  // 1. Check in-memory cache
  if (inMemoryDemCache.has(key)) {
    return inMemoryDemCache.get(key)!;
  }

  // 2. Check localStorage
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(`${DEM_CACHE_PREFIX}${key}`);
      if (cached) {
        const val = parseFloat(cached);
        if (Number.isFinite(val)) {
          inMemoryDemCache.set(key, val);
          return val;
        }
      }
    } catch {}
  }

  // 3. Online fetch
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return null;
  }

  try {
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(5)}&longitude=${lng.toFixed(5)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.elevation && Array.isArray(data.elevation) && typeof data.elevation[0] === 'number') {
      const ele = Math.round(data.elevation[0] * 10) / 10;
      inMemoryDemCache.set(key, ele);
      try {
        localStorage.setItem(`${DEM_CACHE_PREFIX}${key}`, ele.toString());
      } catch {}
      return ele;
    }
  } catch (err) {
    console.warn('DEM elevation fetch error:', err);
  }

  return null;
}
