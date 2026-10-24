/**
 * Offscreen route + puck PNG for notification BigPicture (when FGS supports it).
 * Caller: recordingForeground.syncRecordingNotification (~every 20s).
 * No prior routeSnapshot module (Glob empty).
 */

export interface RouteSnapshotPoint {
  lat: number;
  lng: number;
}

export interface RouteSnapshotOptions {
  breadcrumbs: RouteSnapshotPoint[];
  headingDeg?: number;
  size?: number;
}

/** Returns data URL (image/png) or null if canvas unavailable / too few points. */
export function renderRouteSnapshot(opts: RouteSnapshotOptions): string | null {
  if (typeof document === 'undefined') return null;
  const pts = opts.breadcrumbs;
  if (!pts.length) return null;

  const size = opts.size ?? 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  let minLat = pts[0].lat;
  let maxLat = pts[0].lat;
  let minLng = pts[0].lng;
  let maxLng = pts[0].lng;
  for (const p of pts) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  const pad = 0.00015;
  minLat -= pad;
  maxLat += pad;
  minLng -= pad;
  maxLng += pad;
  const dLat = Math.max(maxLat - minLat, 0.0002);
  const dLng = Math.max(maxLng - minLng, 0.0002);

  const toXY = (lat: number, lng: number) => {
    const x = ((lng - minLng) / dLng) * (size - 40) + 20;
    const y = (1 - (lat - minLat) / dLat) * (size - 40) + 20;
    return { x, y };
  };

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => {
    const { x, y } = toXY(p.lat, p.lng);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const last = pts[pts.length - 1];
  const { x, y } = toXY(last.lat, last.lng);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2563eb';
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fill();

  const heading = opts.headingDeg ?? 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((heading * Math.PI) / 180);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(6, 8);
  ctx.lineTo(0, 4);
  ctx.lineTo(-6, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
