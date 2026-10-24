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
  MapPin,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { RouteData, RouteTurn } from '../types/cycling';
import { evaluateRouteFromEndpoints, LatLng } from '../utils/routeEncode';
import { RoutePickerMap, PinMode } from './RoutePickerMap';

const MAX_VIAS = 8;

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

function fmtCoord(ll: LatLng | null): string {
  if (!ll) return 'tap map';
  return `${ll.lat.toFixed(4)}, ${ll.lng.toFixed(4)}`;
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
  const [vias, setVias] = useState<LatLng[]>([]);
  const [replaceViaIndex, setReplaceViaIndex] = useState<number | null>(null);
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
    setVias([]);
    setReplaceViaIndex(null);
    setRoute(null);
    setError(null);
    setUsedOsrm(null);
    setPinMode(currentCoords.lat ? 'dest' : 'start');
    setName('My Route');
  }, [isOpen]);

  const runEvaluate = useCallback(
    async (s: LatLng, d: LatLng, viaList: LatLng[]) => {
      setEvaluating(true);
      setError(null);
      try {
        const waypoints = [s, ...viaList, d];
        const result = await evaluateRouteFromEndpoints(name.trim() || 'My Route', waypoints);
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

  const maybeEvaluate = (s: LatLng | null, d: LatLng | null, viaList: LatLng[]) => {
    if (s && d) void runEvaluate(s, d, viaList);
  };

  const handleMapClick = (ll: LatLng) => {
    if (pinMode === 'start') {
      setStart(ll);
      setRoute(null);
      setPinMode(dest ? (vias.length < MAX_VIAS ? 'via' : 'dest') : 'dest');
      maybeEvaluate(ll, dest, vias);
      return;
    }

    if (pinMode === 'via') {
      if (replaceViaIndex != null && replaceViaIndex >= 0 && replaceViaIndex < vias.length) {
        const next = [...vias];
        next[replaceViaIndex] = ll;
        setVias(next);
        setReplaceViaIndex(null);
        setRoute(null);
        maybeEvaluate(start, dest, next);
        return;
      }
      if (vias.length >= MAX_VIAS) {
        setError(`Maximum ${MAX_VIAS} via points`);
        return;
      }
      const next = [...vias, ll];
      setVias(next);
      setRoute(null);
      maybeEvaluate(start, dest, next);
      return;
    }

    // dest
    setDest(ll);
    setRoute(null);
    maybeEvaluate(start, ll, vias);
  };

  const handleSwap = () => {
    if (!start && !dest) return;
    const nextStart = dest;
    const nextDest = start;
    const nextVias = [...vias].reverse();
    setStart(nextStart);
    setDest(nextDest);
    setVias(nextVias);
    setRoute(null);
    maybeEvaluate(nextStart, nextDest, nextVias);
  };

  const handleReEvaluate = () => {
    if (start && dest) void runEvaluate(start, dest, vias);
  };

  const removeVia = (index: number) => {
    const next = vias.filter((_, i) => i !== index);
    setVias(next);
    setReplaceViaIndex(null);
    setRoute(null);
    maybeEvaluate(start, dest, next);
  };

  const moveVia = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= vias.length) return;
    const next = [...vias];
    const tmp = next[index];
    next[index] = next[j];
    next[j] = tmp;
    setVias(next);
    setRoute(null);
    maybeEvaluate(start, dest, next);
  };

  if (!isOpen) return null;

  const turns = route?.turns || [];
  const canAddVia = !!start && vias.length < MAX_VIAS;

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
              onClick={() => {
                setPinMode('start');
                setReplaceViaIndex(null);
              }}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold border ${
                pinMode === 'start'
                  ? 'bg-emerald-600 border-emerald-500 text-white'
                  : 'bg-zinc-950 border-zinc-700 text-zinc-400'
              }`}
            >
              Start
            </button>
            <button
              type="button"
              disabled={!canAddVia && pinMode !== 'via'}
              onClick={() => {
                setPinMode('via');
                setReplaceViaIndex(null);
              }}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold border disabled:opacity-40 ${
                pinMode === 'via'
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-zinc-950 border-zinc-700 text-zinc-400'
              }`}
            >
              Via
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
              onClick={() => {
                setPinMode('dest');
                setReplaceViaIndex(null);
              }}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold border ${
                pinMode === 'dest'
                  ? 'bg-red-600 border-red-500 text-white'
                  : 'bg-zinc-950 border-zinc-700 text-zinc-400'
              }`}
            >
              Dest
            </button>
          </div>
        </div>

        {/* Map */}
        <div className="h-[34%] min-h-[180px] shrink-0 border-b border-zinc-800 relative">
          <RoutePickerMap
            center={{
              lat: currentCoords.lat || 10.67,
              lng: currentCoords.lng || 122.96
            }}
            start={start}
            dest={dest}
            vias={vias}
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

        {/* Waypoint list + summary + turns */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2 text-xs font-sports min-h-0">
          {error && (
            <div className="text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-2.5 py-2 text-[11px]">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-400 uppercase font-bold">Waypoints</span>
              <button
                type="button"
                disabled={!canAddVia}
                onClick={() => {
                  setPinMode('via');
                  setReplaceViaIndex(null);
                }}
                className="flex items-center gap-1 text-[10px] font-bold text-blue-400 disabled:opacity-40"
              >
                <Plus className="w-3 h-3" />
                Add via
              </button>
            </div>

            <div className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  setPinMode('start');
                  setReplaceViaIndex(null);
                }}
                className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 border text-left ${
                  pinMode === 'start'
                    ? 'border-emerald-500 bg-emerald-950/40'
                    : 'border-zinc-800 bg-zinc-950'
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                  A
                </span>
                <span className="font-mono text-[11px] text-zinc-300 truncate">{fmtCoord(start)}</span>
              </button>

              {vias.map((v, i) => (
                <div
                  key={`via-${i}-${v.lat}-${v.lng}`}
                  className={`flex items-center gap-1 rounded-lg px-1.5 py-1 border ${
                    pinMode === 'via' && replaceViaIndex === i
                      ? 'border-blue-500 bg-blue-950/40'
                      : 'border-zinc-800 bg-zinc-950'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setPinMode('via');
                      setReplaceViaIndex(i);
                    }}
                    className="flex-1 flex items-center gap-2 min-w-0 text-left px-1 py-0.5"
                  >
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-300 truncate">{fmtCoord(v)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => moveVia(i, -1)}
                    disabled={i === 0}
                    className="p-1 text-zinc-500 hover:text-white disabled:opacity-30"
                    aria-label="Move via up"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveVia(i, 1)}
                    disabled={i === vias.length - 1}
                    className="p-1 text-zinc-500 hover:text-white disabled:opacity-30"
                    aria-label="Move via down"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeVia(i)}
                    className="p-1 text-zinc-500 hover:text-rose-400"
                    aria-label={`Remove via ${i + 1}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => {
                  setPinMode('dest');
                  setReplaceViaIndex(null);
                }}
                className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 border text-left ${
                  pinMode === 'dest'
                    ? 'border-red-500 bg-red-950/40'
                    : 'border-zinc-800 bg-zinc-950'
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                  B
                </span>
                <span className="font-mono text-[11px] text-zinc-300 truncate">{fmtCoord(dest)}</span>
              </button>
            </div>
          </div>

          {route && (
            <>
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-400 uppercase text-[10px]">
                  {usedOsrm
                    ? `OSRM bike route${
                        vias.length ? ` · ${vias.length} via` : ''
                      }${
                        route.alternatives?.length
                          ? ` + ${route.alternatives.length} alt TBT`
                          : ''
                      }`
                    : 'Route ready'}
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
                    No turn instructions for this route.
                  </div>
                ) : (
                  <div className="space-y-0.5 max-h-40 overflow-y-auto pr-0.5">
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
              Place <span className="text-emerald-400 font-bold">Start</span> and{' '}
              <span className="text-red-400 font-bold">Dest</span>, then add{' '}
              <span className="text-blue-400 font-bold">Via</span> points to shape the course.
              Routing and turn-by-turn need internet when creating; saved routes work offline.
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
