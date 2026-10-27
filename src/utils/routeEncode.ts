/**
 * Encode start→destination via OSRM bike routing (geometry + turn-by-turn),
 * fetch elevations (Open-Meteo), build RoutePoint grades + ClimbPro climbs.
 */
import { RouteAlternative, RouteData, RoutePoint, RouteTurn } from '../types/cycling';
import { detectClimbsFromPoints } from './climbProEngine';
import { haversineDistanceMeters, calculateBearingDegrees } from './gpsService';
import { projectPointToPolyline } from './routeMatching';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface OsrmRouteResult {
  coords: LatLng[];
  turns: RouteTurn[];
}

export interface OsrmMultiRouteResult {
  primary: OsrmRouteResult;
  alternatives: OsrmRouteResult[];
}

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/bike';
const ELEV_BATCH = 100;
const SAMPLE_STEP_M = 35;
const MAX_POINTS = 800;

/** Straight-line densify between waypoints when OSRM fails */
export function densifyStraightLine(waypoints: LatLng[], stepMeters = SAMPLE_STEP_M): LatLng[] {
  if (waypoints.length < 2) return [...waypoints];
  const out: LatLng[] = [{ ...waypoints[0] }];

  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const segLen = haversineDistanceMeters(a.lat, a.lng, b.lat, b.lng);
    const steps = Math.max(1, Math.ceil(segLen / stepMeters));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push({
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t
      });
    }
  }

  return capPoints(out);
}

function capPoints(coords: LatLng[]): LatLng[] {
  if (coords.length <= MAX_POINTS) return coords;
  const step = coords.length / MAX_POINTS;
  const out: LatLng[] = [];
  for (let i = 0; i < MAX_POINTS - 1; i++) {
    out.push(coords[Math.floor(i * step)]);
  }
  out.push(coords[coords.length - 1]);
  return out;
}

/** Densify an already-encoded polyline by distance along edges */
export function densifyPolyline(coords: LatLng[], stepMeters = SAMPLE_STEP_M): LatLng[] {
  if (coords.length < 2) return [...coords];
  const out: LatLng[] = [{ ...coords[0] }];
  let carry = 0;

  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const segLen = haversineDistanceMeters(a.lat, a.lng, b.lat, b.lng);
    if (segLen <= 0) continue;

    let dist = stepMeters - carry;
    while (dist < segLen) {
      const t = dist / segLen;
      out.push({
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t
      });
      dist += stepMeters;
    }
    carry = segLen - (dist - stepMeters);
    out.push({ ...b });
  }

  return capPoints(out);
}

export function formatOsrmInstruction(
  type: string,
  modifier: string | undefined,
  name: string
): string {
  const road = name && name.trim() ? name.trim() : '';
  const onto = road ? ` onto ${road}` : '';
  const mod = (modifier || '').replace(/_/g, ' ');

  switch (type) {
    case 'depart':
      return road ? `Head ${mod || 'out'} on ${road}` : `Head ${mod || 'out'}`;
    case 'arrive':
      return 'You have arrived at your destination';
    case 'turn':
      return `Turn ${mod || ''}${onto}`.replace(/\s+/g, ' ').trim();
    case 'new name':
      return road ? `Continue onto ${road}` : 'Continue';
    case 'merge':
      return `Merge ${mod}${onto}`.replace(/\s+/g, ' ').trim();
    case 'ramp':
      return `Take the ramp ${mod}${onto}`.replace(/\s+/g, ' ').trim();
    case 'fork':
      return `Keep ${mod || 'straight'} at the fork${onto}`;
    case 'end of road':
      return `At the end of the road, turn ${mod}${onto}`.replace(/\s+/g, ' ').trim();
    case 'continue':
      return road ? `Continue on ${road}` : `Continue ${mod}`.trim();
    case 'roundabout':
    case 'rotary':
      return `Enter the roundabout${onto}`;
    case 'exit roundabout':
    case 'exit rotary':
      return `Exit the roundabout${onto}`;
    case 'notification':
      return road || 'Continue';
    default:
      return `${type}${mod ? ` ${mod}` : ''}${onto}`.replace(/\s+/g, ' ').trim();
  }
}

type OsrmRouteJson = {
  geometry?: { coordinates?: [number, number][] };
  legs?: Array<{
    steps?: Array<{
      distance?: number;
      name?: string;
      maneuver?: {
        type?: string;
        modifier?: string;
        location?: [number, number];
      };
    }>;
  }>;
};

function parseOsrmTurnsFromRoute(route: OsrmRouteJson | undefined): RouteTurn[] {
  const turns: RouteTurn[] = [];
  let cumulative = 0;
  let index = 0;
  const legs = route?.legs || [];

  for (const leg of legs) {
    for (const step of leg.steps || []) {
      const type = step.maneuver?.type || 'continue';
      const modifier = step.maneuver?.modifier;
      const name = step.name || '';
      const loc = step.maneuver?.location;
      const distanceMeters = Math.round(step.distance || 0);

      turns.push({
        index,
        instruction: formatOsrmInstruction(type, modifier, name),
        distanceMeters,
        name,
        maneuverType: type,
        modifier,
        location: {
          lat: loc?.[1] ?? 0,
          lng: loc?.[0] ?? 0
        },
        distFromRouteStart: Math.round(cumulative)
      });

      cumulative += distanceMeters;
      index += 1;
    }
  }

  return turns;
}

function osrmRouteToResult(route: OsrmRouteJson): OsrmRouteResult | null {
  const raw = route.geometry?.coordinates;
  if (!raw || raw.length < 2) return null;
  const coords: LatLng[] = raw.map(c => ({ lng: c[0], lat: c[1] }));
  return {
    coords: densifyPolyline(coords),
    turns: parseOsrmTurnsFromRoute(route)
  };
}

/** Fetch primary bike route + OSRM alternatives (all with steps for offline TBT). */
export async function fetchOsrmBikeRouteWithAlternatives(
  waypoints: LatLng[]
): Promise<OsrmMultiRouteResult | null> {
  if (waypoints.length < 2) return null;
  const path = waypoints.map(w => `${w.lng},${w.lat}`).join(';');
  const url = `${OSRM_BASE}/${path}?overview=full&geometries=geojson&steps=true&annotations=false&alternatives=true`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.length) return null;

    const routes = data.routes as OsrmRouteJson[];
    const primary = osrmRouteToResult(routes[0]);
    if (!primary) return null;

    const alternatives: OsrmRouteResult[] = [];
    for (let i = 1; i < routes.length; i++) {
      const alt = osrmRouteToResult(routes[i]);
      if (alt && alt.coords.length >= 2) alternatives.push(alt);
    }

    return { primary, alternatives };
  } catch {
    return null;
  }
}

export async function fetchOsrmBikeRoute(waypoints: LatLng[]): Promise<OsrmRouteResult | null> {
  const multi = await fetchOsrmBikeRouteWithAlternatives(waypoints);
  return multi?.primary ?? null;
}

const ELEV_FETCH_RETRIES = 2;
const ELEV_RETRY_DELAY_MS = 400;

async function fetchElevationBatch(batch: LatLng[]): Promise<number[] | null> {
  const lats = batch.map(c => c.lat.toFixed(5)).join(',');
  const lngs = batch.map(c => c.lng.toFixed(5)).join(',');
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;

  for (let attempt = 0; attempt <= ELEV_FETCH_RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        if (attempt < ELEV_FETCH_RETRIES) {
          await new Promise(r => setTimeout(r, ELEV_RETRY_DELAY_MS * (attempt + 1)));
          continue;
        }
        return null;
      }
      const data = await res.json();
      const elevs: number[] = data.elevation || [];
      if (!Array.isArray(elevs) || elevs.length === 0) {
        if (attempt < ELEV_FETCH_RETRIES) {
          await new Promise(r => setTimeout(r, ELEV_RETRY_DELAY_MS * (attempt + 1)));
          continue;
        }
        return null;
      }
      return batch.map((_, j) => (typeof elevs[j] === 'number' ? elevs[j] : 0));
    } catch {
      if (attempt < ELEV_FETCH_RETRIES) {
        await new Promise(r => setTimeout(r, ELEV_RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }
      return null;
    }
  }
  return null;
}

/** True when elevation profile looks usable (not an all-zero API failure). */
export function elevationProfileLooksValid(elevations: number[], minPoints = 10): boolean {
  if (elevations.length < minPoints) return elevations.some(e => Number.isFinite(e) && e !== 0);
  let nonZero = 0;
  for (const e of elevations) {
    if (Number.isFinite(e) && Math.abs(e) > 0.01) nonZero++;
  }
  // At least ~5% of samples must be non-zero (coastal flats can be near 0, but not all).
  return nonZero >= Math.max(3, Math.floor(elevations.length * 0.05));
}

export async function fetchElevations(coords: LatLng[]): Promise<number[]> {
  if (coords.length === 0) return [];
  const elevations: number[] = new Array(coords.length).fill(0);
  let failedBatches = 0;
  let totalBatches = 0;

  for (let i = 0; i < coords.length; i += ELEV_BATCH) {
    totalBatches++;
    const batch = coords.slice(i, i + ELEV_BATCH);
    const batchElevs = await fetchElevationBatch(batch);
    if (!batchElevs) {
      failedBatches++;
      continue;
    }
    for (let j = 0; j < batch.length; j++) {
      elevations[i + j] = batchElevs[j] ?? 0;
    }
  }

  if (failedBatches === totalBatches && totalBatches > 0) {
    throw new Error('Could not fetch elevations. Check your connection and try again.');
  }

  if (coords.length >= 10 && !elevationProfileLooksValid(elevations)) {
    throw new Error(
      'Elevation data came back empty. Check your connection and try again — climbs need a real elevation profile.'
    );
  }

  return elevations;
}

export function buildRoutePointsFromCoords(coords: LatLng[], elevations: number[]): RoutePoint[] {
  const points: RoutePoint[] = [];
  let runningDist = 0;

  for (let i = 0; i < coords.length; i++) {
    const { lat, lng } = coords[i];
    const ele = elevations[i] ?? 0;
    let dDist = 0;
    let heading = 0;
    let grade = 0;

    if (i > 0) {
      const prev = points[i - 1];
      dDist = haversineDistanceMeters(prev.lat, prev.lng, lat, lng);
      runningDist += dDist;
      heading = calculateBearingDegrees(prev.lat, prev.lng, lat, lng);
      grade = dDist > 0 ? ((ele - prev.ele) / dDist) * 100 : 0;
      grade = Math.max(-25, Math.min(35, grade));
    }

    points.push({
      lat,
      lng,
      ele: Math.round(ele * 10) / 10,
      distFromStart: Math.round(runningDist),
      grade: Math.round(grade * 10) / 10,
      heading: Math.round(heading)
    });
  }

  return points;
}

/** Remap OSRM turn cumulatives onto densified polyline distance space. */
export function remapTurnsOntoPolyline(turns: RouteTurn[], points: RoutePoint[]): RouteTurn[] {
  if (!turns.length || points.length < 2) return turns.map(t => ({ ...t }));

  const remapped = turns.map(turn => {
    const loc = turn.location;
    if (!loc || (!loc.lat && !loc.lng)) return { ...turn };
    const proj = projectPointToPolyline(loc.lat, loc.lng, points);
    return {
      ...turn,
      distFromRouteStart: Math.round(proj.distAlongRoute)
    };
  });

  // Keep step distanceMeters consistent with successive remapped starts (last keeps OSRM length).
  for (let i = 0; i < remapped.length - 1; i++) {
    const nextStart = remapped[i + 1].distFromRouteStart;
    const curStart = remapped[i].distFromRouteStart;
    remapped[i] = {
      ...remapped[i],
      distanceMeters: Math.max(0, nextStart - curStart)
    };
  }

  return remapped;
}

export function buildRouteFromEncodedPath(
  name: string,
  coords: LatLng[],
  elevations: number[],
  options?: {
    location?: string;
    id?: string;
    turns?: RouteTurn[];
    alternatives?: RouteAlternative[];
    waypoints?: LatLng[];
  }
): RouteData {
  const points = buildRoutePointsFromCoords(coords, elevations);
  let totalElevationGain = 0;
  for (let i = 1; i < points.length; i++) {
    const d = points[i].ele - points[i - 1].ele;
    if (d > 0) totalElevationGain += d;
  }

  const first = points[0];
  const last = points[points.length - 1];
  const climbs = detectClimbsFromPoints(points);
  const turns = options?.turns?.length
    ? remapTurnsOntoPolyline(options.turns, points)
    : options?.turns || [];

  const alternatives = options?.alternatives?.length
    ? options.alternatives.map(alt => ({
        ...alt,
        turns: alt.turns?.length ? remapTurnsOntoPolyline(alt.turns, alt.points) : alt.turns
      }))
    : undefined;

  return {
    id: options?.id || `route-${Date.now()}`,
    name: name || 'Custom Route',
    location: options?.location || 'Custom',
    totalDistance: last ? last.distFromStart : 0,
    totalElevationGain: Math.round(totalElevationGain),
    points,
    climbs,
    turns,
    alternatives,
    waypoints: options?.waypoints?.length
      ? options.waypoints.map(w => ({ lat: w.lat, lng: w.lng }))
      : undefined,
    startLat: first?.lat,
    startLng: first?.lng,
    endLat: last?.lat,
    endLng: last?.lng
  };
}

/** Recompute grades/climbs after manual elevation edits; keep existing turns */
export function recomputeRouteFromPoints(route: RouteData, elevations: number[]): RouteData {
  const coords = route.points.map(p => ({ lat: p.lat, lng: p.lng }));
  return buildRouteFromEncodedPath(route.name, coords, elevations, {
    id: route.id,
    location: route.location,
    turns: route.turns,
    alternatives: route.alternatives,
    waypoints: route.waypoints
  });
}

/** Remaining distance along a planned route (meters). */
export function getRouteRemainingDistanceMeters(
  points: { distFromStart: number }[],
  distanceTraveled: number
): number {
  if (!points.length) return 0;
  const total = points[points.length - 1].distFromStart;
  return Math.max(0, total - distanceTraveled);
}

/** Remaining positive elevation gain from current distance to end (meters). */
export function getRouteRemainingAscentMeters(
  points: { distFromStart: number; ele: number }[],
  distanceTraveled: number
): number {
  if (points.length < 2) return 0;
  let gain = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].distFromStart < distanceTraveled) continue;
    const d = points[i].ele - points[i - 1].ele;
    if (d > 0) gain += d;
  }
  return Math.round(gain);
}

/** Average grade % over remaining route distance. */
export function getRouteRemainingAvgGrade(
  points: { distFromStart: number; ele: number }[],
  distanceTraveled: number
): number {
  const remDist = getRouteRemainingDistanceMeters(points, distanceTraveled);
  const remAscent = getRouteRemainingAscentMeters(points, distanceTraveled);
  if (remDist <= 0) return 0;
  return Math.round(((remAscent / remDist) * 100) * 10) / 10;
}

export interface NextTurnCue {
  turn: RouteTurn;
  metersToManeuver: number;
}

function isDisplayableTurn(turn: RouteTurn): boolean {
  const type = turn.maneuverType || '';
  if (type === 'depart' || type === 'notification') return false;
  return true;
}

/** Advance to the next cue once the rider is this far past the maneuver point. */
export const MANEUVER_PASSED_EPS_M = 10;

/**
 * Live next-turn cue from OSRM steps + distance along route.
 * Cues the upcoming maneuver by distFromRouteStart (not the whole OSRM step length),
 * so instructions advance when the rider completes the turn.
 */
export function getNextTurn(
  turns: RouteTurn[] | undefined,
  distanceTraveled: number
): NextTurnCue | null {
  if (!turns || turns.length === 0) return null;

  const actionable = turns.filter(isDisplayableTurn);
  const list = actionable.length ? actionable : turns;

  for (const turn of list) {
    if (distanceTraveled < turn.distFromRouteStart + MANEUVER_PASSED_EPS_M) {
      return {
        turn,
        metersToManeuver: Math.max(0, Math.round(turn.distFromRouteStart - distanceTraveled))
      };
    }
  }

  const last = list[list.length - 1];
  return { turn: last, metersToManeuver: 0 };
}

/**
 * Full pipeline: OSRM encode + steps (or straight fallback) → elevations → RouteData.
 * Requires internet — TBT + elevations are saved on the RouteData for offline riding.
 */
export async function evaluateRouteFromEndpoints(
  name: string,
  waypoints: LatLng[]
): Promise<{ route: RouteData; usedOsrm: boolean }> {
  if (waypoints.length < 2) {
    throw new Error('Start and destination are required');
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Connect to the internet to create a route (OSRM turn-by-turn + elevations). Saved routes still work offline.');
  }

  const osrm = await fetchOsrmBikeRouteWithAlternatives(waypoints);
  let coords: LatLng[];
  let turns: RouteTurn[] = [];
  let usedOsrm = true;
  let altResults: OsrmRouteResult[] = [];

  if (osrm && osrm.primary.coords.length >= 2) {
    coords = osrm.primary.coords;
    turns = osrm.primary.turns;
    altResults = osrm.alternatives;
  } else {
    throw new Error('Could not reach OSRM routing. Check your connection and try again — turn-by-turn needs internet when creating a route.');
  }

  let elevations: number[];
  try {
    elevations = await fetchElevations(coords);
  } catch {
    throw new Error('Could not fetch elevations. Check your connection and try again.');
  }

  // Alternatives: geometry + TBT only (skip elev API to keep create fast / quota-friendly)
  const alternatives: RouteAlternative[] = altResults.map((alt, i) => {
    const zeros = new Array(alt.coords.length).fill(0);
    const points = buildRoutePointsFromCoords(alt.coords, zeros);
    const last = points[points.length - 1];
    return {
      id: `alt-${i + 1}`,
      points,
      turns: remapTurnsOntoPolyline(alt.turns, points),
      totalDistance: last ? last.distFromStart : 0
    };
  });

  const route = buildRouteFromEncodedPath(name, coords, elevations, {
    turns,
    alternatives,
    waypoints
  });
  return { route, usedOsrm };
}
