/**
 * Ride Data Exporter for ImageneCycle
 * Generates standardized .FIT (Flexible and Interoperable Data Transfer) binary format,
 * standard GPX 1.1 (with Garmin TrackPointExtensions for HR/cadence/power),
 * and JSON telemetry file for offline analytics.
 * Supports direct multipart/form-data upload to Strava API v3.
 */

export interface BreadcrumbPoint {
  lat: number;
  lng: number;
  ele?: number;
  time?: number;
  speed?: number; // km/h
  power?: number | null; // watts
  cadence?: number | null; // rpm
  heartRate?: number | null; // bpm
  distance?: number; // meters
  temperature?: number; // °C → gpxtpx:atemp
}

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
  maxPowerWatts?: number | null;
  avgCadenceRpm?: number | null;
  avgHeartRateBpm?: number | null;
  maxHeartRateBpm?: number | null;
  breadcrumbs: BreadcrumbPoint[];
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, filename);
}

export function downloadBinaryFile(data: Uint8Array, filename: string, mimeType = 'application/octet-stream') {
  const blob = new Blob([data as unknown as BlobPart], { type: mimeType });
  downloadBlob(blob, filename);
}

function downloadBlob(blob: Blob, filename: string) {
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

// ============================================================================
// STANDARDIZED BINARY FIT FILE GENERATOR (FIT Protocol 2.0)
// ============================================================================

/**
 * Standard 16-element nibble CRC lookup table from official Garmin FIT SDK
 */
const FIT_CRC_TABLE = [
  0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
  0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400
];

function updateFitCrc(crc: number, byte: number): number {
  let tmp = FIT_CRC_TABLE[crc & 0x0F];
  crc = (crc >> 4) & 0x0FFF;
  crc = crc ^ tmp ^ FIT_CRC_TABLE[byte & 0x0F];
  tmp = FIT_CRC_TABLE[crc & 0x0F];
  crc = (crc >> 4) & 0x0FFF;
  crc = crc ^ tmp ^ FIT_CRC_TABLE[(byte >> 4) & 0x0F];
  return crc & 0xFFFF;
}

function calculateFitCrc(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let crc = 0;
  for (let i = start; i < end; i++) {
    crc = updateFitCrc(crc, bytes[i]);
  }
  return crc & 0xFFFF;
}

/** FIT epoch offset: 1989-12-31 00:00:00 UTC = 631065600 Unix seconds */
const FIT_EPOCH_OFFSET = 631065600;

function toFitTimestamp(dateMs: number): number {
  const secs = Math.floor(dateMs / 1000);
  return Math.max(0, secs - FIT_EPOCH_OFFSET);
}

class BinaryWriter {
  private buffer: Uint8Array;
  private view: DataView;
  private offset: number = 0;

  constructor(initialSize = 32768) {
    this.buffer = new Uint8Array(initialSize);
    this.view = new DataView(this.buffer.buffer);
  }

  private ensure(bytes: number) {
    if (this.offset + bytes > this.buffer.length) {
      const newBuf = new Uint8Array(Math.max(this.buffer.length * 2, this.buffer.length + bytes + 1024));
      newBuf.set(this.buffer);
      this.buffer = newBuf;
      this.view = new DataView(this.buffer.buffer);
    }
  }

  writeUint8(val: number) {
    this.ensure(1);
    this.view.setUint8(this.offset, val & 0xff);
    this.offset += 1;
  }

  writeUint16(val: number) {
    this.ensure(2);
    this.view.setUint16(this.offset, val & 0xffff, true);
    this.offset += 2;
  }

  writeInt32(val: number) {
    this.ensure(4);
    this.view.setInt32(this.offset, val | 0, true);
    this.offset += 4;
  }

  writeUint32(val: number) {
    this.ensure(4);
    this.view.setUint32(this.offset, val >>> 0, true);
    this.offset += 4;
  }

  writeBytes(bytes: number[] | Uint8Array) {
    this.ensure(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      this.buffer[this.offset + i] = bytes[i];
    }
    this.offset += bytes.length;
  }

  getBytes(): Uint8Array {
    return this.buffer.subarray(0, this.offset);
  }

  get length(): number {
    return this.offset;
  }
}

/**
 * Builds a standardized FIT 2.0 binary file compliant with Strava, Garmin Connect,
 * TrainingPeaks, WKO5, GoldenCheetah, and Intervals.icu.
 *
 * Mapped fields include:
 * - File ID (type: activity, product: ImageneCycle, serial number, time_created)
 * - Device Info (creator device details)
 * - Event messages (Timer Start, Timer Stop)
 * - Record messages (Timestamp, Lat/Long semicircles, Altitude, Speed, Distance,
 *                    Heart Rate, Cadence, Power)
 * - Session message (Total timer time, elapsed time, distance, ascent, calories,
 *                    avg/max speed, avg/max power, avg/max HR, avg cadence, sport: cycling)
 * - Activity message (num_sessions, total_timer_time, stop event)
 * - 14-byte FIT Header + Header CRC + 16-bit File CRC checksum.
 */
export function buildFitBinary(ride: ExportableRideData): Uint8Array {
  const ridingTimeSecs = Math.max(1, ride.ridingTimeSeconds || ride.timeElapsed || 1);
  const saddleTimeSecs = Math.max(ridingTimeSecs, ride.saddleTimeSeconds || ride.timeElapsed || ridingTimeSecs);
  const startTimeMs = ride.startedAt || (Date.now() - ridingTimeSecs * 1000);
  const endTimeMs = startTimeMs + saddleTimeSecs * 1000;

  const fitStartTime = toFitTimestamp(startTimeMs);
  const fitEndTime = toFitTimestamp(endTimeMs);

  const dataWriter = new BinaryWriter(65536);

  // --------------------------------------------------------------------------
  // Message 0: FILE_ID (Global Msg 0, Local Msg 0)
  // --------------------------------------------------------------------------
  // Definition
  dataWriter.writeUint8(0x40); // Def msg, local 0
  dataWriter.writeUint8(0);    // Reserved
  dataWriter.writeUint8(0);    // Architecture: Little Endian
  dataWriter.writeUint16(0);   // Global Msg 0 (file_id)
  dataWriter.writeUint8(5);    // 5 fields
  // Fields: [fieldNum, size, baseType]
  dataWriter.writeBytes([0, 1, 0x00]); // type (enum)
  dataWriter.writeBytes([1, 2, 0x84]); // manufacturer (uint16)
  dataWriter.writeBytes([2, 2, 0x84]); // product (uint16)
  dataWriter.writeBytes([3, 4, 0x8C]); // serial_number (uint32z)
  dataWriter.writeBytes([4, 4, 0x86]); // time_created (uint32)

  // Data
  dataWriter.writeUint8(0x00); // Data msg, local 0
  dataWriter.writeUint8(4);    // type = 4 (activity)
  dataWriter.writeUint16(1);   // manufacturer = 1 (garmin/generic standard)
  dataWriter.writeUint16(706); // product id (legacy ImageneCycle / C706-compatible)
  dataWriter.writeUint32(70600001); // serial_number
  dataWriter.writeUint32(fitStartTime); // time_created

  // --------------------------------------------------------------------------
  // Message 1: DEVICE_INFO (Global Msg 23, Local Msg 1)
  // --------------------------------------------------------------------------
  // Definition
  dataWriter.writeUint8(0x41); // Def msg, local 1
  dataWriter.writeUint8(0);
  dataWriter.writeUint8(0);
  dataWriter.writeUint16(23);  // Global Msg 23 (device_info)
  dataWriter.writeUint8(4);    // 4 fields
  dataWriter.writeBytes([253, 4, 0x86]); // timestamp
  dataWriter.writeBytes([0, 1, 0x02]);   // device_index (creator = 0)
  dataWriter.writeBytes([1, 1, 0x02]);   // device_type (bike computer = 1)
  dataWriter.writeBytes([2, 2, 0x84]);   // manufacturer (1)

  // Data
  dataWriter.writeUint8(0x01); // Data msg, local 1
  dataWriter.writeUint32(fitStartTime);
  dataWriter.writeUint8(0);    // device_index
  dataWriter.writeUint8(1);    // device_type
  dataWriter.writeUint16(1);   // manufacturer

  // --------------------------------------------------------------------------
  // Message 2: EVENT (Global Msg 21, Local Msg 2) - Timer Start
  // --------------------------------------------------------------------------
  // Definition
  dataWriter.writeUint8(0x42); // Def msg, local 2
  dataWriter.writeUint8(0);
  dataWriter.writeUint8(0);
  dataWriter.writeUint16(21);  // Global Msg 21 (event)
  dataWriter.writeUint8(3);    // 3 fields
  dataWriter.writeBytes([253, 4, 0x86]); // timestamp
  dataWriter.writeBytes([0, 1, 0x00]);   // event (0 = timer)
  dataWriter.writeBytes([1, 1, 0x00]);   // event_type (0 = start, 4 = stop_all)

  // Data: Timer Start
  dataWriter.writeUint8(0x02);
  dataWriter.writeUint32(fitStartTime);
  dataWriter.writeUint8(0);    // timer
  dataWriter.writeUint8(0);    // start

  // --------------------------------------------------------------------------
  // Message 3: RECORD (Global Msg 20, Local Msg 3)
  // --------------------------------------------------------------------------
  // Definition: timestamp(4), lat(4), long(4), altitude(2), hr(1), cad(1), dist(4), speed(2), power(2) = 24 bytes/record
  dataWriter.writeUint8(0x43); // Def msg, local 3
  dataWriter.writeUint8(0);
  dataWriter.writeUint8(0);
  dataWriter.writeUint16(20);  // Global Msg 20 (record)
  dataWriter.writeUint8(9);    // 9 fields
  dataWriter.writeBytes([253, 4, 0x86]); // timestamp
  dataWriter.writeBytes([0, 4, 0x85]);   // position_lat (sint32)
  dataWriter.writeBytes([1, 4, 0x85]);   // position_long (sint32)
  dataWriter.writeBytes([2, 2, 0x84]);   // altitude (uint16, (ele + 500) * 5)
  dataWriter.writeBytes([3, 1, 0x02]);   // heart_rate (uint8, bpm)
  dataWriter.writeBytes([4, 1, 0x02]);   // cadence (uint8, rpm)
  dataWriter.writeBytes([5, 4, 0x86]);   // distance (uint32, cm)
  dataWriter.writeBytes([6, 2, 0x84]);   // speed (uint16, mm/s)
  dataWriter.writeBytes([7, 2, 0x84]);   // power (uint16, watts)

  // Emit record data points
  const rawPts = ride.breadcrumbs && ride.breadcrumbs.length > 0 ? ride.breadcrumbs : [];
  const points: BreadcrumbPoint[] = rawPts.length > 0 ? rawPts : [
    { lat: 14.5995, lng: 120.9842, ele: 15, time: startTimeMs }
  ];

  const totalPoints = points.length;
  const timeStepMs = (ridingTimeSecs * 1000) / Math.max(1, totalPoints);
  const distStepMeters = ride.distanceMeters / Math.max(1, totalPoints);
  const avgSpeedMms = Math.round((ride.avgSpeedKmh / 3.6) * 1000);

  // Semicircle constant: 2^31 / 180
  const DEG_TO_SEMICIRCLE = 2147483648 / 180;

  points.forEach((pt, idx) => {
    const ptTimeMs = pt.time || Math.round(startTimeMs + idx * timeStepMs);
    const fitPtTime = toFitTimestamp(ptTimeMs);

    // Lat / Lon in semicircles
    const latSemicircles = Math.round(pt.lat * DEG_TO_SEMICIRCLE);
    const lngSemicircles = Math.round(pt.lng * DEG_TO_SEMICIRCLE);

    // Altitude: FIT scale 5, offset 500 => (ele + 500) * 5
    const eleM = pt.ele !== undefined ? pt.ele : 150;
    const altitudeFit = Math.max(0, Math.min(65534, Math.round((eleM + 500) * 5)));

    // Heart Rate
    let hrVal = 0xFF; // invalid
    if (pt.heartRate !== undefined && pt.heartRate !== null && pt.heartRate > 0) {
      hrVal = Math.min(254, Math.round(pt.heartRate));
    } else if (ride.avgHeartRateBpm) {
      hrVal = Math.min(254, Math.round(ride.avgHeartRateBpm));
    }

    // Cadence
    let cadVal = 0xFF; // invalid
    if (pt.cadence !== undefined && pt.cadence !== null && pt.cadence >= 0) {
      cadVal = Math.min(254, Math.round(pt.cadence));
    } else if (ride.avgCadenceRpm) {
      cadVal = Math.min(254, Math.round(ride.avgCadenceRpm));
    }

    // Distance in cm
    const ptDistMeters = pt.distance !== undefined ? pt.distance : (idx * distStepMeters);
    const distanceCm = Math.max(0, Math.round(ptDistMeters * 100));

    // Speed in mm/s
    let speedMms = avgSpeedMms;
    if (pt.speed !== undefined && pt.speed >= 0) {
      speedMms = Math.round((pt.speed / 3.6) * 1000);
    }
    const speedFit = Math.max(0, Math.min(65534, speedMms));

    // Power in Watts
    let powerFit = 0xFFFF; // invalid
    if (pt.power !== undefined && pt.power !== null && pt.power >= 0) {
      powerFit = Math.min(65534, Math.round(pt.power));
    } else if (ride.avgPowerWatts !== undefined && ride.avgPowerWatts !== null && ride.avgPowerWatts >= 0) {
      powerFit = Math.min(65534, Math.round(ride.avgPowerWatts));
    }

    // Record Data Msg (local msg 3)
    dataWriter.writeUint8(0x03);
    dataWriter.writeUint32(fitPtTime);
    dataWriter.writeInt32(latSemicircles);
    dataWriter.writeInt32(lngSemicircles);
    dataWriter.writeUint16(altitudeFit);
    dataWriter.writeUint8(hrVal);
    dataWriter.writeUint8(cadVal);
    dataWriter.writeUint32(distanceCm);
    dataWriter.writeUint16(speedFit);
    dataWriter.writeUint16(powerFit);
  });

  // --------------------------------------------------------------------------
  // Message 2 (Data): EVENT - Timer Stop
  // --------------------------------------------------------------------------
  dataWriter.writeUint8(0x02);
  dataWriter.writeUint32(fitEndTime);
  dataWriter.writeUint8(0);    // timer
  dataWriter.writeUint8(4);    // stop_all

  // --------------------------------------------------------------------------
  // Message 4: SESSION (Global Msg 18, Local Msg 4)
  // --------------------------------------------------------------------------
  // Definition
  dataWriter.writeUint8(0x44); // Def msg, local 4
  dataWriter.writeUint8(0);
  dataWriter.writeUint8(0);
  dataWriter.writeUint16(18);  // Global Msg 18 (session)
  dataWriter.writeUint8(16);   // 16 fields
  dataWriter.writeBytes([253, 4, 0x86]); // timestamp
  dataWriter.writeBytes([2, 4, 0x86]);   // start_time
  dataWriter.writeBytes([7, 4, 0x86]);   // total_elapsed_time (ms)
  dataWriter.writeBytes([8, 4, 0x86]);   // total_timer_time (ms)
  dataWriter.writeBytes([9, 4, 0x86]);   // total_distance (cm)
  dataWriter.writeBytes([22, 2, 0x84]);  // total_ascent (m)
  dataWriter.writeBytes([11, 2, 0x84]);  // total_calories (kcal)
  dataWriter.writeBytes([14, 2, 0x84]);  // avg_speed (mm/s)
  dataWriter.writeBytes([15, 2, 0x84]);  // max_speed (mm/s)
  dataWriter.writeBytes([20, 2, 0x84]);  // avg_power (w)
  dataWriter.writeBytes([21, 2, 0x84]);  // max_power (w)
  dataWriter.writeBytes([16, 1, 0x02]);  // avg_heart_rate (bpm)
  dataWriter.writeBytes([17, 1, 0x02]);  // max_heart_rate (bpm)
  dataWriter.writeBytes([18, 1, 0x02]);  // avg_cadence (rpm)
  dataWriter.writeBytes([5, 1, 0x00]);   // sport (cycling = 2)
  dataWriter.writeBytes([6, 1, 0x00]);   // sub_sport (generic = 0)

  // Data: Session
  const sessionAvgPower = ride.avgPowerWatts !== undefined && ride.avgPowerWatts !== null
    ? Math.round(ride.avgPowerWatts)
    : 0xFFFF;
  const sessionMaxPower = ride.maxPowerWatts !== undefined && ride.maxPowerWatts !== null
    ? Math.round(ride.maxPowerWatts)
    : (sessionAvgPower !== 0xFFFF ? Math.round(sessionAvgPower * 1.5) : 0xFFFF);
  const sessionAvgHr = ride.avgHeartRateBpm ? Math.min(254, Math.round(ride.avgHeartRateBpm)) : 0xFF;
  const sessionMaxHr = ride.maxHeartRateBpm ? Math.min(254, Math.round(ride.maxHeartRateBpm)) : (sessionAvgHr !== 0xFF ? Math.min(254, sessionAvgHr + 25) : 0xFF);
  const sessionAvgCad = ride.avgCadenceRpm ? Math.min(254, Math.round(ride.avgCadenceRpm)) : 0xFF;

  dataWriter.writeUint8(0x04); // Data msg, local 4
  dataWriter.writeUint32(fitEndTime);
  dataWriter.writeUint32(fitStartTime);
  dataWriter.writeUint32(Math.round(saddleTimeSecs * 1000));
  dataWriter.writeUint32(Math.round(ridingTimeSecs * 1000));
  dataWriter.writeUint32(Math.round(ride.distanceMeters * 100));
  dataWriter.writeUint16(Math.min(65534, Math.round(ride.totalAscentMeters)));
  dataWriter.writeUint16(Math.min(65534, Math.round(ride.calories || (ridingTimeSecs * 0.2))));
  dataWriter.writeUint16(Math.round((ride.avgSpeedKmh / 3.6) * 1000));
  dataWriter.writeUint16(Math.round((ride.maxSpeedKmh / 3.6) * 1000));
  dataWriter.writeUint16(sessionAvgPower);
  dataWriter.writeUint16(sessionMaxPower);
  dataWriter.writeUint8(sessionAvgHr);
  dataWriter.writeUint8(sessionMaxHr);
  dataWriter.writeUint8(sessionAvgCad);
  dataWriter.writeUint8(2); // sport = cycling
  dataWriter.writeUint8(0); // sub_sport = generic

  // --------------------------------------------------------------------------
  // Message 5: ACTIVITY (Global Msg 34, Local Msg 5)
  // --------------------------------------------------------------------------
  // Definition
  dataWriter.writeUint8(0x45); // Def msg, local 5
  dataWriter.writeUint8(0);
  dataWriter.writeUint8(0);
  dataWriter.writeUint16(34);  // Global Msg 34 (activity)
  dataWriter.writeUint8(6);    // 6 fields
  dataWriter.writeBytes([253, 4, 0x86]); // timestamp
  dataWriter.writeBytes([0, 4, 0x86]);   // total_timer_time (ms)
  dataWriter.writeBytes([1, 2, 0x84]);   // num_sessions
  dataWriter.writeBytes([2, 1, 0x00]);   // type
  dataWriter.writeBytes([3, 1, 0x00]);   // event
  dataWriter.writeBytes([4, 1, 0x00]);   // event_type

  // Data: Activity
  dataWriter.writeUint8(0x05); // Data msg, local 5
  dataWriter.writeUint32(fitEndTime);
  dataWriter.writeUint32(Math.round(ridingTimeSecs * 1000));
  dataWriter.writeUint16(1);    // 1 session
  dataWriter.writeUint8(0);     // type: generic
  dataWriter.writeUint8(26);    // event: activity
  dataWriter.writeUint8(1);     // event_type: stop

  // --------------------------------------------------------------------------
  // ASSEMBLE FULL FIT FILE: 14-Byte Header + Data Records + 2-Byte File CRC
  // --------------------------------------------------------------------------
  const dataBytes = dataWriter.getBytes();
  const dataSize = dataBytes.length;

  const header = new Uint8Array(14);
  header[0] = 14;   // header_size
  header[1] = 0x20; // protocol_version: 2.0
  header[2] = 0x70; // profile_version: 2160 (0x0870)
  header[3] = 0x08;
  // data_size (uint32 LE)
  header[4] = dataSize & 0xFF;
  header[5] = (dataSize >> 8) & 0xFF;
  header[6] = (dataSize >> 16) & 0xFF;
  header[7] = (dataSize >> 24) & 0xFF;
  // Data type: ".FIT"
  header[8] = 0x2E; // '.'
  header[9] = 0x46; // 'F'
  header[10] = 0x49; // 'I'
  header[11] = 0x54; // 'T'
  // Header CRC (calculated over bytes 0-11)
  const headerCrc = calculateFitCrc(header, 0, 12);
  header[12] = headerCrc & 0xFF;
  header[13] = (headerCrc >> 8) & 0xFF;

  // Final binary buffer
  const finalFile = new Uint8Array(14 + dataSize + 2);
  finalFile.set(header, 0);
  finalFile.set(dataBytes, 14);

  // File CRC (calculated over bytes 0 through 14 + dataSize - 1)
  const fileCrc = calculateFitCrc(finalFile, 0, 14 + dataSize);
  finalFile[14 + dataSize] = fileCrc & 0xFF;
  finalFile[14 + dataSize + 1] = (fileCrc >> 8) & 0xFF;

  return finalFile;
}

/**
 * Exports and downloads the ride as a standardized .FIT file
 */
export function exportRideToFit(ride: ExportableRideData) {
  const fitBinary = buildFitBinary(ride);
  const cleanName = (ride.routeName || 'ride')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_');
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `magene_c706_${cleanName}_${dateStr}.fit`;
  downloadBinaryFile(fitBinary, filename, 'application/vnd.ant.fit');
}

/** Build a FIT Blob suitable for uploadToStrava */
export function rideToFitBlob(ride: ExportableRideData): Blob {
  const binary = buildFitBinary(ride);
  return new Blob([binary as unknown as BlobPart], { type: 'application/vnd.ant.fit' });
}

// ============================================================================
// GPX 1.1 EXPORTER WITH GARMIN EXTENSIONS FOR POWER, HR & CADENCE
// ============================================================================

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
      const ptTime = pt.time ? new Date(pt.time).toISOString() : new Date(startTime.getTime() + idx * intervalMs).toISOString();
      const ele = pt.ele !== undefined ? pt.ele : 150;
      
      let extXml = '';
      const hr = pt.heartRate ?? ride.avgHeartRateBpm;
      const cad = pt.cadence ?? ride.avgCadenceRpm;
      const pwr = pt.power ?? ride.avgPowerWatts;
      const atemp = pt.temperature;
      const speedMs =
        pt.speed !== undefined && Number.isFinite(pt.speed) ? pt.speed / 3.6 : undefined;

      if (hr || cad || pwr || atemp !== undefined || speedMs !== undefined) {
        let tpxInner = '';
        if (hr) tpxInner += `<gpxtpx:hr>${Math.round(Number(hr))}</gpxtpx:hr>`;
        if (cad) tpxInner += `<gpxtpx:cad>${Math.round(Number(cad))}</gpxtpx:cad>`;
        if (atemp !== undefined && Number.isFinite(atemp)) {
          tpxInner += `<gpxtpx:atemp>${Number(atemp).toFixed(1)}</gpxtpx:atemp>`;
        }
        if (speedMs !== undefined) {
          tpxInner += `<gpxtpx:speed>${speedMs.toFixed(3)}</gpxtpx:speed>`;
        }
        extXml = `\n        <extensions>`;
        if (pwr) extXml += `<power>${Math.round(Number(pwr))}</power>`;
        if (tpxInner) extXml += `<gpxtpx:TrackPointExtension>${tpxInner}</gpxtpx:TrackPointExtension>`;
        extXml += `</extensions>`;
      }

      trkptsXml += `      <trkpt lat="${pt.lat.toFixed(6)}" lon="${pt.lng.toFixed(6)}">
        <ele>${ele.toFixed(1)}</ele>
        <time>${ptTime}</time>${extXml}
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
<gpx version="1.1" creator="ImageneCycle Cycling Computer"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd http://www.garmin.com/xmlschemas/TrackPointExtension/v1 http://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd">
  <metadata>
    <name>${safeName}</name>
    <time>${startTimeIso}</time>
    <desc>Recorded on ImageneCycle Cycling Computer. Distance: ${(ride.distanceMeters / 1000).toFixed(2)} km, Elev Gain: ${Math.round(ride.totalAscentMeters)}m, Avg Speed: ${ride.avgSpeedKmh.toFixed(1)} km/h</desc>
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
    device: 'ImageneCycle Cycling Computer',
    version: '2.0',
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
        avgPowerWatts: ride.avgPowerWatts ?? null,
        maxPowerWatts: ride.maxPowerWatts ?? null,
        avgCadenceRpm: ride.avgCadenceRpm ?? null,
        avgHeartRateBpm: ride.avgHeartRateBpm ?? null,
        maxHeartRateBpm: ride.maxHeartRateBpm ?? null
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

export interface StravaUploadResult {
  id: number;
  status: string;
}

/**
 * Uploads a FIT or GPX activity file to Strava via multipart/form-data.
 * Requires a valid OAuth access token with activity:write scope.
 */
export async function uploadToStrava(
  file: Blob | File,
  accessToken: string,
  options?: { name?: string; description?: string; dataType?: 'fit' | 'gpx' }
): Promise<StravaUploadResult> {
  const token = accessToken ? accessToken.trim() : '';
  if (!token) {
    throw new Error('Strava access token is required');
  }

  const dataType = options?.dataType || (file.type.includes('fit') ? 'fit' : 'fit');
  const form = new FormData();
  const filename =
    file instanceof File && file.name
      ? file.name
      : `magene_c706_ride.${dataType}`;
  form.append('file', file, filename);
  form.append('data_type', dataType);
  if (options?.name) form.append('name', options.name);
  if (options?.description) form.append('description', options.description);

  const res = await fetch('https://www.strava.com/api/v3/uploads', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: form
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const errBody = await res.json();
      detail = errBody?.message || errBody?.errors?.[0]?.message || JSON.stringify(errBody);
    } catch {}
    throw new Error(`Strava upload failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  return {
    id: data.id,
    status: data.status || 'Your activity is being processed on Strava.'
  };
}

/** Build a GPX Blob suitable for uploadToStrava */
export function rideToGpxBlob(ride: ExportableRideData): Blob {
  return new Blob([buildGpxXml(ride)], { type: 'application/gpx+xml' });
}
