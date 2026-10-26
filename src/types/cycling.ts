export interface RoutePoint {
  lat: number;
  lng: number;
  ele: number;
  distFromStart: number; // meters from route start
  grade: number; // percentage (-10 to +25)
  heading?: number; // bearing in degrees
}

export interface ProfileSlice {
  distStart: number;
  distEnd: number;
  eleStart: number;
  eleEnd: number;
  grade: number;
  color: string;
}

export type ClimbCategory = '4' | '3' | '2' | '1' | 'HC' | 'Uncategorized';

export interface ClimbSegment {
  id: string;
  name: string;
  startDist: number; // meters from route start
  endDist: number; // meters from route start
  totalLength: number; // meters
  startEle: number; // meters
  topEle: number; // meters
  totalElevationGain: number; // meters
  avgGrade: number; // %
  maxGrade: number; // %
  category: ClimbCategory;
  points: RoutePoint[];
  profileSlices: ProfileSlice[];
}

/** OSRM turn-by-turn step along a planned route */
export interface RouteTurn {
  index: number;
  instruction: string;
  distanceMeters: number;
  name: string;
  maneuverType: string;
  modifier?: string;
  location: { lat: number; lng: number };
  distFromRouteStart: number;
}

/** Pre-fetched OSRM alternate corridor (geometry + TBT) for offline off-route snap */
export interface RouteAlternative {
  id: string;
  points: RoutePoint[];
  turns: RouteTurn[];
  totalDistance: number;
}

export interface RouteData {
  id: string;
  name: string;
  location: string;
  totalDistance: number; // meters
  totalElevationGain: number; // meters
  points: RoutePoint[];
  climbs: ClimbSegment[];
  turns?: RouteTurn[];
  /** Alternate OSRM routes saved at create-time for offline TBT snap */
  alternatives?: RouteAlternative[];
  /** Explicit pins used at create: [start, ...vias, dest] */
  waypoints?: { lat: number; lng: number }[];
  startLat?: number;
  startLng?: number;
  endLat?: number;
  endLng?: number;
}

export interface ClimbProLiveState {
  isInClimb: boolean;
  currentClimbIndex: number; // 1-indexed, e.g. Climb 2
  totalClimbsCount: number; // e.g. of 4
  currentClimb: ClimbSegment | null;
  nextClimb: ClimbSegment | null;
  distToNextClimb: number; // meters
  distRemainingToTop: number; // meters
  remAscent: number; // meters
  avgGradeRemaining: number; // %
  currentGrade: number; // instantaneous %
  climbProgressPct: number; // 0 - 100
  vam: number; // Vertical Ascent in m/hour
}

export interface BreadcrumbPoint {
  lat: number;
  lng: number;
  ele?: number;
  time?: number;
  speed?: number;
  power?: number | null;
  cadence?: number | null;
  heartRate?: number | null;
  distance?: number;
  /** Ambient temp °C for GPX gpxtpx:atemp */
  temperature?: number;
  /** Trail continuity: weak GPS / stitch segment (omit or good = solid trail) */
  quality?: 'good' | 'weak' | 'stitch';
}

export interface ActiveRideSession {
  id: string; // Unique session ID
  startedAt: number; // Unix timestamp
  updatedAt: number;
  status: 'recording' | 'paused' | 'completed';
  routeName: string;
  routeId: string;
  ridingTime: number; // Moving time in seconds
  saddleTime: number; // Total elapsed time in seconds
  distanceMeters: number;
  totalAscentMeters: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  currentElevation: number;
  currentGrade: number;
  vam: number;
  calories: number;
  breadcrumbs: BreadcrumbPoint[];
}

export interface RideMetrics {
  timeElapsed: number; // seconds (moving riding time)
  ridingTime: number; // seconds moving
  saddleTime: number; // total elapsed seconds from session start
  distanceTraveled: number; // meters
  speed: number; // km/h
  avgSpeed: number; // km/h
  maxSpeed: number; // km/h
  currentElevation: number; // meters
  totalAscent: number; // meters
  currentGrade: number; // %
  heartRate: number | null; // bpm or null if not connected
  cadence: number | null; // rpm or null if not connected
  power: number | null; // watts or null if not connected
  powerZone?: number | null; // Coggan Zone 1-7
  powerZoneName?: string | null; // e.g. 'Z2 Endurance'
  powerZoneColor?: string | null; // e.g. '#3b82f6'
  ftp: number; // Functional Threshold Power in Watts
  hrZone?: number | null; // Karvonen Zone 1-5
  hrZoneName?: string | null;
  hrZoneColor?: string | null;
  maxHeartRate?: number;
  restingHeartRate?: number;
  isAutoPaused?: boolean;
  calories: number; // kcal
  vam: number; // m/h
  currentLat: number;
  currentLng: number;
  currentHeading: number;
  activeSessionId?: string | null;
}

export type SensorProtocol = 'ble' | 'ant';

export interface BleDeviceStatus {
  hrmConnected: boolean;
  cscConnected: boolean;
  powerConnected: boolean;
  hrmDeviceName?: string;
  cscDeviceName?: string;
  powerDeviceName?: string;
  /** Active radio for each role (exclusive BLE vs ANT+) */
  hrmProtocol?: SensorProtocol | null;
  cscProtocol?: SensorProtocol | null;
  powerProtocol?: SensorProtocol | null;
}

export interface GpsStatus {
  hasFix: boolean;
  accuracy: number; // meters
  quality: 'GPS 3D' | 'GPS 2D' | 'Weak' | 'Searching...' | 'Standby' | 'Error';
  errorMessage?: string;
}

export interface AutoLapAlert {
  lapNumber: number;
  lapDistanceMeters: number;
  splitTimeSeconds: number;
  avgSpeedKmh: number;
  timestamp: number;
}

export interface RideHistoryItem {
  id: string;
  timestamp: number;
  startedAt?: number;
  dateFormatted: string;
  routeName: string;
  timeElapsed: number; // seconds
  ridingTimeSeconds?: number;
  saddleTimeSeconds?: number;
  distanceMeters: number;
  totalAscentMeters: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  calories: number;
  avgPowerWatts?: number | null;
  avgCadenceRpm?: number | null;
  avgHeartRateBpm?: number | null;
  breadcrumbs?: BreadcrumbPoint[];
}
