/** Dual-source auto-pause: max(GPS, BLE) < 3 km/h for ≥3s → pause; either ≥3 → resume (auto only). */

export const AUTO_PAUSE_SPEED_KMH = 3;
export const AUTO_PAUSE_HOLD_MS = 3000;

export interface AutoPauseState {
  lowSpeedSince: number | null;
  isAutoPaused: boolean;
}

export interface AutoPauseInput {
  gpsKmh: number;
  bleKmh: number | null;
  /** True when the rider tapped pause — movement must not auto-resume. */
  manualPaused: boolean;
  now: number;
  prior: AutoPauseState;
}

export interface AutoPauseResult extends AutoPauseState {
  /** Fired when auto-pause flag flips; null if unchanged. */
  changedTo: boolean | null;
}

export function effectiveSpeedKmh(gpsKmh: number, bleKmh: number | null): number {
  const g = Number.isFinite(gpsKmh) ? Math.max(0, gpsKmh) : 0;
  const b = bleKmh != null && Number.isFinite(bleKmh) ? Math.max(0, bleKmh) : 0;
  return Math.max(g, b);
}

export function evaluateAutoPause(input: AutoPauseInput): AutoPauseResult {
  const { manualPaused, now, prior } = input;
  const speed = effectiveSpeedKmh(input.gpsKmh, input.bleKmh);

  if (manualPaused) {
    return {
      lowSpeedSince: null,
      isAutoPaused: false,
      changedTo: prior.isAutoPaused ? false : null
    };
  }

  if (speed >= AUTO_PAUSE_SPEED_KMH) {
    const changedTo = prior.isAutoPaused ? false : null;
    return { lowSpeedSince: null, isAutoPaused: false, changedTo };
  }

  const lowSpeedSince = prior.lowSpeedSince ?? now;
  if (!prior.isAutoPaused && now - lowSpeedSince >= AUTO_PAUSE_HOLD_MS) {
    return { lowSpeedSince, isAutoPaused: true, changedTo: true };
  }
  return { lowSpeedSince, isAutoPaused: prior.isAutoPaused, changedTo: null };
}
