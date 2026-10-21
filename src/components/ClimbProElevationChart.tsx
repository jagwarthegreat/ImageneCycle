import React, { useMemo } from 'react';
import { ClimbSegment } from '../types/cycling';
import { getGradeColor } from '../utils/climbProEngine';

interface ClimbProElevationChartProps {
  climb: ClimbSegment | null;
  currentDist: number; // current distance along whole route in meters
  currentGrade: number; // current instant grade %
  avgGradeRemaining: number; // calculated remaining average grade %
  isDarkMode?: boolean;
}

export const ClimbProElevationChart: React.FC<ClimbProElevationChartProps> = ({
  climb,
  currentDist,
  currentGrade,
  avgGradeRemaining,
  isDarkMode = false
}) => {
  // If no climb active, render placeholder or gentle preview
  if (!climb || climb.points.length < 2) {
    return (
      <div className={`w-full h-full flex flex-col justify-between p-2 select-none ${isDarkMode ? 'bg-zinc-900 text-zinc-400' : 'bg-white text-zinc-500'}`}>
        <div className="flex items-center justify-between text-xs font-sports uppercase tracking-wider font-semibold">
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

  // Calculate relative rider position within the climb: 0 to 1
  const climbStart = climb.startDist;
  const climbEnd = climb.endDist;
  const climbLength = Math.max(1, climbEnd - climbStart);
  const relativeDist = Math.max(0, Math.min(climbLength, currentDist - climbStart));
  const progressRatio = relativeDist / climbLength; // 0.0 to 1.0

  // Min and Max elevation for scaling
  const minEle = Math.min(...climb.points.map(p => p.ele));
  const maxEle = Math.max(...climb.points.map(p => p.ele));
  const eleSpan = Math.max(10, maxEle - minEle);

  // SVG dimensions for vector rendering
  const width = 360;
  const height = 90;
  const chartBottom = height - 12;
  const chartTop = 18;
  const chartHeight = chartBottom - chartTop;

  // Build segmented polygon blocks for color gradient steps
  const segments = useMemo(() => {
    const pts = climb.points;
    if (pts.length < 2) return [];

    const blocks: {
      x1: number;
      x2: number;
      y1: number;
      y2: number;
      color: string;
      grade: number;
    }[] = [];

    // Group into small steps for smooth gradient transitions
    const stepSize = Math.max(1, Math.floor(pts.length / 28));

    for (let i = 0; i < pts.length - 1; i += stepSize) {
      const p1 = pts[i];
      const p2 = pts[Math.min(pts.length - 1, i + stepSize)];

      const x1 = ((p1.distFromStart - climbStart) / climbLength) * width;
      const x2 = ((p2.distFromStart - climbStart) / climbLength) * width;

      const y1 = chartBottom - ((p1.ele - minEle) / eleSpan) * chartHeight;
      const y2 = chartBottom - ((p2.ele - minEle) / eleSpan) * chartHeight;

      const dDist = Math.max(1, p2.distFromStart - p1.distFromStart);
      const grade = ((p2.ele - p1.ele) / dDist) * 100;
      const color = getGradeColor(grade);

      blocks.push({
        x1: Math.max(0, x1),
        x2: Math.min(width, x2),
        y1,
        y2,
        color,
        grade
      });
    }

    return blocks;
  }, [climb, climbStart, climbLength, minEle, eleSpan, width, height, chartBottom, chartHeight]);

  // Calculate current rider position X and Y on the profile
  const riderX = progressRatio * width;
  // Interpolate rider Y elevation on chart
  let riderY = chartBottom;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (riderX >= s.x1 && riderX <= s.x2) {
      const t = (riderX - s.x1) / Math.max(0.1, s.x2 - s.x1);
      riderY = s.y1 + (s.y2 - s.y1) * t;
      break;
    }
  }

  // Constrain pin pill tooltip so it doesn't clip on edges
  const pillX = Math.min(Math.max(riderX, 28), width - 28);

  return (
    <div className={`w-full select-none flex flex-col justify-between ${isDarkMode ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-900'}`}>
      {/* SVG Climb Profile Visualization */}
      <div className="relative w-full h-[92px] overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          {/* Subtle horizontal grid lines */}
          <line x1="0" y1={chartTop} x2={width} y2={chartTop} stroke={isDarkMode ? '#3f3f46' : '#e2e8f0'} strokeWidth="1" strokeDasharray="3 3" />
          <line x1="0" y1={(chartTop + chartBottom) / 2} x2={width} y2={(chartTop + chartBottom) / 2} stroke={isDarkMode ? '#3f3f46' : '#e2e8f0'} strokeWidth="1" strokeDasharray="3 3" />
          <line x1="0" y1={chartBottom} x2={width} y2={chartBottom} stroke={isDarkMode ? '#52525b' : '#cbd5e1'} strokeWidth="1.5" />

          {/* Color-segmented bars under the elevation profile */}
          {segments.map((seg, idx) => {
            const polygonPoints = `${seg.x1},${chartBottom} ${seg.x1},${seg.y1} ${seg.x2},${seg.y2} ${seg.x2},${chartBottom}`;
            return (
              <polygon
                key={idx}
                points={polygonPoints}
                fill={seg.color}
                stroke={seg.color}
                strokeWidth="0.5"
                className="transition-colors duration-200"
              />
            );
          })}

          {/* Past elevation shading (dimmed or overlay) */}
          {riderX > 0 && (
            <rect
              x="0"
              y="0"
              width={riderX}
              height={chartBottom}
              fill={isDarkMode ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.45)'}
            />
          )}

          {/* Vertical Rider Pin Line */}
          <line
            x1={riderX}
            y1={chartTop - 4}
            x2={riderX}
            y2={chartBottom}
            stroke="#2563eb"
            strokeWidth="2"
          />

          {/* Rider Position Circle on the profile line */}
          <circle
            cx={riderX}
            cy={riderY}
            r="3.5"
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth="2"
          />
        </svg>

        {/* Current Grade Badge / Tooltip floating directly above rider pin - exactly as in Magene C706 screenshot */}
        <div
          className="absolute pointer-events-none transform -translate-x-1/2 flex flex-col items-center"
          style={{
            left: `${(riderX / width) * 100}%`,
            top: '2px'
          }}
        >
          <div className="bg-blue-500 text-white font-digital font-bold text-[12px] px-2 py-0.5 rounded shadow-sm flex items-center justify-center leading-none">
            {currentGrade >= 0 ? `${currentGrade.toFixed(1)}%` : `${currentGrade.toFixed(1)}%`}
          </div>
          <div className="w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-blue-500"></div>
        </div>
      </div>

      {/* Climb Progress Bar with ▶ marker along the baseline (exact Magene layout) */}
      <div className="relative w-full h-3 bg-blue-100 flex items-center border-t border-b border-blue-200">
        {/* Filled blue completed progress bar */}
        <div
          className="h-full bg-blue-500 transition-all duration-150"
          style={{ width: `${progressRatio * 100}%` }}
        />
        {/* Little Rider / Chevron Marker */}
        <div
          className="absolute transform -translate-x-1/2 text-blue-600 text-[10px] leading-none"
          style={{ left: `${progressRatio * 100}%` }}
        >
          <span className="font-bold">▶</span>
        </div>
      </div>

      {/* Bottom Bar: AVG GRADE REMAIN. (Magene C706 Screenshot clone) */}
      <div className={`flex items-center justify-between px-3 py-1 font-sports border-b ${isDarkMode ? 'border-zinc-800 bg-zinc-950 text-zinc-300' : 'border-zinc-200 bg-white text-zinc-500'}`}>
        <span className="text-[11px] font-bold tracking-wider uppercase text-zinc-400">
          AVG GRADE REMAIN.
        </span>
        <span className={`text-[15px] font-digital font-bold ${isDarkMode ? 'text-white' : 'text-zinc-950'}`}>
          {avgGradeRemaining > 0 ? `${avgGradeRemaining.toFixed(1)}%` : '0.0%'}
        </span>
      </div>
    </div>
  );
};
