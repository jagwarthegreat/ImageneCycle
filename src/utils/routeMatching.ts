/**
 * Snap GPS to planned route / pre-saved OSRM alternatives for offline TBT.
 */
import { RouteAlternative, RoutePoint, RouteTurn } from '../types/cycling';
import { haversineDistanceMeters } from './gpsService';

export const PRIMARY_BRANCH_ID = 'primary';
export const OFF_ROUTE_THRESHOLD_M = 40;
export const OFF_ROUTE_STREAK_NEEDED = 3;

export interface PolylineProjection {
  distAlongRoute: number;
  crossTrackMeters: number;
  segmentIndex: number;
}

export interface BranchTracker {
  branchId: string;
  offStreak: number;
}

export interface ActiveBranchResult {
  branchId: string;
  points: RoutePoint[];
  turns: RouteTurn[];
  distAlongRoute: number;
  crossTrackMeters: number;
  offRoute: boolean;
  switched: boolean;
}

function projectOntoSegment(
  lat: number,
  lng: number,
  a: RoutePoint,
  b: RoutePoint
): { lat: number; lng: number; t: number; distToSeg: number } {
  const ax = a.lng;
  const ay = a.lat;
  const bx = b.lng;
  const by = b.lat;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 1e-18) {
    t = ((lng - ax) * dx + (lat - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
  }
  const plat = ay + t * dy;
  const plng = ax + t * dx;
  const distToSeg = haversineDistanceMeters(lat, lng, plat, plng);
  return { lat: plat, lng: plng, t, distToSeg };
}

/** Nearest point on densified route polyline + distance along route. */
export function projectPointToPolyline(
  lat: number,
  lng: number,
  points: RoutePoint[]
): PolylineProjection {
  if (!points.length) {
    return { distAlongRoute: 0, crossTrackMeters: Infinity, segmentIndex: 0 };
  }
  if (points.length === 1) {
    return {
      distAlongRoute: points[0].distFromStart || 0,
      crossTrackMeters: haversineDistanceMeters(lat, lng, points[0].lat, points[0].lng),
      segmentIndex: 0
    };
  }

  let bestDist = Infinity;
  let bestAlong = 0;
  let bestSeg = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const proj = projectOntoSegment(lat, lng, a, b);
    if (proj.distToSeg < bestDist) {
      bestDist = proj.distToSeg;
      const segLen = Math.max(0, (b.distFromStart || 0) - (a.distFromStart || 0));
      bestAlong = (a.distFromStart || 0) + proj.t * segLen;
      bestSeg = i;
    }
  }

  return {
    distAlongRoute: Math.round(bestAlong),
    crossTrackMeters: bestDist,
    segmentIndex: bestSeg
  };
}

interface BranchCandidate {
  id: string;
  points: RoutePoint[];
  turns: RouteTurn[];
  projection: PolylineProjection;
}

/**
 * Pick primary or nearest pre-saved alternative. Mutates tracker for hysteresis.
 */
export function selectActiveRouteBranch(
  gps: { lat: number; lng: number },
  primaryPoints: RoutePoint[],
  primaryTurns: RouteTurn[] | undefined,
  alternatives: RouteAlternative[] | undefined,
  tracker: BranchTracker
): ActiveBranchResult {
  const candidates: BranchCandidate[] = [
    {
      id: PRIMARY_BRANCH_ID,
      points: primaryPoints,
      turns: primaryTurns || [],
      projection: projectPointToPolyline(gps.lat, gps.lng, primaryPoints)
    }
  ];

  for (const alt of alternatives || []) {
    if (!alt.points?.length) continue;
    candidates.push({
      id: alt.id,
      points: alt.points,
      turns: alt.turns || [],
      projection: projectPointToPolyline(gps.lat, gps.lng, alt.points)
    });
  }

  const current =
    candidates.find(c => c.id === tracker.branchId) || candidates[0];
  const currentXt = current.projection.crossTrackMeters;

  let chosen = current;
  let switched = false;

  if (currentXt > OFF_ROUTE_THRESHOLD_M) {
    tracker.offStreak += 1;
  } else {
    tracker.offStreak = 0;
  }

  if (tracker.offStreak >= OFF_ROUTE_STREAK_NEEDED) {
    let best = current;
    for (const c of candidates) {
      if (c.projection.crossTrackMeters < best.projection.crossTrackMeters) {
        best = c;
      }
    }
    if (
      best.id !== current.id &&
      best.projection.crossTrackMeters <= OFF_ROUTE_THRESHOLD_M
    ) {
      chosen = best;
      switched = true;
      tracker.branchId = best.id;
      tracker.offStreak = 0;
    }
  }

  // Stay on chosen if still vaguely near; otherwise report off-route
  const offRoute = chosen.projection.crossTrackMeters > OFF_ROUTE_THRESHOLD_M;

  return {
    branchId: chosen.id,
    points: chosen.points,
    turns: chosen.turns,
    distAlongRoute: chosen.projection.distAlongRoute,
    crossTrackMeters: chosen.projection.crossTrackMeters,
    offRoute,
    switched
  };
}
