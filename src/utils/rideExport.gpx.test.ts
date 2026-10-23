import { buildGpxXml } from './rideExport';

export function runGpxMageneValidation(): void {
  const xml = buildGpxXml({
    routeName: 'Test Ride',
    startedAt: Date.parse('2023-10-23T08:00:00Z'),
    timeElapsed: 60,
    ridingTimeSeconds: 60,
    distanceMeters: 500,
    totalAscentMeters: 10,
    avgSpeedKmh: 20,
    maxSpeedKmh: 30,
    breadcrumbs: [
      {
        lat: 10.6765,
        lng: 122.9509,
        ele: 15.2,
        time: Date.parse('2023-10-23T08:00:01Z'),
        speed: 25.2,
        heartRate: 145,
        cadence: 85,
        temperature: 28.5
      }
    ]
  });

  if (!xml.includes('<gpxtpx:hr>145</gpxtpx:hr>')) {
    throw new Error('GPX missing gpxtpx:hr');
  }
  if (!xml.includes('<gpxtpx:cad>85</gpxtpx:cad>')) {
    throw new Error('GPX missing gpxtpx:cad');
  }
  if (!xml.includes('<gpxtpx:atemp>28.5</gpxtpx:atemp>')) {
    throw new Error('GPX missing gpxtpx:atemp');
  }
  if (!xml.includes('<gpxtpx:speed>')) {
    throw new Error('GPX missing gpxtpx:speed');
  }
  if (!xml.includes('xmlns:gpxtpx=')) {
    throw new Error('GPX missing gpxtpx namespace');
  }

  console.log('ALL GPX MAGENE VALIDATIONS PASSED:');
  console.log('- hr, cad, atemp, speed in TrackPointExtension');
}

runGpxMageneValidation();
