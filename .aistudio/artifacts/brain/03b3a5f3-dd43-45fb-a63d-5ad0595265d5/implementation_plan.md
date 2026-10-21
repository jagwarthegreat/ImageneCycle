# Implementation Plan: Smart Auto-Lap, Strava GPX/JSON Export & Live Weather Indicator

A comprehensive enhancement to the Magene C706 cycling computer app integrating automated distance laps with haptic/audio feedback, multi-format ride export (Strava-ready standard GPX and detailed JSON telemetry), and a compact live weather & rain probability widget powered by current GPS coordinates.

---

## 1. User Decisions & Specification Alignment

Based on user requirements and clarifying confirmations:
1. **Smart Auto-Lap**:
   - Default interval set to **5 km**, with a toggle between **5 km**, **10 km**, and **Off** directly in the Drawer Menu.
   - When each interval is reached while recording, triggers a distinctive dual-tone audio alert, haptic vibration (`navigator.vibrate`), and a high-contrast 4-second auto-lap banner on the Magene C706 screen showing Lap Number, Lap Split Time, and Lap Avg Speed.
2. **Ride Export (JSON & Strava GPX)**:
   - **Strava GPX Export**: Generates a valid XML GPX 1.1 file containing all recorded GPS breadcrumb track points with ISO-8601 timestamps, elevations, and speed extensions, immediately importable to Strava, Garmin Connect, and TrainingPeaks.
   - **JSON Telemetry Export**: Downloads comprehensive ride telemetry (moving time, saddle time, elevation gain, max/avg speed, cadence, heart rate, power zones, and GPS coordinate array) for data science or offline analysis.
   - Includes a direct 1-click link to open `strava.com/upload/select`.
3. **Live Weather Indicator**:
   - Non-intrusive, compact weather pill in the Magene top status bar and Page 1 HUD.
   - Driven dynamically by the rider's live GPS coordinates (`currentCoords.lat`, `currentCoords.lng`).
   - Displays current temperature (°C), live condition icon (sun, rain clouds, overcast), and rain/precipitation probability percentage (e.g., `24°C • 15% Rain`).
   - Zero-configuration live weather service with real-time updates and graceful offline fallback.

---

## 2. Technical Architecture & Component Changes

### A. Auto-Lap Engine (`src/utils/gpsService.ts` & `src/App.tsx`)
- Extend `gpsService` or tracking coordinator to track cumulative lap distance.
- State: `autoLapDistance`: `5000` (5km) | `10000` (10km) | `0` (Off). Persisted in `localStorage`.
- When `distanceTraveled - lastLapDistance >= autoLapDistance`:
  - Increment lap count.
  - Calculate lap split duration and lap avg speed.
  - Play double chime via `bikeBeeper.lapChime()`.
  - Trigger haptic pulse via `navigator.vibrate([120, 80, 120])`.
  - Display non-intrusive floating `AutoLapToast` overlay on Magene display for 4 seconds.
  - Add Lap setting selector (5 km / 10 km / Off) in Drawer Menu Tab 1.

### B. Strava-Ready GPX & JSON Exporters (`src/utils/rideExport.ts`)
- Create `src/utils/rideExport.ts`:
  - `exportRideToGpx(session, historyItem)`: Builds compliant GPX 1.1 document with metadata, track name, and `<trkpt lat="..." lon="...">` with `<ele>`, `<time>`, and `<extensions>` containing speed and power.
  - `exportRideToJson(session, historyItem)`: Formats full metadata and coordinates into pretty-printed JSON.
  - `downloadBlob(blob, filename)`: Utility to initiate browser download.
- Integrate into `src/components/RideSummaryModal.tsx`:
  - Add dedicated "Export to Strava (.GPX)" button with Strava icon.
  - Add "Export Telemetry (.JSON)" button with download icon.
  - Add "Upload to Strava" link button for convenient workflow.
- Also make export available on past rides in the **History** tab of the drawer.

### C. Live GPS Weather Service (`src/services/weatherService.ts` & `src/components/WeatherBadge.tsx`)
- Create `src/services/weatherService.ts`:
  - Queries real-time weather by latitude and longitude.
  - Returns `{ tempC: number, condition: string, rainProbability: number, icon: string, locationName?: string }`.
  - Caches results for 10 minutes to respect rate limits and conserve battery.
- Create `src/components/WeatherBadge.tsx`:
  - Ultra-compact sports HUD pill fitting cleanly into Magene C706 top status bar or page header.
  - Shows current temperature, dynamic weather icon, and rain probability with color coding (< 20% neutral, 20-50% amber, > 50% cyan/blue rain alert).
  - Tapping opens a mini quick popover with wind speed, humidity, and forecast overview.

---

## 3. Implementation Steps & Verification Plan

1. **Auto-Lap Engine & UI Settings**:
   - Add auto-lap configuration state and persistence in `App.tsx`.
   - Implement distance threshold listener and lap alert triggering.
   - Build `AutoLapNotification` banner in `MageneDevice.tsx`.
   - Add Auto-Lap toggle control (5 km / 10 km / Off) in the Drawer Menu.
2. **Export Utilities & Ride Summary Integration**:
   - Implement GPX 1.1 generator and JSON telemetry serializer in `src/utils/rideExport.ts`.
   - Add "Export GPX (Strava)" and "Export JSON" action buttons in `RideSummaryModal.tsx` and History list cards.
3. **Weather Integration**:
   - Implement `weatherService.ts` querying live GPS coordinates.
   - Implement `WeatherBadge.tsx` and mount it cleanly in `MageneDevice.tsx` top status bar.
4. **Verification**:
   - Validate auto-lap trigger logic with audio beep and haptic vibration.
   - Test GPX and JSON export file downloads and confirm Strava-compatible XML schema.
   - Verify weather badge renders temperature and rain probability accurately from GPS.
   - Run `lint_applet` and `compile_applet`.
