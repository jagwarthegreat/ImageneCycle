import { RouteData, RoutePoint } from '../types/cycling';
import { detectClimbsFromPoints, generateProfileSlices } from '../utils/climbProEngine';

/**
 * Helper to generate synthetic route points between waypoints with elevation and curvature.
 */
function generateCurvedPoints(
  waypoints: { lat: number; lng: number; ele: number }[],
  totalPoints: number = 300
): RoutePoint[] {
  const points: RoutePoint[] = [];
  let runningDist = 0;

  for (let w = 0; w < waypoints.length - 1; w++) {
    const start = waypoints[w];
    const end = waypoints[w + 1];
    const segments = Math.floor(totalPoints / (waypoints.length - 1));

    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      // Add slight serpentine curvature for realistic roads
      const curveOffset = Math.sin(t * Math.PI) * 0.0008 * (w % 2 === 0 ? 1 : -1);
      
      const lat = start.lat + (end.lat - start.lat) * t + curveOffset;
      const lng = start.lng + (end.lng - start.lng) * t + (curveOffset * 0.5);
      
      // S-curve elevation profile
      const ele = start.ele + (end.ele - start.ele) * (t * t * (3 - 2 * t));

      let dDist = 0;
      let heading = 0;
      if (points.length > 0) {
        const prev = points[points.length - 1];
        // Approximate distance in meters
        const dLat = (lat - prev.lat) * 111320;
        const dLng = (lng - prev.lng) * 111320 * Math.cos((lat * Math.PI) / 180);
        dDist = Math.sqrt(dLat * dLat + dLng * dLng);
        runningDist += dDist;

        heading = (Math.atan2(dLng, dLat) * 180) / Math.PI;
        if (heading < 0) heading += 360;
      }

      const prevPt = points.length > 0 ? points[points.length - 1] : null;
      const grade = prevPt && dDist > 0 ? ((ele - prevPt.ele) / dDist) * 100 : 0;

      points.push({
        lat,
        lng,
        ele: Math.round(ele * 10) / 10,
        distFromStart: Math.round(runningDist),
        grade: Math.round(grade * 10) / 10,
        heading: Math.round(heading)
      });
    }
  }

  return points;
}

/**
 * Route 1: Arsicana Hill Climb
 * Screenshot state corresponds to:
 * Time: 00:02:15
 * Dist Remain: 1.08 km
 * Rem. Ascent: 79 m
 * Avg Grade Remain: 5.5%
 * Instant Grade: 4.0%
 * Elevation: 187 m
 * Speed: 18.9 km/h
 */
const arsicanaWaypoints = [
  { lat: 42.1245, lng: 12.3852, ele: 155 }, // Route start
  { lat: 42.1298, lng: 12.3875, ele: 172 },
  { lat: 42.1330, lng: 12.3892, ele: 187 }, // Exact screenshot snapshot point (~1.08km to summit)
  { lat: 42.1375, lng: 12.3920, ele: 215 },
  { lat: 42.1415, lng: 12.3942, ele: 242 },
  { lat: 42.1450, lng: 12.3955, ele: 266 }  // Arsicana Summit
];

const arsicanaPoints = generateCurvedPoints(arsicanaWaypoints, 250);

const arsicanaRoute: RouteData = {
  id: 'arsicana-climb',
  name: 'Via Arsicana Hill Climb',
  location: 'Lazio, Italy (Screenshot Route)',
  totalDistance: arsicanaPoints[arsicanaPoints.length - 1].distFromStart,
  totalElevationGain: 111,
  points: arsicanaPoints,
  climbs: [
    {
      id: 'climb-arsicana-1',
      name: 'Via Arsicana Ascent',
      startDist: 350,
      endDist: arsicanaPoints[arsicanaPoints.length - 1].distFromStart,
      totalLength: arsicanaPoints[arsicanaPoints.length - 1].distFromStart - 350,
      startEle: 165,
      topEle: 266,
      totalElevationGain: 101,
      avgGrade: 5.4,
      maxGrade: 8.5,
      category: '4',
      points: arsicanaPoints.filter(p => p.distFromStart >= 350),
      profileSlices: generateProfileSlices(arsicanaPoints.filter(p => p.distFromStart >= 350))
    }
  ]
};

/**
 * Route 2: Alpe d'Huez (Iconic 21 Hairpin Bends HC Climb)
 */
const alpeDhuezWaypoints = [
  { lat: 45.0538, lng: 6.0381, ele: 720 },  // Le Bourg d'Oisans
  { lat: 45.0572, lng: 6.0465, ele: 860 },  // Turn 21 (steep ramp)
  { lat: 45.0610, lng: 6.0520, ele: 1010 }, // Turn 17
  { lat: 45.0645, lng: 6.0585, ele: 1180 }, // Turn 12
  { lat: 45.0700, lng: 6.0620, ele: 1390 }, // Turn 7 (Dutch Corner)
  { lat: 45.0780, lng: 6.0680, ele: 1620 }, // Turn 3
  { lat: 45.0905, lng: 6.0710, ele: 1830 }  // Alpe d'Huez Summit
];
const alpePoints = generateCurvedPoints(alpeDhuezWaypoints, 350);
const alpeRoute: RouteData = {
  id: 'alpe-dhuez',
  name: "Alpe d'Huez 21 Virages",
  location: 'French Alps (HC Climb)',
  totalDistance: alpePoints[alpePoints.length - 1].distFromStart,
  totalElevationGain: 1110,
  points: alpePoints,
  climbs: [
    {
      id: 'climb-alpe-1',
      name: "Alpe d'Huez HC Climb",
      startDist: 200,
      endDist: alpePoints[alpePoints.length - 1].distFromStart,
      totalLength: alpePoints[alpePoints.length - 1].distFromStart - 200,
      startEle: 730,
      topEle: 1830,
      totalElevationGain: 1100,
      avgGrade: 8.1,
      maxGrade: 13.5,
      category: 'HC',
      points: alpePoints.filter(p => p.distFromStart >= 200),
      profileSlices: generateProfileSlices(alpePoints.filter(p => p.distFromStart >= 200))
    }
  ]
};

/**
 * Route 3: Sa Calobra / Coll dels Reis (Mallorca Serpentine Wall)
 */
const saCalobraWaypoints = [
  { lat: 39.8512, lng: 2.7985, ele: 15 },   // Port de Sa Calobra (Sea level)
  { lat: 39.8450, lng: 2.8050, ele: 180 },  // Lower canyon
  { lat: 39.8390, lng: 2.8120, ele: 340 },  // Mid cliff road
  { lat: 39.8320, lng: 2.8180, ele: 520 },  // Tie knot loop (Nus de sa Corbata)
  { lat: 39.8270, lng: 2.8220, ele: 682 }   // Coll dels Reis Summit
];
const saCalobraPoints = generateCurvedPoints(saCalobraWaypoints, 300);
const saCalobraRoute: RouteData = {
  id: 'sa-calobra',
  name: 'Sa Calobra (Coll dels Reis)',
  location: 'Mallorca, Spain',
  totalDistance: saCalobraPoints[saCalobraPoints.length - 1].distFromStart,
  totalElevationGain: 668,
  points: saCalobraPoints,
  climbs: [
    {
      id: 'climb-calobra-1',
      name: 'Sa Calobra Wall',
      startDist: 150,
      endDist: saCalobraPoints[saCalobraPoints.length - 1].distFromStart,
      totalLength: saCalobraPoints[saCalobraPoints.length - 1].distFromStart - 150,
      startEle: 20,
      topEle: 682,
      totalElevationGain: 662,
      avgGrade: 7.1,
      maxGrade: 11.8,
      category: '1',
      points: saCalobraPoints.filter(p => p.distFromStart >= 150),
      profileSlices: generateProfileSlices(saCalobraPoints.filter(p => p.distFromStart >= 150))
    }
  ]
};

/**
 * Route 4: Rolling Stage with 3 Consecutive Climbs (Cat 4, Cat 3, Cat 2)
 * Perfect for observing ClimbPro transitioning from one climb to the next!
 */
const tripleClimbWaypoints = [
  { lat: 46.1000, lng: 8.5000, ele: 210 },
  { lat: 46.1080, lng: 8.5080, ele: 320 }, // Climb 1 top (110m gain)
  { lat: 46.1150, lng: 8.5140, ele: 230 }, // Valley floor 1
  { lat: 46.1260, lng: 8.5250, ele: 490 }, // Climb 2 top (260m gain)
  { lat: 46.1340, lng: 8.5320, ele: 310 }, // Valley floor 2
  { lat: 46.1480, lng: 8.5480, ele: 820 }, // Climb 3 top (510m gain)
  { lat: 46.1550, lng: 8.5550, ele: 790 }
];
const triplePoints = generateCurvedPoints(tripleClimbWaypoints, 450);
const tripleClimbsDetected = detectClimbsFromPoints(triplePoints);
const tripleClimbRoute: RouteData = {
  id: 'triple-climb-stage',
  name: 'Alpine 3-Pass Stage (Climbs 1/3, 2/3, 3/3)',
  location: 'Ticino, Switzerland',
  totalDistance: triplePoints[triplePoints.length - 1].distFromStart,
  totalElevationGain: 880,
  points: triplePoints,
  climbs: tripleClimbsDetected.length >= 2 ? tripleClimbsDetected : [
    {
      id: 'climb-t1',
      name: 'Col de Monte (1/3)',
      startDist: 400,
      endDist: 1800,
      totalLength: 1400,
      startEle: 215,
      topEle: 320,
      totalElevationGain: 105,
      avgGrade: 7.5,
      maxGrade: 10.2,
      category: '4',
      points: triplePoints.filter(p => p.distFromStart >= 400 && p.distFromStart <= 1800),
      profileSlices: generateProfileSlices(triplePoints.filter(p => p.distFromStart >= 400 && p.distFromStart <= 1800))
    },
    {
      id: 'climb-t2',
      name: 'Passo della Forca (2/3)',
      startDist: 2600,
      endDist: 5400,
      totalLength: 2800,
      startEle: 235,
      topEle: 490,
      totalElevationGain: 255,
      avgGrade: 9.1,
      maxGrade: 13.0,
      category: '3',
      points: triplePoints.filter(p => p.distFromStart >= 2600 && p.distFromStart <= 5400),
      profileSlices: generateProfileSlices(triplePoints.filter(p => p.distFromStart >= 2600 && p.distFromStart <= 5400))
    },
    {
      id: 'climb-t3',
      name: 'Cima Bella Summit (3/3)',
      startDist: 6400,
      endDist: 10800,
      totalLength: 4400,
      startEle: 315,
      topEle: 820,
      totalElevationGain: 505,
      avgGrade: 11.4,
      maxGrade: 16.5,
      category: '2',
      points: triplePoints.filter(p => p.distFromStart >= 6400 && p.distFromStart <= 10800),
      profileSlices: generateProfileSlices(triplePoints.filter(p => p.distFromStart >= 6400 && p.distFromStart <= 10800))
    }
  ]
};

export const PRESET_ROUTES: RouteData[] = [
  arsicanaRoute,
  alpeRoute,
  saCalobraRoute,
  tripleClimbRoute
];

/**
 * GPX XML parser for custom user route uploads.
 */
export function parseGpxRoute(gpxString: string, filename: string): RouteData {
  const parser = new DOMParser();
  const xml = parser.parseFromString(gpxString, 'text/xml');
  const trkpts = xml.querySelectorAll('trkpt, rtept');

  if (!trkpts || trkpts.length === 0) {
    throw new Error('No GPS track points found in GPX file.');
  }

  const rawWaypoints: { lat: number; lng: number; ele: number }[] = [];
  trkpts.forEach(pt => {
    const lat = parseFloat(pt.getAttribute('lat') || '0');
    const lng = parseFloat(pt.getAttribute('lng') || '0');
    const eleNode = pt.querySelector('ele');
    const ele = eleNode ? parseFloat(eleNode.textContent || '0') : 0;
    if (!isNaN(lat) && !isNaN(lng)) {
      rawWaypoints.push({ lat, lng, ele: isNaN(ele) ? 0 : ele });
    }
  });

  const points: RoutePoint[] = [];
  let runningDist = 0;
  let totalGain = 0;

  for (let i = 0; i < rawWaypoints.length; i++) {
    const curr = rawWaypoints[i];
    let dDist = 0;
    let heading = 0;

    if (i > 0) {
      const prev = rawWaypoints[i - 1];
      const dLat = (curr.lat - prev.lat) * 111320;
      const dLng = (curr.lng - prev.lng) * 111320 * Math.cos((curr.lat * Math.PI) / 180);
      dDist = Math.sqrt(dLat * dLat + dLng * dLng);
      runningDist += dDist;

      const dEle = curr.ele - prev.ele;
      if (dEle > 0) totalGain += dEle;

      heading = (Math.atan2(dLng, dLat) * 180) / Math.PI;
      if (heading < 0) heading += 360;
    }

    const prevPt = points.length > 0 ? points[points.length - 1] : null;
    const grade = prevPt && dDist > 0 ? ((curr.ele - prevPt.ele) / dDist) * 100 : 0;

    points.push({
      lat: curr.lat,
      lng: curr.lng,
      ele: Math.round(curr.ele * 10) / 10,
      distFromStart: Math.round(runningDist),
      grade: Math.round(grade * 10) / 10,
      heading: Math.round(heading)
    });
  }

  const detectedClimbs = detectClimbsFromPoints(points);

  return {
    id: `custom-${Date.now()}`,
    name: filename.replace(/\.[^/.]+$/, ''),
    location: 'Imported Custom Route',
    totalDistance: Math.round(runningDist),
    totalElevationGain: Math.round(totalGain),
    points,
    climbs: detectedClimbs
  };
}
