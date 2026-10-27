import React from 'react';
import { Loader2 } from 'lucide-react';

interface MapLoadingOverlayProps {
  visible: boolean;
  label?: string;
  className?: string;
}

/**
 * Full-bleed loading scrim for Leaflet map surfaces (ride map, route picker, history).
 */
export const MapLoadingOverlay: React.FC<MapLoadingOverlayProps> = ({
  visible,
  label = 'Loading map…',
  className = ''
}) => {
  if (!visible) return null;

  return (
    <div
      className={`absolute inset-0 z-[600] flex items-center justify-center bg-black/40 pointer-events-auto ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 px-3 py-2 rounded-xl text-xs font-sports font-bold text-white shadow-lg">
        <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
        <span>{label}</span>
      </div>
    </div>
  );
};
