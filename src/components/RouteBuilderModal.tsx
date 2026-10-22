import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Navigation2,
  Loader2,
  ArrowLeftRight,
  CornerUpLeft,
  CornerUpRight,
  ArrowUp,
  Flag,
  MapPin
} from 'lucide-react';
import { RouteData, RouteTurn } from '../types/cycling';
import { evaluateRouteFromEndpoints, LatLng } from '../utils/routeEncode';
import { RoutePickerMap, PinMode } from './RoutePickerMap';

interface RouteBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCoords: { lat: number; lng: number };
  onSave: (route: RouteData) => void;
  onUseAsCurrentRide: (route: RouteData) => void;
}

function formatStepDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

function TurnIcon({ turn }: { turn: RouteTurn }) {
  const mod = turn.modifier || '';
  const type = turn.maneuverType;
  if (type === 'arrive') return <Flag className="w-3.5 h-3.5 text-red-400 shrink-0" />;
  if (type === 'depart') return <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  if (mod.includes('left')) return <CornerUpLeft className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
  if (mod.includes('right')) return <CornerUpRight className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
  return <ArrowUp className="w-3.5 h-3.5 text-zinc-400 shrink-0" />;
}

export const RouteBuilderModal: React.FC<RouteBuilderModalProps> = ({
  isOpen,
  onClose,
  currentCoords,
  onSave,
  onUseAsCurrentRide
}) => {
  const [name, setName] = useState('My Route');
  const [pinMode, setPinMode] = useState<PinMode>('start');
  const [start, setStart] = useState<LatLng | null>(null);
  const [dest, setDest] = useState<LatLng | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedOsrm, setUsedOsrm] = useState<boolean | null>(null);
  const [route, setRoute] = useState<RouteData | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStart(
      currentCoords.lat
        ? { lat: currentCoords.lat, lng: currentCoords.lng }
        : null
    );
    setDest(null);
    setRoute(null);
    setError(null);
    setUsedOsrm(null);
    setPinMode(currentCoords.lat ? 'dest' : 'start');
    setName('My Route');
  }, [isOpen]);

  const runEvaluate = useCallback(
    async (s: LatLng, d: LatLng) => {
      setEvaluating(true);
      setError(null);
      try {
        const result = await evaluateRouteFromEndpoints(name.trim() || 'My Route', [s, d]);
        setRoute(result.route);
        setUsedOsrm(result.usedOsrm);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Evaluation failed');
        setRoute(null);
      } finally {
        setEvaluating(false);
      }
    },
    [name]
  );

  const handleMapClick = (ll: LatLng) => {
    if (pinMode === 'start') {
      setStart(ll);
      setRoute(null);
      setPinMode('dest');
      if (dest) {
        void runEvaluate(ll, dest);
      }
    } else {
      setDest(ll);
      setRoute(null);
      if (start) {
        void runEvaluate(start, ll);
      }
    }
  };

  const handleSwap = () => {
    if (!start && !dest) return;
    const nextStart = dest;
    const nextDest = start;
    setStart(nextStart);
    setDest(nextDest);
    setRoute(null);
    if (nextStart && nextDest) {
      void runEvaluate(nextStart, nextDest);
    }
  };

  const handleReEvaluate = () => {
    if (start && dest) void runEvaluate(start, dest);
  };

  if (!isOpen) return null;

  const turns = route?.turns || [];

  return (
    <div className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-xs p-0 sm:p-3">
      <div className="w-full max-w-lg max-h-[96dvh] h-[96dvh] sm:h-[90dvh] bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl text-zinc-100 flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <Navigation2 className="w-4 h-4 text-blue-400" />
            <h3 className="font-sports font-bold text-sm uppercase tracking-wider">Create Route</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Name + pin mode */}
        <div className="p-2.5 border-b border-zinc-800 space-y-2 shrink-0">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Route name"
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-sports"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPinMode('start')}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold border ${
                pinMode === 'start'
                  ? 'bg-emerald-600 border-emerald-500 text-white'
                  : 'bg-zinc-950 border-zinc-700 text-zinc-400'
              }`}
            >
              Set Start (A)
            </button>
            <button
              type="button"
              onClick={handleSwap}
              className="p-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300"
              title="Swap start / dest"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setPinMode('dest')}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold border ${
                pinMode === 'dest'
                  ? 'bg-red-600 border-red-500 text-white'
                  : 'bg-zinc-950 border-zinc-700 text-zinc-400'
              }`}
            >
              Set Dest (B)
            </button>
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
            <span>
              A:{' '}
              {start
                ? `${start.lat.toFixed(4)}, ${start.lng.toFixed(4)}`
                : 'tap map'}
            </span>
            <span>
              B:{' '}
              {dest
                ? `${dest.lat.toFixed(4)}, ${dest.lng.toFixed(4)}`
                : 'tap map'}
            </span>
          </div>
        </div>

        {/* Map */}
        <div className="h-[38%] min-h-[200px] shrink-0 border-b border-zinc-800 relative">
          <RoutePickerMap
            center={{
              lat: currentCoords.lat || 10.67,
              lng: currentCoords.lng || 122.96
            }}
            start={start}
            dest={dest}
            routePoints={route?.points || []}
            pinMode={pinMode}
            onMapClick={handleMapClick}
          />
          {evaluating && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-[600]">
              <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 px-3 py-2 rounded-xl text-xs font-bold">
                <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                Routing…
              </div>
            </div>
          )}
        </div>

        {/* Summary + turns */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2 text-xs font-sports min-h-0">
          {error && (
            <div className="text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-2.5 py-2 text-[11px]">
              {error}
            </div>
          )}

          {route && (
            <>
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-400 uppercase text-[10px]">
                  {usedOsrm ? 'OSRM bike route' : 'Straight-line fallback'}
                </span>
                <button
                  type="button"
                  onClick={handleReEvaluate}
                  className="text-[10px] text-blue-400 font-bold"
                >
                  Re-evaluate
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <div className="bg-zinc-950 rounded-lg p-1.5 border border-zinc-800">
                  <div className="text-[9px] text-zinc-500 uppercase">Distance</div>
                  <div className="font-digital font-bold text-sm">
                    {(route.totalDistance / 1000).toFixed(2)} km
                  </div>
                </div>
                <div className="bg-zinc-950 rounded-lg p-1.5 border border-zinc-800">
                  <div className="text-[9px] text-zinc-500 uppercase">Elev</div>
                  <div className="font-digital font-bold text-sm">+{route.totalElevationGain} m</div>
                </div>
                <div className="bg-zinc-950 rounded-lg p-1.5 border border-zinc-800">
                  <div className="text-[9px] text-zinc-500 uppercase">Turns</div>
                  <div className="font-digital font-bold text-sm">{turns.length}</div>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-zinc-400 uppercase font-bold">
                  Turn-by-turn
                </span>
                {turns.length === 0 ? (
                  <div className="text-[11px] text-zinc-500 py-2">
                    No turn instructions (path may be a straight-line fallback).
                  </div>
                ) : (
                  <div className="space-y-0.5 max-h-48 overflow-y-auto pr-0.5">
                    {turns.map(t => (
                      <div
                        key={t.index}
                        className="flex items-start gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5"
                      >
                        <TurnIcon turn={t} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] text-zinc-200 font-semibold leading-snug">
                            {t.instruction}
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                          {formatStepDistance(t.distanceMeters)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {!route && !evaluating && (
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Tap the map to place <span className="text-emerald-400 font-bold">Start (A)</span>, then{' '}
              <span className="text-red-400 font-bold">Destination (B)</span>. The bike route and
              turn-by-turn list will load automatically.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-800 flex gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-300 font-bold text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!route}
            onClick={() => route && onSave({ ...route, name: name.trim() || route.name })}
            className="flex-1 py-2 rounded-xl bg-zinc-700 disabled:opacity-40 text-white font-bold text-xs"
          >
            Save
          </button>
          <button
            type="button"
            disabled={!route}
            onClick={() =>
              route && onUseAsCurrentRide({ ...route, name: name.trim() || route.name })
            }
            className="flex-1 py-2 rounded-xl bg-blue-600 disabled:opacity-40 text-white font-bold text-xs"
          >
            Use as ride
          </button>
        </div>
      </div>
    </div>
  );
};
