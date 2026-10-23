/**
 * Freeride ClimbPro: detect climbs live with no pre-loaded route.
 * Same gates as Route ClimbPro: length >= 400m, avg grade >= 2.5%.
 */
import { RoutePoint, ClimbSegment, ClimbProLiveState } from '../types/cycling';
import {
  generateProfileSlices,
  getClimbCategory,
  CLIMB_MIN_LENGTH_M,
  CLIMB_MIN_AVG_GRADE,
  CLIMB_START_GRADE,
} from './climbProEngine';

export class FreeRideClimbRecorder {
  private samples: RoutePoint[] = [];
  private finalized: ClimbSegment[] = [];
  private climbStartIndex = -1;
  private draft: ClimbSegment | null = null;

  reset() {
    this.samples = [];
    this.finalized = [];
    this.climbStartIndex = -1;
    this.draft = null;
  }

  getFinalizedClimbs(): ClimbSegment[] {
    return this.finalized;
  }

  getDraft(): ClimbSegment | null {
    return this.draft;
  }

  /** Live free-ride track for ClimbPro route-profile preview (no planned course). */
  getSamples(): RoutePoint[] {
    return this.samples;
  }

  /**
   * Push a sample while recording. distMeters = cumulative ride distance.
   */
  pushSample(lat: number, lng: number, ele: number, distMeters: number, grade: number) {
    const point: RoutePoint = {
      lat,
      lng,
      ele,
      distFromStart: Math.round(distMeters),
      grade: Math.round(grade * 10) / 10
    };
    this.samples.push(point);
    this.updateClimbState();
  }

  private updateClimbState() {
    const i = this.samples.length - 1;
    if (i < 1) return;

    const prev = this.samples[i - 1];
    const curr = this.samples[i];
    const dEle = curr.ele - prev.ele;
    const dDist = curr.distFromStart - prev.distFromStart;
    const instantaneousGrade = dDist > 0 ? (dEle / dDist) * 100 : curr.grade;

    if (this.climbStartIndex === -1 && instantaneousGrade >= CLIMB_START_GRADE) {
      this.climbStartIndex = i - 1;
      this.rebuildDraft(false);
      return;
    }

    if (this.climbStartIndex === -1) return;

    const isDescent = instantaneousGrade < -2.0 && i > this.climbStartIndex + 5;
    if (isDescent) {
      this.finalizeIfValid(i - 1);
      this.climbStartIndex = -1;
      this.draft = null;
      return;
    }

    this.rebuildDraft(false);
  }

  private rebuildDraft(asFinal: boolean) {
    if (this.climbStartIndex < 0 || this.samples.length <= this.climbStartIndex) {
      this.draft = null;
      return;
    }
    const endIdx = asFinal ? this.samples.length - 1 : this.samples.length - 1;
    const startPt = this.samples[this.climbStartIndex];
    const endPt = this.samples[endIdx];
    const length = endPt.distFromStart - startPt.distFromStart;
    const totalGain = Math.max(0, endPt.ele - startPt.ele);
    const avgGrade = length > 0 ? (totalGain / length) * 100 : 0;
    const climbPoints = this.samples.slice(this.climbStartIndex, endIdx + 1);
    const maxGrade = Math.max(0, ...climbPoints.map(p => p.grade || 0));
    const climbScore = length * avgGrade;

    this.draft = {
      id: `free-climb-draft`,
      name: `Climb ${this.finalized.length + 1}`,
      startDist: startPt.distFromStart,
      endDist: endPt.distFromStart,
      totalLength: Math.max(1, length),
      startEle: startPt.ele,
      topEle: endPt.ele,
      totalElevationGain: Math.round(totalGain),
      avgGrade: Math.round(avgGrade * 10) / 10,
      maxGrade: Math.round(maxGrade * 10) / 10,
      category: getClimbCategory(climbScore),
      points: climbPoints,
      profileSlices: generateProfileSlices(climbPoints)
    };
  }

  private finalizeIfValid(endIndex: number) {
    if (this.climbStartIndex < 0) return;
    const startPt = this.samples[this.climbStartIndex];
    const endPt = this.samples[endIndex];
    const length = endPt.distFromStart - startPt.distFromStart;
    const totalGain = Math.max(0, endPt.ele - startPt.ele);
    const avgGrade = length > 0 ? (totalGain / length) * 100 : 0;

    if (length >= CLIMB_MIN_LENGTH_M && avgGrade >= CLIMB_MIN_AVG_GRADE) {
      const climbPoints = this.samples.slice(this.climbStartIndex, endIndex + 1);
      const maxGrade = Math.max(0, ...climbPoints.map(p => p.grade || 0));
      const climbScore = length * avgGrade;
      this.finalized.push({
        id: `free-climb-${this.finalized.length + 1}`,
        name: `Climb ${this.finalized.length + 1}`,
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
  }

  toClimbProState(currentElevation: number, currentGrade: number): ClimbProLiveState {
    const draft = this.draft;
    if (draft) {
      // Free-ride: no planned summit — rem ascent / dist remain stay 0
      const softCap = Math.max(100, draft.totalElevationGain);
      const climbProgressPct = Math.min(100, (draft.totalElevationGain / softCap) * 100);
      return {
        isInClimb: true,
        currentClimbIndex: this.finalized.length + 1,
        totalClimbsCount: this.finalized.length + 1,
        currentClimb: draft,
        nextClimb: null,
        distToNextClimb: 0,
        distRemainingToTop: 0,
        remAscent: 0,
        avgGradeRemaining: draft.avgGrade,
        currentGrade,
        climbProgressPct,
        vam: 0
      };
    }

    return {
      isInClimb: false,
      currentClimbIndex: 0,
      totalClimbsCount: this.finalized.length,
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
}

export const freeRideClimbRecorder = new FreeRideClimbRecorder();
