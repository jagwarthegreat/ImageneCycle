import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { RoutePoint } from '../types/cycling';
import { createCachedTileLayer } from '../utils/tileCache';
import { Crosshair, Map as MapIcon, Compass as CompassIcon, MapPin } from 'lucide-react';

interface GpsMapViewProps {
  currentPoint: RoutePoint;
  routePoints?: RoutePoint[];
  heading: number;
  isDarkMode?: boolean;
  liveBreadcrumbs?: { lat: number; lng: number }[];
  routeName?: string;
  onLocateMe?: () => void;
  batterySaver?: boolean;
}

export const GpsMapView: React.FC<GpsMapViewProps> = ({
  currentPoint,
  routePoints = [],
  heading,
  isDarkMode = false,
  liveBreadcrumbs = [],
  routeName,
  onLocateMe,
  batterySaver = false
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const polylineBorderRef = useRef<L.Polyline | null>(null);
  const polylineCoreRef = useRef<L.Polyline | null>(null);
  const breadcrumbPolylineRef = useRef<L.Polyline | null>(null);
  const chevronsRef = useRef<L.LayerGroup | null>(null);
  const endpointsRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const hasCenteredInitiallyRef = useRef<boolean>(false);
  const pendingBreadcrumbsRef = useRef<{ lat: number; lng: number }[] | null>(null);
  const breadcrumbRafRef = useRef<number | null>(null);
  const batterySaverRef = useRef(batterySaver);
  batterySaverRef.current = batterySaver;

  // Map Navigation Modes (Matching real-world Magene C706 behavior)
  const [autoCenter, setAutoCenter] = useState<boolean>(true);
  const [headingUpMode, setHeadingUpMode] = useState<boolean>(true); // Default: Heading-Up / Course-Up

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
        setAutoCenter(false);
      });

      // Primary Tile Layer with CacheStorage Caching for offline & intermittent rides
      const tileUrl = isDarkMode
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

      const tileLayer = createCachedTileLayer(tileUrl, {
        maxZoom: 19,
        subdomains: isDarkMode ? 'abcd' : 'abc'
      }).addTo(map);

      tileLayerRef.current = tileLayer;

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

      // 2. Draw Route Polyline Core (Bright Yellow Core as in Magene C706)
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
              <svg id="gps-heading-needle" style="width: 15px; height: 15px; color: #2563eb; transform: rotate(0deg); transition: transform 0.15s linear;" viewBox="0 0 24 24" fill="currentColor">
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

  // Update Position & Heading
  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current) {
      const lat = currentPoint.lat;
      const lng = currentPoint.lng;
      const animate = !batterySaver;

      if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
        markerRef.current.setLatLng([lat, lng]);

        // In Heading-Up mode, the map rotates underneath the rider, so the rider arrow points straight UP (0deg)!
        // In North-Up mode, the map is static, so the arrow rotates by heading!
        const needle = document.getElementById('gps-heading-needle');
        if (needle) {
          needle.style.transform = headingUpMode ? 'rotate(0deg)' : `rotate(${heading}deg)`;
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
  }, [currentPoint.lat, currentPoint.lng, heading, autoCenter, headingUpMode, batterySaver]);

  // Toggle Auto-Center
  const handleToggleAutoCenter = () => {
    const next = !autoCenter;
    setAutoCenter(next);
    if (next && mapInstanceRef.current) {
      const lat = currentPoint.lat;
      const lng = currentPoint.lng;
      if (lat && lng) {
        mapInstanceRef.current.setView([lat, lng], 16, { animate: !batterySaver });
      }
    }
  };

  // Toggle Map Orientation (Heading Up vs North Up)
  const handleToggleHeadingUp = () => {
    setHeadingUpMode(prev => !prev);
  };

  const handleFitRoute = () => {
    setAutoCenter(false);
    if (mapInstanceRef.current && polylineCoreRef.current && routePoints && routePoints.length > 1) {
      mapInstanceRef.current.fitBounds(polylineCoreRef.current.getBounds(), {
        padding: [25, 25],
        maxZoom: 16
      });
      mapInstanceRef.current.invalidateSize();
    }
  };

  const handleLocateMe = () => {
    setAutoCenter(true);
    if (mapInstanceRef.current && currentPoint.lat && currentPoint.lng) {
      mapInstanceRef.current.setView([currentPoint.lat, currentPoint.lng], 16, { animate: !batterySaver });
    }
    onLocateMe?.();
  };

  return (
    <div className="relative w-full h-full min-h-[160px] bg-[#e5e9ec] overflow-hidden select-none isolate z-0">
      
      {/* ROTATING MAP CONTAINER (Matching real-world Magene C706 Heading-Up rotation) */}
      <div
        className={`w-[160%] h-[160%] -left-[30%] -top-[30%] absolute ${batterySaver ? '' : 'transition-transform duration-300 ease-out'}`}
        style={{
          transform: headingUpMode ? `rotate(${-heading}deg)` : 'rotate(0deg)',
          transformOrigin: 'center center'
        }}
      >
        <div
          ref={mapContainerRef}
          className="w-full h-full"
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      {/* Street Name / Sector Label (Fixed Overlay) */}
      <div className="absolute top-2 left-3 bg-white/95 backdrop-blur-xs px-2.5 py-1 rounded-lg text-[11px] font-bold text-zinc-800 shadow-sm border border-zinc-200 z-[400] flex items-center gap-1.5 max-w-[210px]">
        <span className={`w-2 h-2 rounded-full bg-blue-600 shrink-0 ${batterySaver ? '' : 'animate-pulse'}`} />
        <span className="truncate">
          {routeName || (currentPoint.lat ? `${currentPoint.lat.toFixed(4)}°, ${currentPoint.lng.toFixed(4)}°` : 'Current Location')}
        </span>
      </div>

      {/* Scale Indicator */}
      <div className="absolute bottom-2 left-3 pointer-events-none flex flex-col items-start z-[400]">
        <span className="text-[10px] font-digital font-bold text-zinc-800 leading-none drop-shadow-xs">
          200m
        </span>
        <div className="w-12 h-1.5 border-b-2 border-l-2 border-r-2 border-zinc-900 mt-0.5 bg-white/60" />
      </div>

      {/* ROTATING COMPASS WIDGET - Tap to toggle Heading-Up vs North-Up */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 z-[400]">
        <button
          onClick={handleToggleHeadingUp}
          className="relative w-10 h-10 rounded-full bg-zinc-900/95 shadow-lg border-2 border-white flex items-center justify-center backdrop-blur-xs active:scale-95 transition-transform"
          title={headingUpMode ? 'Heading Up (Tap for North Up)' : 'North Up (Tap for Heading Up)'}
        >
          {/* Compass Needle: in Heading-Up mode, points to magnetic North relative to heading */}
          <div
            className="w-full h-full flex flex-col items-center justify-center transition-transform duration-300"
            style={{ transform: headingUpMode ? `rotate(${-heading}deg)` : 'rotate(0deg)' }}
          >
            {/* North Point (Red) */}
            <div className="w-0 h-0 border-x-3.5 border-x-transparent border-b-[8px] border-b-red-500" />
            {/* South Point (White) */}
            <div className="w-0 h-0 border-x-3.5 border-x-transparent border-t-[8px] border-t-zinc-200" />
          </div>
          <span className="absolute text-[8px] font-bold text-white top-0.5 leading-none">N</span>
        </button>

        {/* Heading Mode Label */}
        <span className="text-[8px] font-sports font-bold px-1.5 py-0.5 rounded bg-zinc-900/90 text-white border border-white/40 shadow-xs uppercase">
          {headingUpMode ? 'HDG UP' : 'NORTH UP'}
        </span>
      </div>

      {/* Floating Map Controls: Auto-Center Toggle, Locate Me / Fit Route, Zoom */}
      <div className="absolute bottom-2 right-2 flex flex-col gap-1.5 z-[400]">
        {/* AUTO-CENTER TOGGLE BUTTON */}
        <button
          onClick={handleToggleAutoCenter}
          className={`h-7 px-2 rounded-lg shadow-md flex items-center justify-center gap-1 font-sports font-bold text-[11px] transition-all border ${
            autoCenter 
              ? 'bg-blue-600 text-white border-blue-500 ring-2 ring-blue-500/30' 
              : 'bg-white/95 text-zinc-700 border-zinc-300 hover:bg-white'
          }`}
          title={autoCenter ? 'Auto-Center is ON (Tracking Rider)' : 'Auto-Center is OFF (Tap to Center)'}
        >
          <Crosshair className={`w-3.5 h-3.5 ${autoCenter ? 'text-white' : 'text-zinc-500'}`} />
          <span>{autoCenter ? 'CENTER ON' : 'CENTER'}</span>
        </button>

        {/* If active route: Fit Entire Route; Otherwise: Locate My Current Position */}
        {routePoints && routePoints.length > 1 ? (
          <button
            onClick={handleFitRoute}
            className="w-7 h-7 self-end bg-white/95 text-zinc-800 font-bold text-xs rounded-lg shadow flex items-center justify-center hover:bg-white transition-colors border border-zinc-300"
            title="Fit Route Path"
          >
            <MapIcon className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            onClick={handleLocateMe}
            className="w-7 h-7 self-end bg-blue-50 text-blue-600 font-bold text-xs rounded-lg shadow flex items-center justify-center hover:bg-blue-100 transition-colors border border-blue-300"
            title="Snap to My Location"
          >
            <MapPin className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Zoom In / Out */}
        <div className="flex flex-col gap-1 self-end">
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
