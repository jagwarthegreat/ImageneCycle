/** Self-check — run: npx tsx src/utils/rideNarrator.test.ts */
import {
  thresholdsCrossed,
  formatClimbVoice,
  formatTurnVoice,
  CLIMB_VOICE_THRESHOLDS_M,
  TURN_VOICE_THRESHOLDS_M
} from './rideNarrator';
import type { RouteTurn } from '../types/cycling';

export function runRideNarratorValidation(): void {
  const crossed = thresholdsCrossed(1200, 900, CLIMB_VOICE_THRESHOLDS_M);
  if (!crossed.includes(1000) || crossed.includes(500)) {
    throw new Error(`Expected only 1000 crossed, got ${crossed}`);
  }

  const multi = thresholdsCrossed(600, 0, CLIMB_VOICE_THRESHOLDS_M);
  if (!multi.includes(500) || !multi.includes(0)) {
    throw new Error(`Expected 500 and 0, got ${multi}`);
  }

  const turnCross = thresholdsCrossed(250, 180, TURN_VOICE_THRESHOLDS_M);
  if (!turnCross.includes(200) || turnCross.includes(50)) {
    throw new Error(`Expected only 200, got ${turnCross}`);
  }

  const phrase = formatClimbVoice('2', 1000);
  if (!phrase.includes('Category 2') || !phrase.includes('kilometer')) {
    throw new Error(`Bad climb phrase: ${phrase}`);
  }

  const turn: RouteTurn = {
    index: 0,
    instruction: 'Turn left',
    distanceMeters: 100,
    name: '',
    maneuverType: 'turn',
    modifier: 'left',
    location: { lat: 0, lng: 0 },
    distFromRouteStart: 500
  };
  const turnPhrase = formatTurnVoice({ turn, metersToManeuver: 200 });
  if (!turnPhrase.includes('Turn left') || !turnPhrase.includes('200')) {
    throw new Error(`Bad turn phrase: ${turnPhrase}`);
  }

  console.log('rideNarrator.test.ts: OK');
}

runRideNarratorValidation();
