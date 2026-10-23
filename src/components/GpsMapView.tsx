import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { RoutePoint } from '../types/cycling';
import { createCachedTileLayer } from '../utils/tileCache';
import { resolveActiveBasemap } from '../utils/mapPacks';
import {
  createOfflineBasemapLayer,
  loadMapDetailsPref,
  saveMapDetailsPref
} from '../utils/offlineMapStyle';
import { Layers, Map as MapIcon, MapPin } from 'lucide-react';

function attachWorldOverview(map: L.Map, isDarkMode: boolean): L.Layer {
  // World overview — not a country offline pack (needs network). No country roads from app bundle.
  const tileUrl = isDarkMode
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const layer = createCachedTileLayer(tileUrl, {
    maxZoom: 19,
    subdomains: isDarkMode ? 'abcd' : 'abc'
  }).addTo(map);
  layer.bringToBack?.();
  return layer;
}

async function attachBasemap(
  map: L.Map,
  isDarkMode: boolean,
  lat: number,
  lng: number,
  details: boolean
): Promise<{ layer: L.Layer; offline: boolean; packName?: string; error?: string }> {
  const active = await resolveActiveBasemap(lat || 14.5995, lng || 120.9842);
  if (active?.pmtiles) {
    try {
      const layer = createOfflineBasemapLayer({
        pmtiles: active.pmtiles,
        isDarkMode,
        details
      });
      layer.addTo(map);
      layer.bringToBack?.();
      return { layer, offline: true, packName: active.packName };
    } catch (err) {
      console.warn('Offline PMTiles failed, falling back to world overview:', err);
      const layer = attachWorldOverview(map, isDarkMode);
      return {
        layer,
        offline: false,
        error: 'Offline map invalid — using world overview'
      };
    }
  }

  return { layer: attachWorldOverview(map, isDarkMode), offline: false };
}

interface GpsMapViewProps {
  currentPoint: RoutePoint;
  routePoints?: RoutePoint[];
  heading: number;
  isDarkMode?: boolean;
  liveBreadcrumbs?: { lat: number; lng: number }[];
  routeName?: string;
  onLocateMe?: () => void;
  batterySaver?: boolean;
  /** Increment to fit map bounds to the loaded course polyline */
  fitRouteToken?: number;
  /** Increment after map pack download/delete to reload basemap */
  basemapToken?: number;
  autoCenter?: boolean;
  onToggleAutoCenter?: () => void;
  onAutoCenterChange?: (enabled: boolean) => void;
  invertHeading?: boolean;
  onToggleInvertHeading?: () => void;
}

export const GpsMapView: React.FC<GpsMapViewProps> = ({
  currentPoint,
  routePoints = [],
  heading,
  isDarkMode = false,
  liveBreadcrumbs = [],
  routeName,
  onLocateMe,
  batterySaver = false,
  fitRouteToken = 0,
  basemapToken = 0,
  autoCenter: propAutoCenter,
  onToggleAutoCenter,
  onAutoCenterChange,
  invertHeading: propInvertHeading,
  onToggleInvertHeading
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const polylineBorderRef = useRef<L.Polyline | null>(null);
  const polylineCoreRef = useRef<L.Polyline | null>(null);
  const breadcrumbPolylineRef = useRef<L.Polyline | null>(null);
  const chevronsRef = useRef<L.LayerGroup | null>(null);
  const endpointsRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.Layer | null>(null);
  const [offlineMapReady, setOfflineMapReady] = useState<boolean | null>(null);
  const [activePackName, setActivePackName] = useState<string | null>(null);
  const [basemapError, setBasemapError] = useState<string | null>(null);
  const [mapDetails, setMapDetails] = useState(() => loadMapDetailsPref());
  const hasCenteredInitiallyRef = useRef<boolean>(false);
  const pendingBreadcrumbsRef = useRef<{ lat: number; lng: number }[] | null>(null);
  const breadcrumbRafRef = useRef<number | null>(null);
  const batterySaverRef = useRef(batterySaver);
  batterySaverRef.current = batterySaver;

  // Map Navigation Modes (course-up / north-up)
  const [internalAutoCenter, setInternalAutoCenter] = useState<boolean>(true);
  const autoCenter = propAutoCenter !== undefined ? propAutoCenter : internalAutoCenter;
  const onToggleAutoCenterRef = useRef(onToggleAutoCenter);
  onToggleAutoCenterRef.current = onToggleAutoCenter;
  const onAutoCenterChangeRef = useRef(onAutoCenterChange);
  onAutoCenterChangeRef.current = onAutoCenterChange;
  const autoCenterRef = useRef(autoCenter);
  autoCenterRef.current = autoCenter;

  const setAutoCenterState = (val: boolean) => {
    if (val === autoCenterRef.current) return;
    if (onAutoCenterChangeRef.current) {
      onAutoCenterChangeRef.current(val);
    } else if (onToggleAutoCenterRef.current) {
      onToggleAutoCenterRef.current();
    } else {
      setInternalAutoCenter(val);
    }
  };

  const [headingUpMode, setHeadingUpMode] = useState<boolean>(false); // Default: NORTH UP
  const [mapEpoch, setMapEpoch] = useState(0); // bump when Leaflet map is ready (for HDG drag bind)
  const [internalInvertHeading, setInternalInvertHeading] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('magene-invert-heading') === 'true';
    } catch {
      return false;
    }
  });
  const invertHeading = propInvertHeading !== undefined ? propInvertHeading : internalInvertHeading;

  const handleToggleInvertHeading = () => {
    if (onToggleInvertHeading) {
      onToggleInvertHeading();
      return;
    }
    setInternalInvertHeading(prev => {
      const next = !prev;
      try {
        localStorage.setItem('magene-invert-heading', String(next));
      } catch {}
      return next;
    });
  };

  const effectiveHeading = ((heading || 0) + (invertHeading ? 180 : 0)) % 360;
  const rotateWrapperRef = useRef<HTMLDivElement>(null);
  const effectiveHeadingRef = useRef(effectiveHeading);
  effectiveHeadingRef.current = effectiveHeading;
  const setAutoCenterStateRef = useRef(setAutoCenterState);
  setAutoCenterStateRef.current = setAutoCenterState;

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    try {
      const initialLat = currentPoint.lat || 14.5995;
      const initialLng = currentPoint.lng || 120.9842;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 16,
        zoomControl: false,
        attributionControl: false,
        fadeAnimation: !batterySaverRef.current
      });

      // User manual drag pauses auto-center temporarily
      map.on('dragstart', () => {
        setAutoCenterState(false);
      });

      L.control.scale({ imperial: false, metric: true, position: 'bottomleft' }).addTo(map);

      // Layer groups for markers & chevrons
      endpointsRef.current = L.layerGroup().addTo(map);
      chevronsRef.current = L.layerGroup().addTo(map);

      // 1. Draw Route Polyline Border (High Contrast Outer Line) - Only if an active route exists
      const latLngs: [number, number][] = routePoints.length > 1
        ? routePoints.map(p => [p.lat, p.lng] as [number, number])
        : [];

      const polylineBorder = L.polyline(latLngs, {
        color: isDarkMode ? '#78350f' : '#b45309',
        weight: 7,
        opacity: 0.85,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);
      polylineBorderRef.current = polylineBorder;

      // 2. Draw Route Polyline Core (bright yellow)
      const polylineCore = L.polyline(latLngs, {
        color: '#facc15',
        weight: 4.5,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);
      polylineCoreRef.current = polylineCore;

      // 3. Live Recorded Breadcrumb Trail (Blue path of actual movement)
      const breadcrumbPolyline = L.polyline([], {
        color: '#3b82f6',
        weight: 3.5,
        opacity: 0.9,
        dashArray: '4 4'
      }).addTo(map);
      breadcrumbPolylineRef.current = breadcrumbPolyline;

      // 4. Custom GPS Location Puck with Heading Arrow (ping disabled in battery saver)
      const pingHtml = batterySaverRef.current
        ? ''
        : `<div style="position: absolute; width: 34px; height: 34px; border-radius: 50%; background: rgba(37, 99, 235, 0.25); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>`;
      const customPuckIcon = L.divIcon({
        className: 'gps-puck-wrapper',
        html: `
          <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
            ${pingHtml}
            <div style="width: 26px; height: 26px; border-radius: 50%; background: #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,0.35); border: 2.5px solid #2563eb; display: flex; align-items: center; justify-content: center;">
              <svg class="gps-heading-needle" style="width: 15px; height: 15px; color: #2563eb; transform: rotate(0deg); transition: transform 0.15s linear;" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" />
              </svg>
            </div>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });

      const marker = L.marker([initialLat, initialLng], {
        icon: customPuckIcon,
        interactive: false
      }).addTo(map);
      markerRef.current = marker;

      mapInstanceRef.current = map;
      setMapEpoch(e => e + 1);

      // Render Start & Summit Endpoints if route is loaded
      if (latLngs.length > 1) {
        updateEndpointsAndChevrons(map, latLngs);
      }

      // Invalidate sizes after rendering
      setTimeout(() => map.invalidateSize(), 50);
      setTimeout(() => map.invalidateSize(), 300);
      setTimeout(() => map.invalidateSize(), 800);
    } catch (err) {
      console.warn('Map initialization:', err);
    }

    // Auto-fit to container size dynamically
    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    });

    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const lastBasemapParamsRef = useRef<{
    isDark: boolean;
    token: number;
    lat: number;
    lng: number;
    details: boolean;
  } | null>(null);

  // Swap day/night / pack basemap (PMTiles flavor or raster URL)
  // Only re-attach when dark mode, map token, details, or region genuinely changes — NOT on every raw coordinate tick!
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const lat = currentPoint.lat || 14.5995;
    const lng = currentPoint.lng || 120.9842;
    const prev = lastBasemapParamsRef.current;

    const needsUpdate =
      !prev ||
      prev.isDark !== isDarkMode ||
      prev.token !== basemapToken ||
      prev.details !== mapDetails ||
      Math.abs(prev.lat - lat) > 0.5 ||
      Math.abs(prev.lng - lng) > 0.5;

    if (!needsUpdate) return;
    lastBasemapParamsRef.current = {
      isDark: isDarkMode,
      token: basemapToken,
      lat,
      lng,
      details: mapDetails
    };

    let cancelled = false;
    void attachBasemap(map, isDarkMode, lat, lng, mapDetails).then(({ layer, offline, packName, error }) => {
      if (cancelled || mapInstanceRef.current !== map) {
        map.removeLayer(layer);
        return;
      }
      if (tileLayerRef.current) {
        map.removeLayer(tileLayerRef.current);
      }
      tileLayerRef.current = layer;
      setOfflineMapReady(offline);
      setActivePackName(packName || null);
      setBasemapError(error || null);
    });
    return () => {
      cancelled = true;
    };
  }, [isDarkMode, basemapToken, mapDetails, currentPoint.lat, currentPoint.lng]);

  // Helper to render start/finish markers and navigation chevrons
  const updateEndpointsAndChevrons = (map: L.Map, latLngs: [number, number][]) => {
    if (!endpointsRef.current || !chevronsRef.current) return;
    endpointsRef.current.clearLayers();
    chevronsRef.current.clearLayers();

    if (latLngs.length < 2) return;

    // Start Marker
    const startPt = latLngs[0];
    const startIcon = L.divIcon({
      className: 'route-start-icon',
      html: `
        <div style="background: #16a34a; color: white; font-weight: bold; font-size: 10px; padding: 2px 5px; border-radius: 4px; border: 1px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.4); text-transform: uppercase;">
          START
        </div>
      `,
      iconSize: [42, 20],
      iconAnchor: [21, 22]
    });
    L.marker(startPt, { icon: startIcon, interactive: false }).addTo(endpointsRef.current);

    // Summit Marker
    const endPt = latLngs[latLngs.length - 1];
    const endIcon = L.divIcon({
      className: 'route-end-icon',
      html: `
        <div style="background: #dc2626; color: white; font-weight: bold; font-size: 10px; padding: 2px 5px; border-radius: 4px; border: 1px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.4); text-transform: uppercase;">
          SUMMIT
        </div>
      `,
      iconSize: [46, 20],
      iconAnchor: [23, 22]
    });
    L.marker(endPt, { icon: endIcon, interactive: false }).addTo(endpointsRef.current);

    // Direction Chevrons along route
    const step = Math.max(1, Math.floor(latLngs.length / 10));
    for (let i = 0; i < latLngs.length - 1; i += step) {
      const p1 = latLngs[i];
      const p2 = latLngs[i + 1];
      if (p1 && p2) {
        const midLat = (p1[0] + p2[0]) / 2;
        const midLng = (p1[1] + p2[1]) / 2;
        const dY = p2[0] - p1[0];
        const dX = p2[1] - p1[1];
        const angle = (Math.atan2(dY, dX) * 180) / Math.PI;

        const chevronIcon = L.divIcon({
          className: 'route-chevron',
          html: `<div style="transform: rotate(${angle}deg); color: #d97706; font-size: 16px; font-weight: 900; line-height: 1; text-shadow: 0 0 2px white;">›</div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });
        L.marker([midLat, midLng], { icon: chevronIcon, interactive: false }).addTo(chevronsRef.current);
      }
    }
  };

  // Update Route Polyline when routePoints change
  useEffect(() => {
    if (mapInstanceRef.current) {
      if (routePoints && routePoints.length > 1) {
        const latLngs: [number, number][] = routePoints.map(p => [p.lat, p.lng] as [number, number]);
        if (polylineBorderRef.current) polylineBorderRef.current.setLatLngs(latLngs);
        if (polylineCoreRef.current) polylineCoreRef.current.setLatLngs(latLngs);
        updateEndpointsAndChevrons(mapInstanceRef.current, latLngs);
      } else {
        if (polylineBorderRef.current) polylineBorderRef.current.setLatLngs([]);
        if (polylineCoreRef.current) polylineCoreRef.current.setLatLngs([]);
        if (endpointsRef.current) endpointsRef.current.clearLayers();
        if (chevronsRef.current) chevronsRef.current.clearLayers();
      }
    }
  }, [routePoints, isDarkMode]);

  // Fit course when parent requests (route selected as current ride)
  useEffect(() => {
    if (!fitRouteToken || !mapInstanceRef.current || !polylineCoreRef.current) return;
    if (!routePoints || routePoints.length < 2) return;
    const map = mapInstanceRef.current;
    const line = polylineCoreRef.current;
    const timer = window.setTimeout(() => {
      try {
        setAutoCenterState(false);
        if (!line.getLatLngs() || (line.getLatLngs() as unknown[]).length < 2) return;
        map.fitBounds(line.getBounds(), {
          padding: [25, 25],
          maxZoom: 16,
          animate: !batterySaver
        });
        map.invalidateSize();
      } catch {}
    }, 80);
    return () => clearTimeout(timer);
  }, [fitRouteToken, routePoints, batterySaver]);

  // Throttled live breadcrumb trail (rAF coalesce — keeps UI fluid as array grows)
  useEffect(() => {
    pendingBreadcrumbsRef.current = liveBreadcrumbs;
    if (breadcrumbRafRef.current !== null) return;

    breadcrumbRafRef.current = requestAnimationFrame(() => {
      breadcrumbRafRef.current = null;
      const latest = pendingBreadcrumbsRef.current;
      if (breadcrumbPolylineRef.current && latest && latest.length > 0) {
        const pts = latest.map(b => [b.lat, b.lng] as [number, number]);
        breadcrumbPolylineRef.current.setLatLngs(pts);
      }
    });

    return () => {
      if (breadcrumbRafRef.current !== null) {
        cancelAnimationFrame(breadcrumbRafRef.current);
        breadcrumbRafRef.current = null;
      }
    };
  }, [liveBreadcrumbs]);

  // HDG UP: rematch pan/drag to screen direction (CSS rotate breaks Leaflet drag axes)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const wrap = rotateWrapperRef.current;
    if (!map || !wrap) return;

    if (!headingUpMode) {
      map.dragging.enable();
      return;
    }

    map.dragging.disable();

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let pointerId: number | null = null;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      pointerId = e.pointerId;
      try {
        wrap.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      setAutoCenterStateRef.current(false);
      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging || (pointerId !== null && e.pointerId !== pointerId)) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (dx === 0 && dy === 0) return;

      // CSS is rotate(-heading); convert screen delta → Leaflet panBy pixels
      const a = (effectiveHeadingRef.current * Math.PI) / 180;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const panX = dx * cos - dy * sin;
      const panY = dx * sin + dy * cos;
      map.panBy([-panX, -panY], { animate: false });
      e.preventDefault();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (pointerId !== null && e.pointerId !== pointerId) return;
      dragging = false;
      pointerId = null;
      try {
        wrap.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    wrap.style.touchAction = 'none';
    wrap.addEventListener('pointerdown', onPointerDown);
    wrap.addEventListener('pointermove', onPointerMove);
    wrap.addEventListener('pointerup', onPointerUp);
    wrap.addEventListener('pointercancel', onPointerUp);

    return () => {
      wrap.style.touchAction = '';
      wrap.removeEventListener('pointerdown', onPointerDown);
      wrap.removeEventListener('pointermove', onPointerMove);
      wrap.removeEventListener('pointerup', onPointerUp);
      wrap.removeEventListener('pointercancel', onPointerUp);
      map.dragging.enable();
    };
  }, [headingUpMode, mapEpoch]);

  // Update Position & Heading
  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current) {
      const lat = currentPoint.lat;
      const lng = currentPoint.lng;
      const animate = !batterySaver;

      if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
        markerRef.current.setLatLng([lat, lng]);

        // NORTH UP: arrow rotates by heading. HDG UP: map rotates under a screen-up arrow (= travel).
        const needle = mapContainerRef.current?.querySelector('.gps-heading-needle') as HTMLElement | null;
        if (needle) {
          needle.style.transform = headingUpMode ? 'rotate(0deg)' : `rotate(${effectiveHeading}deg)`;
        }

        // On first valid fix, center with zoom 16
        if (!hasCenteredInitiallyRef.current && (lat !== 0 || lng !== 0)) {
          hasCenteredInitiallyRef.current = true;
          mapInstanceRef.current.setView([lat, lng], 16, { animate });
        } else if (autoCenter) {
          mapInstanceRef.current.panTo([lat, lng], {
            animate,
            duration: animate ? 0.3 : 0
          });
        }
      }
    }
  }, [currentPoint.lat, currentPoint.lng, effectiveHeading, autoCenter, headingUpMode, batterySaver]);

  // Sync when autoCenter becomes true
  useEffect(() => {
    if (autoCenter && mapInstanceRef.current && currentPoint.lat && currentPoint.lng) {
      mapInstanceRef.current.setView([currentPoint.lat, currentPoint.lng], 16, { animate: !batterySaver });
    }
  }, [autoCenter]);

  // Toggle Auto-Center
  const handleToggleAutoCenter = () => {
    if (onToggleAutoCenter) {
      onToggleAutoCenter();
    } else {
      setInternalAutoCenter(prev => !prev);
    }
  };

  // Toggle Map Orientation (Heading Up vs North Up)
  const handleToggleHeadingUp = () => {
    setHeadingUpMode(prev => !prev);
  };

  const handleFitRoute = () => {
    if (onToggleAutoCenter && autoCenter) {
      onToggleAutoCenter();
    } else {
      setInternalAutoCenter(false);
    }
    if (mapInstanceRef.current && polylineCoreRef.current && routePoints && routePoints.length > 1) {
      mapInstanceRef.current.fitBounds(polylineCoreRef.current.getBounds(), {
        padding: [25, 25],
        maxZoom: 16
      });
      mapInstanceRef.current.invalidateSize();
    }
  };

  const handleLocateMe = () => {
    setAutoCenterState(true);
    if (mapInstanceRef.current && currentPoint.lat && currentPoint.lng) {
      mapInstanceRef.current.setView([currentPoint.lat, currentPoint.lng], 16, { animate: !batterySaver });
    }
    onLocateMe?.();
  };

  return (
    <div className="relative w-full h-full min-h-[160px] bg-[#e5e9ec] overflow-hidden select-none isolate z-0">
      
      {/* ROTATING MAP CONTAINER (Heading-Up rotation) */}
      <div
        ref={rotateWrapperRef}
        className={`w-[160%] h-[160%] -left-[30%] -top-[30%] absolute ${batterySaver ? '' : 'transition-transform duration-300 ease-out'}`}
        style={{
          transform: headingUpMode ? `rotate(${-effectiveHeading}deg)` : 'rotate(0deg)',
          transformOrigin: 'center center'
        }}
      >
        <div
          ref={mapContainerRef}
          className="w-full h-full"
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      {/* Top strip: route + basemap status (badge width hugs label) */}
      <div className="absolute top-1 left-2 right-2 z-[400] flex items-center gap-1.5 min-w-0 pointer-events-auto">
        <div className="bg-white/95 backdrop-blur-xs px-2 py-0.5 rounded-md text-[10px] font-bold text-zinc-800 shadow-sm border border-zinc-200 flex items-center gap-1.5 shrink-0 max-w-[48%]">
          <span className={`w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 ${batterySaver ? '' : 'animate-pulse'}`} />
          <span className="truncate">
            {routeName || (currentPoint.lat ? `${currentPoint.lat.toFixed(4)}°, ${currentPoint.lng.toFixed(4)}°` : 'Current Location')}
          </span>
        </div>
        {(basemapError || offlineMapReady !== null) && (
          <div
            className={`shrink-0 w-auto max-w-[50%] inline-flex rounded-md shadow-sm border ${
              basemapError
                ? 'bg-rose-50/95 border-rose-300 text-rose-900'
                : offlineMapReady
                ? 'bg-emerald-50/90 border-emerald-300 text-emerald-800'
                : 'bg-amber-50/95 border-amber-300 text-amber-900'
            }`}
          >
            <div
              className={`whitespace-nowrap px-1.5 py-0.5 font-sports font-semibold leading-none truncate ${
                basemapError
                  ? 'text-[9px]'
                  : offlineMapReady
                  ? 'text-[8px] font-bold uppercase tracking-wider'
                  : 'text-[8px]'
              }`}
            >
              {basemapError
                ? basemapError
                : offlineMapReady
                ? `${activePackName || 'Offline'} map`
                : 'World overview'}
            </div>
          </div>
        )}
      </div>

      {/* Floating Map Controls: Details, Heading mode, Locate/Fit, Zoom */}
      <div className="absolute bottom-2 right-2 flex flex-col gap-1.5 z-[400] items-end">
        <button
          type="button"
          disabled={!offlineMapReady}
          onClick={() => {
            setMapDetails(prev => {
              const next = !prev;
              saveMapDetailsPref(next);
              return next;
            });
          }}
          className={`w-7 h-7 rounded-lg shadow border flex items-center justify-center active:scale-95 transition-transform ${
            !offlineMapReady
              ? 'bg-zinc-400/80 text-zinc-200 border-zinc-300 opacity-50'
              : mapDetails
              ? 'bg-emerald-600 text-white border-emerald-400'
              : 'bg-white/95 text-zinc-800 border-zinc-300'
          }`}
          title={
            offlineMapReady
              ? mapDetails
                ? 'Map details on (denser labels/POIs)'
                : 'Map details off'
              : 'Details need an offline country map'
          }
        >
          <Layers className="w-3.5 h-3.5" />
        </button>
        <span className="text-[6px] font-sports font-bold px-1 py-px rounded bg-zinc-900/90 text-white border border-white/40 uppercase leading-none">
          {mapDetails && offlineMapReady ? 'DET' : 'MIN'}
        </span>

        <button
          onClick={handleToggleHeadingUp}
          className="relative w-7 h-7 rounded-lg bg-zinc-900/95 shadow border border-zinc-300 flex items-center justify-center active:scale-95 transition-transform"
          title={headingUpMode ? 'Heading Up (tap for North Up)' : 'North Up (tap for Heading Up)'}
        >
          <div
            className="w-full h-full flex flex-col items-center justify-center transition-transform duration-300"
            style={{ transform: headingUpMode ? `rotate(${-effectiveHeading}deg)` : 'rotate(0deg)' }}
          >
            <div className="w-0 h-0 border-x-[3px] border-x-transparent border-b-[5px] border-b-red-500" />
            <div className="w-0 h-0 border-x-[3px] border-x-transparent border-t-[5px] border-t-zinc-200" />
          </div>
          <span className="absolute text-[6px] font-bold text-white top-0 leading-none">N</span>
        </button>
        <span className="text-[6px] font-sports font-bold px-1 py-px rounded bg-zinc-900/90 text-white border border-white/40 uppercase leading-none">
          {headingUpMode ? 'HDG' : 'N-UP'}
        </span>

        {routePoints && routePoints.length > 1 ? (
          <button
            onClick={handleFitRoute}
            className="w-7 h-7 bg-white/95 text-zinc-800 font-bold text-xs rounded-lg shadow flex items-center justify-center hover:bg-white transition-colors border border-zinc-300"
            title="Fit Route Path"
          >
            <MapIcon className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            onClick={handleLocateMe}
            className="w-7 h-7 bg-blue-50 text-blue-600 font-bold text-xs rounded-lg shadow flex items-center justify-center hover:bg-blue-100 transition-colors border border-blue-300"
            title="Snap to My Location"
          >
            <MapPin className="w-3.5 h-3.5" />
          </button>
        )}

        <div className="flex flex-col gap-1">
          <button
            onClick={() => {
              if (mapInstanceRef.current) {
                mapInstanceRef.current.zoomIn();
                mapInstanceRef.current.invalidateSize();
              }
            }}
            className="w-7 h-7 bg-white/95 text-zinc-800 font-bold text-xs rounded-lg shadow flex items-center justify-center hover:bg-white active:scale-95 transition-transform border border-zinc-300"
            title="Zoom In"
          >
            +
          </button>
          <button
            onClick={() => {
              if (mapInstanceRef.current) {
                mapInstanceRef.current.zoomOut();
                mapInstanceRef.current.invalidateSize();
              }
            }}
            className="w-7 h-7 bg-white/95 text-zinc-800 font-bold text-xs rounded-lg shadow flex items-center justify-center hover:bg-white active:scale-95 transition-transform border border-zinc-300"
            title="Zoom Out"
          >
            −
          </button>
        </div>
      </div>
    </div>
  );
};
