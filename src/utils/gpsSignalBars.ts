import { GpsStatus } from '../types/cycling';

export type GpsSignalStrength = 'Strong' | 'Moderate' | 'Least Strong' | 'No Signal';

export interface GpsSignalBarResult {
  bars: 0 | 1 | 2 | 3;
  strength: GpsSignalStrength;
  label: string;
}

/**
 * Validates and maps GPS status and accuracy to 3-bar signal meter:
 * - 3 bars = Strong strength (under 2.5m accuracy or GPS 3D fallback)
 * - 2 bars = Moderate strength (2.5m to 5.0m accuracy or GPS 2D fallback)
 * - 1 bar  = Least strong strength (above 5.0m accuracy or Weak fallback)
 * - 0 bars = No Signal / Searching (hasFix === false)
 */
export function calculateGpsSignalBars(gpsStatus: GpsStatus): GpsSignalBarResult {
  if (!gpsStatus.hasFix) {
    const label = gpsStatus.quality === 'Searching...' ? 'SEARCH' : 'NO';
    return {
      bars: 0,
      strength: 'No Signal',
      label
    };
  }

  let bars: 1 | 2 | 3;
  let strength: 'Strong' | 'Moderate' | 'Least Strong';

  if (gpsStatus.accuracy > 0) {
    if (gpsStatus.accuracy <= 2.5) {
      bars = 3;
      strength = 'Strong';
    } else if (gpsStatus.accuracy <= 5.0) {
      bars = 2;
      strength = 'Moderate';
    } else {
      bars = 1;
      strength = 'Least Strong';
    }
  } else {
    // Fallback when numeric accuracy is 0 or unmeasured
    if (gpsStatus.quality === 'GPS 3D') {
      bars = 3;
      strength = 'Strong';
    } else if (gpsStatus.quality === 'GPS 2D') {
      bars = 2;
      strength = 'Moderate';
    } else {
      bars = 1;
      strength = 'Least Strong';
    }
  }

  const label = gpsStatus.quality === 'GPS 2D' ? '2D' : '3D';

  return {
    bars,
    strength,
    label
  };
}
