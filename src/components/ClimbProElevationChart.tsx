import React, { useMemo, useRef, useState, useCallback } from 'react';
import { ClimbSegment, RoutePoint } from '../types/cycling';
import { generateProfileSlices, getGradeColor } from '../utils/climbProEngine';
import { elevationAtDistance, smoothedGradeAtDistance } from '../utils/smoothedGrade';

interface ClimbProElevationChartProps {
  climb: ClimbSegment | null;
  /** Full course points — used as elevation preview when no climb is active */
  routePoints?: RoutePoint[];
  currentDist: number; // current distance along whole route in meters
  currentGrade: number; // current instant grade %
  avgGradeRemaining: number; // calculated remaining average grade %
  isDarkMode?: boolean;
}

const WIDTH = 360;
const HEIGHT = 96;
const PAD_X = 4; // SVG-internal; outer px-* provides device margins
const CHART_TOP = 20;
const CHART_BOTTOM = HEIGHT - 6;
const CHART_HEIGHT = CHART_BOTTOM - CHART_TOP;
const PLOT_WIDTH = WIDTH - PAD_X * 2;

function distToX(distRatio: number): number {
  return PAD_X + Math.max(0, Math.min(1, distRatio)) * PLOT_WIDTH;
}

export const ClimbProElevationChart: React.FC<ClimbProElevationChartProps> = ({
  climb,
  routePoints = [],
  currentDist,
  currentGrade,
  avgGradeRemaining,
  isDarkMode = false
}) => {
  const useRouteProfile = (!climb || climb.points.length < 2) && routePoints.length > 1;
  const profilePoints = useRouteProfile ? routePoints : climb?.points || [];
  const isRouteMode = useRouteProfile;

  const chartBoxRef = useRef<HTMLDivElement>(null);
  const [scrubAbsDist, setScrubAbsDist] = useState<number | null>(null);
  const draggingRef = useRef(false);

  const climbStart =
    profilePoints.length >= 2
      ? isRouteMode
        ? profilePoints[0].distFromStart
        : (climb as ClimbSegment).startDist
      : 0;
  const climbEnd =
    profilePoints.length >= 2
      ? isRouteMode
        ? profilePoints[profilePoints.length - 1].distFromStart
        : (climb as ClimbSegment).endDist
      : 0;
  const climbLength = Math.max(1, climbEnd - climbStart);

  const pointerToAbsDist = useCallback(
    (clientX: number) => {
      const el = chartBoxRef.current;
      if (!el) return climbStart;
      const rect = el.getBoundingClientRect();
      const xRatio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
      return climbStart + xRatio * climbLength;
    },
    [climbStart, climbLength]
  );

  const slices = useMemo(() => {
    if (profilePoints.length < 2) return [];
    if (climb?.profileSlices?.length && !isRouteMode) return climb.profileSlices;
    return generateProfileSlices(profilePoints);
  }, [climb, isRouteMode, profilePoints]);

  const minEle = profilePoints.length ? Math.min(...profilePoints.map(p => p.ele)) : 0;
  const maxEle = profilePoints.length ? Math.max(...profilePoints.map(p => p.ele)) : 0;
  const eleSpan = Math.max(10, maxEle - minEle);

  const segments = useMemo(() => {
    if (profilePoints.length < 2) return [];
    if (slices.length > 0) {
      return slices.map(sl => {
        const x1 = distToX((sl.distStart - climbStart) / climbLength);
        const x2 = distToX((sl.distEnd - climbStart) / climbLength);
        const y1 = CHART_BOTTOM - ((sl.eleStart - minEle) / eleSpan) * CHART_HEIGHT;
        const y2 = CHART_BOTTOM - ((sl.eleEnd - minEle) / eleSpan) * CHART_HEIGHT;
        return {
          x1,
          x2: Math.max(x1 + 0.5, x2),
          y1,
          y2,
          color: sl.color || getGradeColor(sl.grade),
          grade: sl.grade
        };
      });
    }

    const pts = profilePoints;
    const blocks: { x1: number; x2: number; y1: number; y2: number; color: string; grade: number }[] = [];
    const stepSize = Math.max(1, Math.floor(pts.length / 40));
    for (let i = 0; i < pts.length - 1; i += stepSize) {
      const p1 = pts[i];
      const p2 = pts[Math.min(pts.length - 1, i + stepSize)];
      const x1 = distToX((p1.distFromStart - climbStart) / climbLength);
      const x2 = distToX((p2.distFromStart - climbStart) / climbLength);
      const y1 = CHART_BOTTOM - ((p1.ele - minEle) / eleSpan) * CHART_HEIGHT;
      const y2 = CHART_BOTTOM - ((p2.ele - minEle) / eleSpan) * CHART_HEIGHT;
      const dDist = Math.max(1, p2.distFromStart - p1.distFromStart);
      const grade = ((p2.ele - p1.ele) / dDist) * 100;
      blocks.push({ x1, x2, y1, y2, color: getGradeColor(grade), grade });
    }
    return blocks;
  }, [slices, profilePoints, climbStart, climbLength, minEle, eleSpan]);

  if (profilePoints.length < 2) {
    return (
      <div className={`w-full flex flex-col justify-between px-3 py-2 select-none ${isDarkMode ? 'bg-zinc-950 text-zinc-400' : 'bg-white text-zinc-500'}`}>
        <div className="flex items-center justify-between text-[10px] font-sports uppercase tracking-wider font-semibold">
          <span>Climb Profile</span>
          <span>No Active Climb</span>
        </div>
        <div className="h-16 flex items-center justify-center text-xs opacity-60">
          Flat Terrain / Approaching Route Climb
        </div>
        <div className="flex items-center justify-between text-xs border-t border-zinc-200/50 pt-1 font-sports">
          <span>AVG GRADE REMAIN.</span>
          <span className="font-bold text-sm">0.0%</span>
        </div>
      </div>
    );
  }

  const relativeDist = Math.max(0, Math.min(climbLength, currentDist - climbStart));
  const progressRatio = relativeDist / climbLength;

  const riderX = distToX(progressRatio);
  const gridYs = [0, 0.25, 0.5, 0.75, 1].map(t => CHART_TOP + t * CHART_HEIGHT);
  const scrubberLeftPct = Math.max(
    2,
    Math.min(98, ((PAD_X + progressRatio * PLOT_WIDTH) / WIDTH) * 100)
  );

  const profileGradeAtRider = (() => {
    if (segments.length === 0) return null;
    const hit = segments.find(seg => riderX >= seg.x1 && riderX <= seg.x2);
    if (hit) return hit.grade;
    let best = segments[0];
    let bestDist = Math.abs(riderX - (best.x1 + best.x2) / 2);
    for (const seg of segments) {
      const mid = (seg.x1 + seg.x2) / 2;
      const d = Math.abs(riderX - mid);
      if (d < bestDist) {
        best = seg;
        bestDist = d;
      }
    }
    return best.grade;
  })();
  const pillGrade = profileGradeAtRider !== null ? profileGradeAtRider : currentGrade;

  const isScrubbing = scrubAbsDist !== null;
  const scrubRatio = isScrubbing
    ? Math.max(0, Math.min(1, (scrubAbsDist! - climbStart) / climbLength))
    : 0;
  const scrubLeftPct = Math.max(2, Math.min(98, ((PAD_X + scrubRatio * PLOT_WIDTH) / WIDTH) * 100));
  const scrubGrade = isScrubbing ? smoothedGradeAtDistance(profilePoints, scrubAbsDist!) : 0;
  const scrubEle = isScrubbing ? elevationAtDistance(profilePoints, scrubAbsDist!) : 0;
  const scrubDistKm = isScrubbing ? scrubAbsDist! / 1000 : 0;

  return (
    <div className={`w-full select-none flex flex-col ${isDarkMode ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-900'}`}>
      {isRouteMode && (
        <div className="flex items-center justify-between px-3 pt-1 text-[10px] font-sports uppercase tracking-wider font-semibold text-zinc-400">
          <span>Route Profile</span>
          <span>{(climbLength / 1000).toFixed(1)} km course</span>
        </div>
      )}

      <div className="px-3 pt-1">
        <div
          ref={chartBoxRef}
          className="relative w-full touch-none cursor-crosshair"
          onPointerDown={e => {
            draggingRef.current = true;
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            setScrubAbsDist(pointerToAbsDist(e.clientX));
          }}
          onPointerMove={e => {
            if (e.pointerType === 'mouse' || draggingRef.current || e.buttons > 0) {
              setScrubAbsDist(pointerToAbsDist(e.clientX));
            }
          }}
          onPointerUp={() => {
            draggingRef.current = false;
            setScrubAbsDist(null);
          }}
          onPointerCancel={() => {
            draggingRef.current = false;
            setScrubAbsDist(null);
          }}
          onPointerLeave={() => {
            if (!draggingRef.current) setScrubAbsDist(null);
          }}
        >
          <div className="w-full h-[96px]">
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              preserveAspectRatio="none"
              className="w-full h-full block pointer-events-none"
            >
              {gridYs.map((y, i) => (
                <line
                  key={i}
                  x1={PAD_X}
                  y1={y}
                  x2={WIDTH - PAD_X}
                  y2={y}
                  stroke={isDarkMode ? '#3f3f46' : '#d4d4d8'}
                  strokeWidth="1"
                  strokeDasharray="4 3"
                />
              ))}

              {segments.map((seg, idx) => (
                <polygon
                  key={idx}
                  points={`${seg.x1},${CHART_BOTTOM} ${seg.x1},${seg.y1} ${seg.x2},${seg.y2} ${seg.x2},${CHART_BOTTOM}`}
                  fill={seg.color}
                  stroke={seg.color}
                  strokeWidth="0.4"
                />
              ))}

              {progressRatio > 0 && (
                <rect
                  x={PAD_X}
                  y={CHART_TOP}
                  width={Math.max(0, riderX - PAD_X)}
                  height={CHART_HEIGHT}
                  fill={isDarkMode ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)'}
                />
              )}

              {isScrubbing && (
                <line
                  x1={distToX(scrubRatio)}
                  y1={CHART_TOP}
                  x2={distToX(scrubRatio)}
                  y2={CHART_BOTTOM}
                  stroke={isDarkMode ? '#fafafa' : '#18181b'}
                  strokeWidth="1.5"
                />
              )}
            </svg>
          </div>

          <div className="relative w-full h-3.5 bg-blue-100 pointer-events-none">
            <div
              className="absolute inset-y-0 left-0 bg-blue-500 transition-all duration-150"
              style={{ width: `${scrubberLeftPct}%` }}
            />
          </div>

          {!isScrubbing && (
            <div
              className="absolute top-0 bottom-0 z-10 pointer-events-none -translate-x-1/2 flex flex-col items-center"
              style={{ left: `${scrubberLeftPct}%` }}
            >
              <div className="bg-blue-500 text-white font-digital font-bold text-[13px] px-2.5 py-0.5 rounded shadow-md leading-none whitespace-nowrap shrink-0 mt-0.5">
                {pillGrade.toFixed(1)}%
              </div>
              <div className="w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-blue-500 shrink-0" />
              <div className="w-0.5 flex-1 min-h-0 bg-blue-500" />
              <div className="w-4 h-4 rounded-sm bg-blue-600 flex items-center justify-center shadow-sm shrink-0 -mt-px mb-0">
                <span className="text-white text-[9px] font-bold leading-none translate-x-px">▶</span>
              </div>
            </div>
          )}

          {isScrubbing && (
            <div
              className="absolute top-1 z-20 pointer-events-none -translate-x-1/2"
              style={{ left: `${scrubLeftPct}%` }}
            >
              <div
                className={`text-[11px] font-digital font-bold px-2 py-1 rounded shadow-md whitespace-nowrap leading-tight ${
                  isDarkMode ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-900 text-white'
                }`}
              >
                <div>{scrubDistKm.toFixed(1)} km</div>
                <div>{Math.round(scrubEle)} m</div>
                <div>{scrubGrade.toFixed(1)}%</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={`flex items-center justify-between px-3 py-1.5 font-sports border-b ${isDarkMode ? 'border-zinc-800 bg-zinc-950 text-zinc-300' : 'border-zinc-200 bg-white text-zinc-500'}`}>
        <span className="text-[11px] font-bold tracking-wider uppercase text-zinc-400">
          AVG GRADE REMAIN.
        </span>
        <span className={`text-[16px] font-digital font-bold ${isDarkMode ? 'text-white' : 'text-zinc-950'}`}>
          {avgGradeRemaining > 0 ? `${avgGradeRemaining.toFixed(1)}%` : '0.0%'}
        </span>
      </div>
    </div>
  );
};
