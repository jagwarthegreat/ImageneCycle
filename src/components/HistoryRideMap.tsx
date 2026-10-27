import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BreadcrumbPoint } from '../types/cycling';
import { MapLoadingOverlay } from './MapLoadingOverlay';

interface HistoryRideMapProps {
  breadcrumbs: BreadcrumbPoint[];
  className?: string;
}

/** Compact read-only track map for a saved ride. */
export const HistoryRideMap: React.FC<HistoryRideMapProps> = ({
  breadcrumbs,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const pts = breadcrumbs.filter(b => Number.isFinite(b.lat) && Number.isFinite(b.lng));
    if (pts.length < 2) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: false
    });
    mapRef.current = map;

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    const latLngs = pts.map(p => [p.lat, p.lng] as [number, number]);
    const line = L.polyline(latLngs, {
      color: '#3b82f6',
      weight: 4,
      opacity: 0.9
    }).addTo(map);

    L.circleMarker(latLngs[0], {
      radius: 5,
      color: '#16a34a',
      fillColor: '#22c55e',
      fillOpacity: 1
    }).addTo(map);
    L.circleMarker(latLngs[latLngs.length - 1], {
      radius: 5,
      color: '#b91c1c',
      fillColor: '#ef4444',
      fillOpacity: 1
    }).addTo(map);

    map.fitBounds(line.getBounds(), { padding: [16, 16], maxZoom: 16 });
    const readyTimer = window.setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {
        /* ignore */
      }
      if (mapRef.current === map) setLoading(false);
    }, 50);

    return () => {
      clearTimeout(readyTimer);
      map.remove();
      mapRef.current = null;
    };
  }, [breadcrumbs]);

  if (breadcrumbs.length < 2) {
    return (
      <div className={`flex items-center justify-center text-[10px] text-zinc-500 bg-zinc-900/60 rounded-lg border border-zinc-800 ${className}`}>
        No track points for this ride
      </div>
    );
  }

  return (
    <div
      className={`relative rounded-lg overflow-hidden border border-zinc-700 ${className}`}
      style={{ minHeight: 140 }}
    >
      <div ref={containerRef} className="w-full h-full absolute inset-0" />
      <MapLoadingOverlay visible={loading} label="Loading map…" />
    </div>
  );
};
