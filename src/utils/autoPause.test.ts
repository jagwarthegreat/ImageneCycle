/** Self-check — run: npx tsx src/utils/autoPause.test.ts
 * Under test: evaluateAutoPause / effectiveSpeedKmh in autoPause.ts
 * Existing tests for this module: none (peer pattern: gpsSignalBars.test.ts)
 * User: Implement the plan as specified… unit test autoPause.ts
 */
import {
  AUTO_PAUSE_HOLD_MS,
  evaluateAutoPause,
  effectiveSpeedKmh
} from './autoPause';

export function runAutoPauseValidation(): void {
  if (effectiveSpeedKmh(2, 5) !== 5) throw new Error('max(gps,ble) failed');
  if (effectiveSpeedKmh(4, null) !== 4) throw new Error('gps-only failed');

  const prior = { lowSpeedSince: null as number | null, isAutoPaused: false };
  const t0 = 1_000_000;

  let r = evaluateAutoPause({
    gpsKmh: 1,
    bleKmh: null,
    manualPaused: false,
    now: t0,
    prior
  });
  if (r.isAutoPaused || r.lowSpeedSince !== t0 || r.changedTo !== null) {
    throw new Error('should start low-speed timer without pausing yet');
  }

  r = evaluateAutoPause({
    gpsKmh: 1,
    bleKmh: 0,
    manualPaused: false,
    now: t0 + AUTO_PAUSE_HOLD_MS,
    prior: { lowSpeedSince: t0, isAutoPaused: false }
  });
  if (!r.isAutoPaused || r.changedTo !== true) {
    throw new Error('should auto-pause after hold');
  }

  r = evaluateAutoPause({
    gpsKmh: 0,
    bleKmh: 12,
    manualPaused: false,
    now: t0 + AUTO_PAUSE_HOLD_MS + 100,
    prior: { lowSpeedSince: null, isAutoPaused: true }
  });
  if (r.isAutoPaused || r.changedTo !== false) {
    throw new Error('BLE speed should clear auto-pause');
  }

  r = evaluateAutoPause({
    gpsKmh: 0,
    bleKmh: 0,
    manualPaused: true,
    now: t0 + 10_000,
    prior: { lowSpeedSince: t0, isAutoPaused: true }
  });
  if (r.isAutoPaused || r.changedTo !== false) {
    throw new Error('manual pause should clear auto-pause flag');
  }

  r = evaluateAutoPause({
    gpsKmh: 20,
    bleKmh: null,
    manualPaused: true,
    now: t0 + 11_000,
    prior: { lowSpeedSince: null, isAutoPaused: false }
  });
  if (r.changedTo !== null || r.isAutoPaused) {
    throw new Error('manual pause + movement should not emit auto-pause changes');
  }

  console.log('autoPause.test.ts: OK');
}

runAutoPauseValidation();
