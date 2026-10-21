import React, { useState } from 'react';
import { ClimbSegment, RoutePoint } from '../types/cycling';
import { generateProfileSlices, getClimbCategory } from '../utils/climbProEngine';
import { Mountain, X, PlusCircle, Check, Sparkles } from 'lucide-react';

interface ClimbManualInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddOrUpdateClimb: (climb: ClimbSegment) => void;
  currentDist: number;
  currentElevation: number;
}

export const ClimbManualInputModal: React.FC<ClimbManualInputModalProps> = ({
  isOpen,
  onClose,
  onAddOrUpdateClimb,
  currentDist,
  currentElevation
}) => {
  const [climbName, setClimbName] = useState('Custom Alpine Climb');
  const [lengthKm, setLengthKm] = useState('2.4');
  const [gainMeters, setGainMeters] = useState('180');
  const [rampProfile, setRampProfile] = useState<'uniform' | 'steep-top' | 'steps'>('steep-top');
  const [startOffsetMeters, setStartOffsetMeters] = useState('100'); // start 100m ahead of current position

  if (!isOpen) return null;

  const lengthM = Math.max(200, parseFloat(lengthKm || '1') * 1000);
  const gainM = Math.max(10, parseFloat(gainMeters || '50'));
  const avgGrade = Math.round(((gainM / lengthM) * 100) * 10) / 10;
  const score = lengthM * avgGrade;
  const category = getClimbCategory(score);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const startDist = currentDist + Math.max(0, parseFloat(startOffsetMeters || '0'));
    const endDist = startDist + lengthM;
    const startEle = currentElevation;
    const topEle = startEle + gainM;

    // Generate synthetic points along this manual climb
    const steps = 60;
    const points: RoutePoint[] = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ptDist = startDist + t * lengthM;
      let eleFraction = t;

      if (rampProfile === 'steep-top') {
        // Accelerating steepness towards summit
        eleFraction = Math.pow(t, 1.8);
      } else if (rampProfile === 'steps') {
        // Stepped terrace climb
        eleFraction = t + 0.08 * Math.sin(t * 3 * Math.PI);
      }

      const ele = startEle + gainM * Math.max(0, Math.min(1, eleFraction));

      // Instantaneous gradient
      let grade = avgGrade;
      if (i > 0) {
        const prev = points[points.length - 1];
        const dD = ptDist - prev.distFromStart;
        const dE = ele - prev.ele;
        grade = dD > 0 ? (dE / dD) * 100 : avgGrade;
      }

      points.push({
        lat: 42.13 + (t * 0.015),
        lng: 12.39 + (t * 0.015),
        ele: Math.round(ele * 10) / 10,
        distFromStart: Math.round(ptDist),
        grade: Math.round(grade * 10) / 10,
        heading: 45
      });
    }

    const maxGrade = Math.max(...points.map(p => p.grade));

    const newClimb: ClimbSegment = {
      id: `manual-climb-${Date.now()}`,
      name: climbName.trim() || 'Custom Climb',
      startDist,
      endDist,
      totalLength: lengthM,
      startEle,
      topEle,
      totalElevationGain: gainM,
      avgGrade,
      maxGrade: Math.round(maxGrade * 10) / 10,
      category,
      points,
      profileSlices: generateProfileSlices(points)
    };

    onAddOrUpdateClimb(newClimb);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 bg-zinc-800/80 border-b border-zinc-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
              <Mountain className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-sports tracking-wide">
                MANUAL CLIMB BUILDER
              </h2>
              <p className="text-xs text-zinc-400">Configure or override upcoming climb details</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Climb Name */}
          <div>
            <label className="block text-zinc-300 font-semibold mb-1">Climb Name / Sector</label>
            <input
              type="text"
              value={climbName}
              onChange={e => setClimbName(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white font-medium focus:outline-hidden focus:border-blue-500"
              placeholder="e.g. Passo San Boldo, Arsicana Hill Ramp"
              required
            />
          </div>

          {/* Length & Elevation Gain */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-300 font-semibold mb-1">Climb Distance (km)</label>
              <input
                type="number"
                step="0.1"
                min="0.3"
                max="40"
                value={lengthKm}
                onChange={e => setLengthKm(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white font-digital text-base font-bold focus:outline-hidden focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-zinc-300 font-semibold mb-1">Elevation Gain (m)</label>
              <input
                type="number"
                step="5"
                min="10"
                max="2500"
                value={gainMeters}
                onChange={e => setGainMeters(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white font-digital text-base font-bold focus:outline-hidden focus:border-blue-500"
                required
              />
            </div>
          </div>

          {/* Calculated Stats Badge */}
          <div className="bg-zinc-800/60 border border-zinc-750 p-3 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-zinc-400">Average Gradient:</span>
              <span className="ml-1.5 font-digital font-bold text-sm text-blue-400">{avgGrade}%</span>
            </div>
            <div>
              <span className="text-zinc-400">UCI Category:</span>
              <span className="ml-1.5 font-sports font-bold px-2 py-0.5 rounded bg-blue-600/30 text-blue-300 border border-blue-500/40">
                Cat {category}
              </span>
            </div>
          </div>

          {/* Ramp Profile Distribution */}
          <div>
            <label className="block text-zinc-300 font-semibold mb-1.5">Elevation Profile Shape</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setRampProfile('uniform')}
                className={`p-2 rounded-lg border text-center transition-all ${
                  rampProfile === 'uniform'
                    ? 'border-blue-500 bg-blue-950/40 text-blue-200 font-bold'
                    : 'border-zinc-700 bg-zinc-800 text-zinc-400'
                }`}
              >
                Constant Slope
              </button>
              <button
                type="button"
                onClick={() => setRampProfile('steep-top')}
                className={`p-2 rounded-lg border text-center transition-all ${
                  rampProfile === 'steep-top'
                    ? 'border-blue-500 bg-blue-950/40 text-blue-200 font-bold'
                    : 'border-zinc-700 bg-zinc-800 text-zinc-400'
                }`}
              >
                Steep Finish
              </button>
              <button
                type="button"
                onClick={() => setRampProfile('steps')}
                className={`p-2 rounded-lg border text-center transition-all ${
                  rampProfile === 'steps'
                    ? 'border-blue-500 bg-blue-950/40 text-blue-200 font-bold'
                    : 'border-zinc-700 bg-zinc-800 text-zinc-400'
                }`}
              >
                Terrace Steps
              </button>
            </div>
          </div>

          {/* Start Offset */}
          <div>
            <label className="block text-zinc-300 font-semibold mb-1">
              Start Distance Ahead of Current Position (meters)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                step="50"
                min="0"
                max="10000"
                value={startOffsetMeters}
                onChange={e => setStartOffsetMeters(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white font-digital font-bold focus:outline-hidden focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => setStartOffsetMeters('0')}
                className="shrink-0 px-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-zinc-300 font-medium"
              >
                Start Now
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              Setting to 0 puts you immediately at the bottom of this climb!
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold flex items-center gap-1.5 transition-colors shadow-md"
            >
              <Check className="w-4 h-4" />
              Apply Climb to Ride
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
