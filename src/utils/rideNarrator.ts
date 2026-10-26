import { ClimbCategory } from '../types/cycling';
import { NextTurnCue } from './routeEncode';

export const CLIMB_VOICE_THRESHOLDS_M = [1000, 500, 0] as const;
export const TURN_VOICE_THRESHOLDS_M = [200, 50] as const;

/** Thresholds newly crossed when dist decreases (prev > t && current <= t). */
export function thresholdsCrossed(
  prevDist: number | null,
  dist: number,
  thresholds: readonly number[]
): number[] {
  const out: number[] = [];
  for (const t of thresholds) {
    if ((prevDist === null || prevDist > t) && dist <= t) out.push(t);
  }
  return out;
}

export function formatClimbVoice(category: ClimbCategory | string, meters: number): string {
  const cat =
    category === 'HC' ? 'Hors catégorie' : category === 'Uncategorized' ? '' : `Category ${category}`;
  const catPrefix = cat ? `${cat} climb` : 'Climb';
  if (meters <= 0) return `${catPrefix} starting`;
  if (meters >= 1000) {
    const km = Math.round(meters / 100) / 10;
    return `${catPrefix} in ${km === 1 ? '1 kilometer' : `${km} kilometers`}`;
  }
  return `${catPrefix} in ${Math.round(meters)} meters`;
}

export function formatTurnVoice(cue: NextTurnCue): string {
  const instr = (cue.turn.instruction || 'Continue').replace(/\.$/, '');
  const m = cue.metersToManeuver;
  if (m <= 0) return instr;
  if (m >= 1000) {
    const km = Math.round(m / 100) / 10;
    return `${instr} in ${km === 1 ? '1 kilometer' : `${km} kilometers`}`;
  }
  return `${instr} in ${Math.round(m)} meters`;
}

class RideNarrator {
  public enabled = true;
  private spoken = new Set<string>();
  private prevClimbDist: number | null = null;
  private prevTurnDist: number | null = null;
  private prevClimbKey: string | null = null;
  private prevTurnKey: string | null = null;

  reset() {
    this.spoken.clear();
    this.prevClimbDist = null;
    this.prevTurnDist = null;
    this.prevClimbKey = null;
    this.prevTurnKey = null;
  }

  speakOnce(key: string, text: string) {
    if (!this.enabled || !text) return;
    if (this.spoken.has(key)) return;
    this.spoken.add(key);
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.volume = 1;
      window.speechSynthesis.speak(u);
    } catch {
      /* WebView TTS unavailable */
    }
  }

  /** Call each fix while navigating a planned route with climbs. */
  tickClimb(opts: {
    climbKey: string;
    category: ClimbCategory | string;
    distToNextClimb: number;
    isInClimb?: boolean;
  }) {
    if (!this.enabled) return;
    const { climbKey, category, distToNextClimb, isInClimb } = opts;
    if (climbKey !== this.prevClimbKey) {
      this.prevClimbKey = climbKey;
      this.prevClimbDist = null;
    }
    const dist = isInClimb ? 0 : Math.max(0, distToNextClimb);
    const crossed = thresholdsCrossed(this.prevClimbDist, dist, CLIMB_VOICE_THRESHOLDS_M);
    this.prevClimbDist = dist;
    for (const t of crossed) {
      this.speakOnce(`climb:${climbKey}:${t}`, formatClimbVoice(category, t));
    }
  }

  /** Call each fix while navigating with TBT turns. */
  tickTurn(cue: NextTurnCue | null) {
    if (!this.enabled || !cue) return;
    const turnKey = `${cue.turn.distFromRouteStart}:${cue.turn.maneuverType}:${cue.turn.modifier || ''}`;
    if (turnKey !== this.prevTurnKey) {
      this.prevTurnKey = turnKey;
      this.prevTurnDist = null;
    }
    const dist = Math.max(0, cue.metersToManeuver);
    const crossed = thresholdsCrossed(this.prevTurnDist, dist, TURN_VOICE_THRESHOLDS_M);
    this.prevTurnDist = dist;
    for (const t of crossed) {
      this.speakOnce(`turn:${turnKey}:${t}`, formatTurnVoice({ ...cue, metersToManeuver: t }));
    }
  }
}

export const rideNarrator = new RideNarrator();
