import { calculateGpsSignalBars } from './gpsSignalBars';

export function runGpsBarsValidation(): void {
  // Test 1: 3 bars = Strong strength under 2.5m
  const strong1 = calculateGpsSignalBars({ hasFix: true, accuracy: 1.5, quality: 'GPS 3D' });
  if (strong1.bars !== 3 || strong1.strength !== 'Strong') {
    throw new Error(`Expected 3 bars and Strong, got ${strong1.bars} and ${strong1.strength}`);
  }

  const strongBoundary = calculateGpsSignalBars({ hasFix: true, accuracy: 2.5, quality: 'GPS 3D' });
  if (strongBoundary.bars !== 3 || strongBoundary.strength !== 'Strong') {
    throw new Error(`Boundary 2.5m should yield 3 bars (Strong)`);
  }

  // Test 2: 2 bars = Moderate strength between 2.5m and 5.0m
  const moderate1 = calculateGpsSignalBars({ hasFix: true, accuracy: 3.2, quality: 'GPS 3D' });
  if (moderate1.bars !== 2 || moderate1.strength !== 'Moderate') {
    throw new Error(`Expected 2 bars and Moderate for 3.2m, got ${moderate1.bars} and ${moderate1.strength}`);
  }

  const moderateBoundary = calculateGpsSignalBars({ hasFix: true, accuracy: 5.0, quality: 'GPS 3D' });
  if (moderateBoundary.bars !== 2 || moderateBoundary.strength !== 'Moderate') {
    throw new Error(`Boundary 5.0m should yield 2 bars (Moderate)`);
  }

  // Test 3: 1 bar = Least strong strength above 5.0m
  const weak1 = calculateGpsSignalBars({ hasFix: true, accuracy: 5.1, quality: 'GPS 3D' });
  if (weak1.bars !== 1 || weak1.strength !== 'Least Strong') {
    throw new Error(`Expected 1 bar and Least Strong for 5.1m, got ${weak1.bars} and ${weak1.strength}`);
  }

  const weak2 = calculateGpsSignalBars({ hasFix: true, accuracy: 20.0, quality: 'Weak' });
  if (weak2.bars !== 1 || weak2.strength !== 'Least Strong') {
    throw new Error(`Expected 1 bar and Least Strong for 20m, got ${weak2.bars} and ${weak2.strength}`);
  }

  // Test 4: Fallbacks when accuracy is 0
  const fallback3D = calculateGpsSignalBars({ hasFix: true, accuracy: 0, quality: 'GPS 3D' });
  if (fallback3D.bars !== 3 || fallback3D.strength !== 'Strong') {
    throw new Error(`GPS 3D fallback should yield 3 bars (Strong)`);
  }

  const fallback2D = calculateGpsSignalBars({ hasFix: true, accuracy: 0, quality: 'GPS 2D' });
  if (fallback2D.bars !== 2 || fallback2D.strength !== 'Moderate') {
    throw new Error(`GPS 2D fallback should yield 2 bars (Moderate)`);
  }

  const fallbackWeak = calculateGpsSignalBars({ hasFix: true, accuracy: 0, quality: 'Weak' });
  if (fallbackWeak.bars !== 1 || fallbackWeak.strength !== 'Least Strong') {
    throw new Error(`Weak fallback should yield 1 bar (Least Strong)`);
  }

  // Test 5: No fix
  const noFix = calculateGpsSignalBars({ hasFix: false, accuracy: 0, quality: 'Searching...' });
  if (noFix.bars !== 0 || noFix.strength !== 'No Signal') {
    throw new Error(`No fix should yield 0 bars`);
  }

  console.log('ALL GPS SIGNAL BAR VALIDATIONS PASSED:');
  console.log('- 3 bars is verified as Strong strength (accuracy <= 2.5m or 3D lock)');
  console.log('- 2 bars is verified as Moderate strength (2.5m < accuracy <= 5.0m or 2D lock)');
  console.log('- 1 bar is verified as Least Strong strength (accuracy > 5.0m or Weak lock)');
  console.log('- 0 bars is verified as No Signal / Searching');
}

runGpsBarsValidation();
