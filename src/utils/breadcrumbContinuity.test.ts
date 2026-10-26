/** Self-check — run: npx tsx src/utils/breadcrumbContinuity.test.ts */
import {
  shouldAppendWeakBreadcrumb,
  shouldStitchBreadcrumb,
  splitBreadcrumbsForMap
} from './breadcrumbContinuity';
import type { BreadcrumbPoint } from '../types/cycling';

export function runBreadcrumbContinuityValidation(): void {
  const a: BreadcrumbPoint = { lat: 14.6, lng: 121.0, time: 1_000_000, quality: 'good' };
  if (!shouldAppendWeakBreadcrumb(null, { lat: 14.6, lng: 121.0, time: 1_000_100 })) {
    throw new Error('first weak should append');
  }
  if (shouldAppendWeakBreadcrumb(a, { lat: 14.6, lng: 121.0, time: 1_001_000 })) {
    throw new Error('same spot within 5s should not append');
  }
  if (!shouldAppendWeakBreadcrumb(a, { lat: 14.6, lng: 121.0, time: 1_006_000 })) {
    throw new Error('5s later should append');
  }

  if (shouldStitchBreadcrumb(a, { lat: 14.6, lng: 121.0, time: 1_010_000 })) {
    throw new Error('short gap should not stitch');
  }
  if (!shouldStitchBreadcrumb(a, { lat: 14.6, lng: 121.0, time: 1_050_000 })) {
    throw new Error('45s+ gap should stitch');
  }

  const split = splitBreadcrumbsForMap([
    { lat: 1, lng: 1, quality: 'good' },
    { lat: 2, lng: 2, quality: 'weak' },
    { lat: 3, lng: 3, quality: 'stitch' }
  ]);
  // good = non-weak only in helper (stitch counted as gap marker there)
  if (split.good.length !== 1) throw new Error(`expected 1 good, got ${split.good.length}`);
  if (split.weak.length < 2) throw new Error('weak path should include continuity');

  console.log('breadcrumbContinuity.test.ts: OK');
}

runBreadcrumbContinuityValidation();
