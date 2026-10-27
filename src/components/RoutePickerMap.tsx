import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LatLng } from '../utils/routeEncode';
import { RoutePoint } from '../types/cycling';
import { resolveActiveBasemap, resolveActiveContour } from '../utils/mapPacks';
import { createContourOverlayLayer } from '../utils/contourOverlay';
import { createOfflineBasemapLayer, loadMapDetailsPref } from '../utils/offlineMapStyle';
import { MapLoadingOverlay } from './MapLoadingOverlay';

export type PinMode = 'start' | 'dest' | 'via';

interface RoutePickerMapProps {
  center: LatLng;
  start: LatLng | null;
  dest: LatLng | null;
  vias?: LatLng[];
  routePoints?: RoutePoint[];
  pinMode: PinMode;
  onMapClick: (ll: LatLng) => void;
  className?: string;
}

function makePinIcon(label: string, color: string) {
  return L.divIcon({
    className: 'route-pin',
    html: `<div style="
      width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
      background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);
      display:flex;align-items:center;justify-content:center;">
      <span style="transform:rotate(45deg);color:#fff;font-weight:800;font-size:12px;font-family:sans-serif;">${label}</span>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28]
  });
}

export const RoutePickerMap: React.FC<RoutePickerMapProps> = ({
  center,
  start,
  dest,
  vias = [],
  routePoints = [],
  pinMode,
  onMapClick,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const startMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const viaMarkersRef = useRef<L.Marker[]>([]);
  const lineRef = useRef<L.Polyline | null>(null);
  const onClickRef = useRef(onMapClick);
  onClickRef.current = onMapClick;
  const [basemapLoading, setBasemapLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [center.lat || 10.67, center.lng || 122.96],
      zoom: 13,
      zoomControl: true,
      attributionControl: false
    });

    mapRef.current = map;
    setBasemapLoading(true);

    map.on('click', (e: L.LeafletMouseEvent) => {
      onClickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    void (async () => {
      try {
        const lat = center.lat || 14.6;
        const lng = center.lng || 121;
        const active = await resolveActiveBasemap(lat, lng);
        if (!mapRef.current) return;
        if (active?.pmtiles) {
          try {
            const details = loadMapDetailsPref();
            const layer = createOfflineBasemapLayer({
              pmtiles: active.pmtiles,
              isDarkMode: false,
              details
            });
            layer.addTo(map);
            try {
              const topo = await resolveActiveContour(lat, lng);
              if (topo?.pmtiles && mapRef.current) {
                createContourOverlayLayer({
                  pmtiles: topo.pmtiles,
                  isDarkMode: false
                }).addTo(map);
              }
            } catch {
              /* contours optional */
            }
            return;
          } catch {
            /* fall through to world overview */
          }
        }
        if (!mapRef.current) return;
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19
        }).addTo(map);
      } finally {
        if (mapRef.current) setBasemapLoading(false);
      }
    })();

    setTimeout(() => map.invalidateSize(), 100);
    setTimeout(() => map.invalidateSize(), 400);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (start) {
      if (!startMarkerRef.current) {
        startMarkerRef.current = L.marker([start.lat, start.lng], {
          icon: makePinIcon('A', '#16a34a'),
          interactive: false
        }).addTo(map);
      } else {
        startMarkerRef.current.setLatLng([start.lat, start.lng]);
      }
    } else if (startMarkerRef.current) {
      map.removeLayer(startMarkerRef.current);
      startMarkerRef.current = null;
    }

    if (dest) {
      if (!destMarkerRef.current) {
        destMarkerRef.current = L.marker([dest.lat, dest.lng], {
          icon: makePinIcon('B', '#dc2626'),
          interactive: false
        }).addTo(map);
      } else {
        destMarkerRef.current.setLatLng([dest.lat, dest.lng]);
      }
    } else if (destMarkerRef.current) {
      map.removeLayer(destMarkerRef.current);
      destMarkerRef.current = null;
    }

    viaMarkersRef.current.forEach(m => map.removeLayer(m));
    viaMarkersRef.current = vias.map((v, i) =>
      L.marker([v.lat, v.lng], {
        icon: makePinIcon(String(i + 1), '#2563eb'),
        interactive: false
      }).addTo(map)
    );
  }, [start, dest, vias]);

  // Polyline
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (routePoints.length > 1) {
      const latLngs = routePoints.map(p => [p.lat, p.lng] as [number, number]);
      if (!lineRef.current) {
        lineRef.current = L.polyline(latLngs, {
          color: '#2563eb',
          weight: 5,
          opacity: 0.9
        }).addTo(map);
      } else {
        lineRef.current.setLatLngs(latLngs);
      }
      try {
        map.fitBounds(lineRef.current.getBounds(), { padding: [30, 30], maxZoom: 15 });
      } catch {}
    } else if (lineRef.current) {
      map.removeLayer(lineRef.current);
      lineRef.current = null;
    }
  }, [routePoints]);

  return (
    <div className={`relative w-full h-full min-h-[220px] ${className}`}>
      <div ref={containerRef} className="w-full h-full rounded-lg overflow-hidden z-0" />
      <div className="absolute top-2 left-2 z-[500] px-2 py-1 rounded-md bg-zinc-900/85 text-[10px] font-sports font-bold text-white border border-zinc-700 pointer-events-none">
        Tap map to set {pinMode === 'start' ? 'START (A)' : pinMode === 'dest' ? 'DEST (B)' : 'VIA'}
      </div>
      <MapLoadingOverlay visible={basemapLoading} label="Loading map…" />
    </div>
  );
};
