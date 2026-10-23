import {
  elevationAtDistance,
  smoothedGradeAtDistance,
  smoothedGradeFromHistory
} from './smoothedGrade';

export function runSmoothedGradeValidation(): void {
  // +5 m over 100 m → 5.0%
  const climb100 = [
    { alt: 0, dist: 0 },
    { alt: 2.5, dist: 50 },
    { alt: 5, dist: 100 }
  ];
  const g5 = smoothedGradeFromHistory(climb100, 50, 10);
  if (g5 !== 5) {
    throw new Error(`Expected 5.0% for +5m/100m window 50m, got ${g5}`);
  }

  // run < 10 m → 0
  const short = [
    { alt: 0, dist: 0 },
    { alt: 3, dist: 5 }
  ];
  const g0 = smoothedGradeFromHistory(short, 50, 10);
  if (g0 !== 0) {
    throw new Error(`Expected 0 when run < 10m, got ${g0}`);
  }

  // Partial window (10–50 m): use full available span
  const partial = [
    { alt: 0, dist: 0 },
    { alt: 4, dist: 40 }
  ];
  const gPartial = smoothedGradeFromHistory(partial, 50, 10);
  if (gPartial !== 10) {
    throw new Error(`Expected 10% for +4m/40m partial window, got ${gPartial}`);
  }

  // Window picks older sample: last 50 m is flat after a climb
  // 0→50: +10m (20%), 50→100: flat. At 100 with window 50 → grade 0
  const thenFlat = [
    { alt: 0, dist: 0 },
    { alt: 10, dist: 50 },
    { alt: 10, dist: 100 }
  ];
  const flatGrade = smoothedGradeFromHistory(thenFlat, 50, 10);
  if (flatGrade !== 0) {
    throw new Error(`Expected 0% over last 50m flat, got ${flatGrade}`);
  }

  // Profile helper: same as history for even points
  const pts = [
    { ele: 0, distFromStart: 0 },
    { ele: 5, distFromStart: 100 }
  ];
  const atDist = smoothedGradeAtDistance(pts, 100, 50, 10);
  if (atDist !== 5) {
    throw new Error(`smoothedGradeAtDistance expected 5, got ${atDist}`);
  }

  const midEle = elevationAtDistance(pts, 50);
  if (midEle !== 2.5) {
    throw new Error(`elevationAtDistance mid expected 2.5, got ${midEle}`);
  }

  // Descent
  const down = [
    { alt: 20, dist: 0 },
    { alt: 15, dist: 50 },
    { alt: 10, dist: 100 }
  ];
  const neg = smoothedGradeFromHistory(down, 50, 10);
  if (neg !== -10) {
    throw new Error(`Expected -10% descent over 50m, got ${neg}`);
  }

  console.log('ALL SMOOTHED GRADE VALIDATIONS PASSED:');
  console.log('- (rise/run)*100 over 50m window');
  console.log('- short run returns 0');
  console.log('- window selects reference by distance');
  console.log('- profile distance helper matches');
}

runSmoothedGradeValidation();
