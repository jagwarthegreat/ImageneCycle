/**
 * Ride Data Exporter for Magene C706
 * Generates standard GPX 1.1 for direct Strava / Garmin Connect / TrainingPeaks upload
 * and JSON telemetry file for offline analytics.
 */

export interface ExportableRideData {
  routeName: string;
  startedAt?: number;
  timeElapsed: number;
  ridingTimeSeconds: number;
  saddleTimeSeconds?: number;
  distanceMeters: number;
  totalAscentMeters: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  calories?: number;
  avgPowerWatts?: number | null;
  breadcrumbs: { lat: number; lng: number; ele?: number; time?: number }[];
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}

/**
 * Builds a valid GPX 1.1 XML string compliant with Strava, Garmin Connect, and TrainingPeaks
 */
export function buildGpxXml(ride: ExportableRideData): string {
  const startTime = new Date(ride.startedAt || (Date.now() - (ride.ridingTimeSeconds || 60) * 1000));
  const startTimeIso = startTime.toISOString();
  const safeName = (ride.routeName || 'Cycling Activity').replace(/[<>&'"]/g, '');

  let trkptsXml = '';
  const pts = ride.breadcrumbs && ride.breadcrumbs.length > 0 ? ride.breadcrumbs : [];

  if (pts.length > 0) {
    const totalPts = pts.length;
    const durationMs = (ride.ridingTimeSeconds || 1) * 1000;
    const intervalMs = durationMs / Math.max(1, totalPts);

    pts.forEach((pt, idx) => {
      const ptTime = new Date(startTime.getTime() + idx * intervalMs).toISOString();
      const ele = pt.ele !== undefined ? pt.ele : 150;
      trkptsXml += `      <trkpt lat="${pt.lat.toFixed(6)}" lon="${pt.lng.toFixed(6)}">
        <ele>${ele.toFixed(1)}</ele>
        <time>${ptTime}</time>
      </trkpt>\n`;
    });
  } else {
    // Fallback single point if no track points recorded
    trkptsXml = `      <trkpt lat="0.0" lon="0.0">
        <ele>0</ele>
        <time>${startTimeIso}</time>
      </trkpt>\n`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Magene C706 Cycling Computer"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${safeName}</name>
    <time>${startTimeIso}</time>
    <desc>Recorded on Magene C706 Cycling Computer. Distance: ${(ride.distanceMeters / 1000).toFixed(2)} km, Elev Gain: ${Math.round(ride.totalAscentMeters)}m, Avg Speed: ${ride.avgSpeedKmh.toFixed(1)} km/h</desc>
  </metadata>
  <trk>
    <name>${safeName}</name>
    <type>cycling</type>
    <trkseg>
${trkptsXml}    </trkseg>
  </trk>
</gpx>`;
}

/**
 * Exports and downloads the ride as a Strava-ready GPX file
 */
export function exportRideToGpx(ride: ExportableRideData) {
  const gpxContent = buildGpxXml(ride);
  const cleanName = (ride.routeName || 'ride')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_');
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `magene_c706_${cleanName}_${dateStr}.gpx`;
  downloadFile(gpxContent, filename, 'application/gpx+xml');
}

/**
 * Exports and downloads full JSON telemetry including speed, distance, elevation, and breadcrumbs
 */
export function exportRideToJson(ride: ExportableRideData) {
  const payload = {
    device: 'Magene C706 Cycling Computer',
    version: '1.0',
    exportedAt: new Date().toISOString(),
    activity: {
      title: ride.routeName,
      startedAt: ride.startedAt ? new Date(ride.startedAt).toISOString() : new Date().toISOString(),
      summary: {
        ridingTimeSeconds: ride.ridingTimeSeconds,
        saddleTimeSeconds: ride.saddleTimeSeconds || ride.ridingTimeSeconds,
        distanceMeters: ride.distanceMeters,
        distanceKm: Math.round((ride.distanceMeters / 1000) * 100) / 100,
        totalAscentMeters: ride.totalAscentMeters,
        avgSpeedKmh: ride.avgSpeedKmh,
        maxSpeedKmh: ride.maxSpeedKmh,
        calories: ride.calories || Math.round(ride.ridingTimeSeconds * 0.2),
        avgPowerWatts: ride.avgPowerWatts ?? null
      },
      trackpointCount: ride.breadcrumbs?.length || 0,
      breadcrumbs: ride.breadcrumbs || []
    }
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  const cleanName = (ride.routeName || 'ride')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_');
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `magene_c706_${cleanName}_${dateStr}.json`;
  downloadFile(jsonStr, filename, 'application/json');
}

/**
 * Opens Strava's official activity upload page in a new window/tab
 */
export function openStravaUpload() {
  if (typeof window !== 'undefined') {
    window.open('https://www.strava.com/upload/select', '_blank', 'noopener,noreferrer');
  }
}
