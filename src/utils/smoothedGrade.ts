/**
 * Strava-style smoothed grade: (rise / run) * 100 over a distance window.
 */

export interface GradeSample {
  alt: number;
  dist: number;
}

const DEFAULT_WINDOW_M = 50;
const DEFAULT_MIN_RUN_M = 10;
const GRADE_MIN = -25;
const GRADE_MAX = 30;

function clampGrade(grade: number): number {
  return Math.max(GRADE_MIN, Math.min(GRADE_MAX, grade));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Walk backward from the latest sample until run >= smoothing window.
 * Returns 0 until enough distance has accumulated (avoids spike on tiny run).
 */
export function smoothedGradeFromHistory(
  history: GradeSample[],
  smoothingDistanceMeters = DEFAULT_WINDOW_M,
  minRunMeters = DEFAULT_MIN_RUN_M
): number {
  if (history.length < 2) return 0;

  const latest = history[history.length - 1];
  let reference = history[0];
  let runDistance = 0;
  let hitWindow = false;

  for (let i = history.length - 2; i >= 0; i--) {
    const current = history[i];
    const next = history[i + 1];
    runDistance += Math.max(0, next.dist - current.dist);

    if (runDistance >= smoothingDistanceMeters) {
      reference = current;
      hitWindow = true;
      break;
    }
  }

  if (!hitWindow) {
    reference = history[0];
    runDistance = Math.max(0, latest.dist - reference.dist);
  }

  if (runDistance < minRunMeters) return 0;

  const rise = latest.alt - reference.alt;
  return round1(clampGrade((rise / runDistance) * 100));
}

function interpolateEleAtDist(
  points: { ele: number; distFromStart: number }[],
  atDist: number
): number {
  if (points.length === 0) return 0;
  if (atDist <= points[0].distFromStart) return points[0].ele;
  const last = points[points.length - 1];
  if (atDist >= last.distFromStart) return last.ele;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (atDist >= a.distFromStart && atDist <= b.distFromStart) {
      const span = b.distFromStart - a.distFromStart;
      if (span <= 0) return a.ele;
      const t = (atDist - a.distFromStart) / span;
      return a.ele + t * (b.ele - a.ele);
    }
  }
  return last.ele;
}

/** Grade at a distance along a route/climb profile using the same window math. */
export function smoothedGradeAtDistance(
  points: { ele: number; distFromStart: number }[],
  atDistMeters: number,
  smoothingDistanceMeters = DEFAULT_WINDOW_M,
  minRunMeters = DEFAULT_MIN_RUN_M
): number {
  if (points.length < 2) return 0;

  const history: GradeSample[] = [];
  for (const p of points) {
    if (p.distFromStart <= atDistMeters) {
      history.push({ alt: p.ele, dist: p.distFromStart });
    }
  }

  if (history.length === 0) return 0;

  const last = history[history.length - 1];
  if (last.dist < atDistMeters - 0.01) {
    history.push({ alt: interpolateEleAtDist(points, atDistMeters), dist: atDistMeters });
  } else if (Math.abs(last.dist - atDistMeters) > 0.01) {
    // Exact hit already; ensure tip is atDist when last point equals atDist
  }

  return smoothedGradeFromHistory(history, smoothingDistanceMeters, minRunMeters);
}

/** Elevation at distance along profile (for scrub tooltip). */
export function elevationAtDistance(
  points: { ele: number; distFromStart: number }[],
  atDistMeters: number
): number {
  return round1(interpolateEleAtDist(points, atDistMeters));
}
