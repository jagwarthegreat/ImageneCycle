import { RoutePoint, ClimbSegment, ProfileSlice, ClimbCategory, ClimbProLiveState } from '../types/cycling';

/** Route ClimbPro (planned) + Freeride ClimbPro (live): same classify gates. Score = length_m × avg_grade_%. */
export const CLIMB_MIN_LENGTH_M = 400;
export const CLIMB_MIN_AVG_GRADE = 2.5;
export const CLIMB_START_GRADE = 2.5;

/**
 * Standard Grade Color Mapping (consistent with Garmin / Magene / Wahoo ClimbPro conventions):
 * < 3%: Green (Mild / False flat)
 * 3% - 6%: Yellow (Moderate climb)
 * 6% - 9%: Orange (Steep)
 * 9% - 12%: Red (Very Steep)
 * > 12%: Purple / Magenta (Extreme ramp / The Wall)
 */
export function getGradeColor(grade: number): string {
  if (grade < 3.0) return '#22c55e'; // Green
  if (grade < 6.0) return '#eab308'; // Yellow
  if (grade < 9.0) return '#f97316'; // Orange
  if (grade < 12.0) return '#ef4444'; // Red
  return '#c026d3'; // Purple / Magenta
}

export function getClimbCategory(score: number): ClimbCategory {
  if (score >= 80000) return 'HC';
  if (score >= 64000) return '1';
  if (score >= 32000) return '2';
  if (score >= 16000) return '3';
  if (score >= 8000) return '4';
  return 'Uncategorized';
}

/**
 * Splits points into colored profile slices based on gradient segments.
 */
export function generateProfileSlices(points: RoutePoint[]): ProfileSlice[] {
  if (points.length < 2) return [];

  const slices: ProfileSlice[] = [];
  const totalLength = Math.max(
    1,
    points[points.length - 1].distFromStart - points[0].distFromStart
  );
  // ~40 slices across the course; denser on short rides, capped on long ones
  const stepDist = Math.min(80, Math.max(25, totalLength / 40));

  let currentStart = points[0];
  let accumulatedDist = 0;

  for (let i = 1; i < points.length; i++) {
    const pt = points[i];
    const prev = points[i - 1];
    const dDist = pt.distFromStart - prev.distFromStart;
    accumulatedDist += dDist;

    if (accumulatedDist >= stepDist || i === points.length - 1) {
      const dEle = pt.ele - currentStart.ele;
      const distSpan = Math.max(1, pt.distFromStart - currentStart.distFromStart);
      const grade = (dEle / distSpan) * 100;
      
      slices.push({
        distStart: currentStart.distFromStart,
        distEnd: pt.distFromStart,
        eleStart: currentStart.ele,
        eleEnd: pt.ele,
        grade: Math.round(grade * 10) / 10,
        color: getGradeColor(grade)
      });

      currentStart = pt;
      accumulatedDist = 0;
    }
  }

  return slices;
}

/**
 * Route ClimbPro: detect climbs on a pre-planned course.
 * Gates: length >= 400m and avg grade >= 2.5%. Climb Score = length × avgGrade.
 * Short hills (<400m) and false flats (<2.5%) are ignored.
 */
export function detectClimbsFromPoints(points: RoutePoint[]): ClimbSegment[] {
  if (points.length < 10) return [];

  const climbs: ClimbSegment[] = [];
  let climbStartIndex = -1;
  let runningAscent = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const dEle = curr.ele - prev.ele;
    const dDist = curr.distFromStart - prev.distFromStart;
    const instantaneousGrade = dDist > 0 ? (dEle / dDist) * 100 : 0;

    if (climbStartIndex === -1 && instantaneousGrade >= CLIMB_START_GRADE) {
      climbStartIndex = i - 1;
      runningAscent = Math.max(0, dEle);
    } else if (climbStartIndex !== -1) {
      if (dEle > 0) {
        runningAscent += dEle;
      }

      const isRouteEnd = i === points.length - 1;
      const isDescent = instantaneousGrade < -2.0 && (i > climbStartIndex + 5);

      if (isDescent || isRouteEnd) {
        const startPt = points[climbStartIndex];
        const endPt = isRouteEnd ? curr : points[i - 1];
        const length = endPt.distFromStart - startPt.distFromStart;
        const totalGain = Math.max(0, endPt.ele - startPt.ele);
        const avgGrade = length > 0 ? (totalGain / length) * 100 : 0;
        const climbScore = length * avgGrade;

        if (length >= CLIMB_MIN_LENGTH_M && avgGrade >= CLIMB_MIN_AVG_GRADE) {
          const climbPoints = points.slice(climbStartIndex, i);
          const maxGrade = Math.max(...climbPoints.map(p => p.grade || 0));

          climbs.push({
            id: `climb-${climbs.length + 1}`,
            name: `Climb ${climbs.length + 1}`,
            startDist: startPt.distFromStart,
            endDist: endPt.distFromStart,
            totalLength: length,
            startEle: startPt.ele,
            topEle: endPt.ele,
            totalElevationGain: Math.round(totalGain),
            avgGrade: Math.round(avgGrade * 10) / 10,
            maxGrade: Math.round(maxGrade * 10) / 10,
            category: getClimbCategory(climbScore),
            points: climbPoints,
            profileSlices: generateProfileSlices(climbPoints)
          });
        }

        climbStartIndex = -1;
        runningAscent = 0;
      }
    }
  }

  return climbs;
}

/**
 * Calculates real-time ClimbPro state given the current distance along the route.
 */
export function calculateClimbProLiveState(
  currentDist: number,
  climbs: ClimbSegment[],
  currentElevation: number,
  currentGrade: number
): ClimbProLiveState {
  if (!climbs || climbs.length === 0) {
    return {
      isInClimb: false,
      currentClimbIndex: 0,
      totalClimbsCount: 0,
      currentClimb: null,
      nextClimb: null,
      distToNextClimb: 0,
      distRemainingToTop: 0,
      remAscent: 0,
      avgGradeRemaining: 0,
      currentGrade,
      climbProgressPct: 0,
      vam: 0
    };
  }

  // Find if currently inside any climb
  const activeClimbIdx = climbs.findIndex(
    c => currentDist >= c.startDist && currentDist <= c.endDist
  );

  if (activeClimbIdx !== -1) {
    const climb = climbs[activeClimbIdx];
    const distDoneInClimb = currentDist - climb.startDist;
    const distRemainingToTop = Math.max(0, climb.endDist - currentDist);
    const remAscent = Math.max(0, Math.round(climb.topEle - currentElevation));
    const avgGradeRemaining =
      distRemainingToTop > 0
        ? Math.round(((remAscent / distRemainingToTop) * 100) * 10) / 10
        : 0;
    const climbProgressPct = Math.min(100, Math.max(0, (distDoneInClimb / climb.totalLength) * 100));

    // Next climb after this one
    const nextClimb = activeClimbIdx + 1 < climbs.length ? climbs[activeClimbIdx + 1] : null;
    const distToNextClimb = nextClimb ? Math.max(0, nextClimb.startDist - currentDist) : 0;

    return {
      isInClimb: true,
      currentClimbIndex: activeClimbIdx + 1,
      totalClimbsCount: climbs.length,
      currentClimb: climb,
      nextClimb,
      distToNextClimb,
      distRemainingToTop,
      remAscent,
      avgGradeRemaining,
      currentGrade,
      climbProgressPct,
      vam: 0 // populated by ride metric tracker
    };
  }

  // Not inside a climb: look for the next upcoming climb
  const upcomingIdx = climbs.findIndex(c => c.startDist > currentDist);
  const nextClimb = upcomingIdx !== -1 ? climbs[upcomingIdx] : null;
  const distToNextClimb = nextClimb ? Math.max(0, nextClimb.startDist - currentDist) : 0;

  return {
    isInClimb: false,
    currentClimbIndex: upcomingIdx !== -1 ? upcomingIdx + 1 : 0,
    totalClimbsCount: climbs.length,
    currentClimb: null,
    nextClimb,
    distToNextClimb,
    distRemainingToTop: nextClimb ? nextClimb.totalLength : 0,
    remAscent: nextClimb ? nextClimb.totalElevationGain : 0,
    avgGradeRemaining: nextClimb ? nextClimb.avgGrade : 0,
    currentGrade,
    climbProgressPct: 0,
    vam: 0
  };
}
