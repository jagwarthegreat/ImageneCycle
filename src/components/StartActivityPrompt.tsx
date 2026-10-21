import React from 'react';
import { Play, X, Compass, Activity, Navigation2 } from 'lucide-react';
import { RouteData } from '../types/cycling';

interface StartActivityPromptProps {
  isOpen: boolean;
  activeRoute?: RouteData | null;
  onStart: () => void;
  onDismiss: () => void;
}

export const StartActivityPrompt: React.FC<StartActivityPromptProps> = ({
  isOpen,
  activeRoute,
  onStart,
  onDismiss
}) => {
  if (!isOpen) return null;

  const routeTitle = activeRoute?.name || 'Free Ride (Live GPS Tracking)';

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-[9990] animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-zinc-900/95 backdrop-blur-md border border-emerald-500/40 rounded-2xl p-4 shadow-2xl text-white">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5 text-emerald-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <h4 className="font-sports font-bold text-xs uppercase tracking-wider text-emerald-400">
                  GPS Ready · Start Ride?
                </h4>
              </div>
              <p className="text-[11px] text-zinc-300 mt-0.5 line-clamp-1">
                Mode: <span className="font-semibold text-white">{routeTitle}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-zinc-400 bg-zinc-950/60 p-2 rounded-xl border border-zinc-800/80">
          <div className="flex items-center gap-1.5">
            <Navigation2 className="w-3.5 h-3.5 text-zinc-500" />
            <span>{activeRoute ? `${(activeRoute.totalDistance / 1000).toFixed(1)} km planned` : 'Live GPS path'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-zinc-500" />
            <span>{activeRoute ? `+${activeRoute.totalElevationGain}m elevation` : 'Dual timers & auto-pause'}</span>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={onStart}
            className="flex-1 py-2.5 px-3 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-black font-sports font-bold text-xs tracking-wide rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>START ACTIVITY</span>
          </button>
          <button
            onClick={onDismiss}
            className="py-2.5 px-3 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 font-sports font-bold text-xs rounded-xl transition-colors"
          >
            LATER
          </button>
        </div>
      </div>
    </div>
  );
};
