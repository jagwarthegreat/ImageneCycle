# GPS Auto-Start Movement Detection & Monotonic Auto-Save Persistence

## Summary
Enhance `gpsService` with persistent, GC-resistant movement event listeners and explicit session ID verification, while overhauling the 5-second auto-save pipeline in `App.tsx` using a monotonic ref buffer and atomic storage writes to permanently eliminate recording cut-offs and state overwrite issues during high-frequency GPS updates.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were clarified and confirmed for this implementation:

- **Confirmed Decision 1 (Movement Detection Auto-Start)**: When movement is detected (speed $\ge$ 2.0 km/h or sustained displacement) while a ride is paused or unstarted, the system will **automatically resume or start recording** seamlessly without requiring rider manual prompt confirmation, maintaining full focus on the road.
- **Confirmed Decision 2 (Data Loss & Race Condition Prevention)**: To prevent high-frequency updates from causing recording cut-offs or resetting metrics, we will use a **dedicated monotonic ref buffer** coupled with **atomic, non-decreasing localStorage writes**. The 5-second timer will decouple from high-frequency render triggers to guarantee stable, periodic persistence.
- **Session ID Integrity**: Tracking updates and disk persistence will strictly verify `activeSession.id` against `gpsService.currentSessionId`. Mismatched session events will be rejected to prevent cross-session state corruption.

---

## 1. Overview & Core Concept

- **What It Does**:
  - **Persistent Movement Detection**: Establishes a singleton-level, lifecycle-resistant geolocation and motion listener architecture in `gpsService` that survives long rides, memory pressure, and component re-render cycles.
  - **Session Verification**: Explicitly binds tracking events to `activeSession.id`. Fixes and metrics only apply to the active session when the ID matches the tracking state.
  - **Monotonic Auto-Save Pipeline**: Fixes an issue where `useEffect` in `App.tsx` re-created the 5-second interval on every single GPS fix (due to `liveBreadcrumbs` and `distanceTraveled` dependencies), causing timers to reset repeatedly and auto-saves to write stale closure snapshots. Replaces this with an isolated timer reading directly from an atomic accumulator buffer.
- **Target Audience / Persona**: Cyclists on endurance and long-distance rides relying on uninterrupted recording, accurate elevation gain, and persistent breadcrumb trail history.
- **Key Value**: 100% resilient ride data recording without dropouts, cut-offs, or metric rollbacks, even over multi-hour rides.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  - **Auto-Resume on Rollout**: When stopped at a traffic light or cafe, the ride auto-pauses. As soon as the rider begins pedaling ($\ge$ 2.0 km/h), the persistent listener detects movement and instantly resumes recording with a distinct confirmation chime, updating HUD state immediately.
  - **Seamless Multi-Hour Navigation**: High-frequency GPS fixes (1 Hz or faster) stream into the live HUD, altitude graph, and breadcrumb path without ever triggering recording cut-offs or resetting cumulative ascent/distance.
  - **Crash / Power Loss Recovery**: If the device browser tab reloads or battery saver switches on/off, the atomic session in `localStorage` contains the exact monotonic metrics and full breadcrumb array up to the last 5-second boundary.

- **Visual & Audio Feedback**:
  - Distinctive sound chimes: High pitch (2600 Hz) on auto-resume, lower pitch (1800 Hz) on auto-pause.
  - Magene HUD indicators: Top status bar displays GPS lock status (`GPS 3D`, `GPS 2D`, `Weak`) with 3-bar signal meter, moving time, speed, and real-time total ascent.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Decoupling Auto-Save Interval from React Dependency Churn**
  - *Chosen Approach*: Use a ref-based monotonic buffer (`sessionBufferRef`) with an isolated 5-second interval effect that depends only on `[activeSession?.id, isRecording]`.
  - *Why*: In React, including rapidly updating state (`liveBreadcrumbs`, `distanceTraveled`) in an interval's dependency array clears and restarts the timer every second, preventing the interval from ever executing cleanly under continuous motion. Reading from a monotonic ref gives 100% up-to-date data without resetting the persistence loop.
  - *Alternatives Considered*: Debounced state writes. Rejected because debounce can drop intermediate points if high-frequency events continuously reset the debounce timer.

- **Decision 2: Persistent Service-Level Listener Management**
  - *Chosen Approach*: Keep listener references, watch IDs, and movement detection handlers bound to the singleton `gpsService` instance rather than local hook closures. Provide explicit session lifecycle methods (`attachSession`, `detachSession`).
  - *Why*: Prevents browser garbage collection during long idle periods or background tab throttling, ensuring motion listeners remain active.

- **Decision 3: Monotonic Safeguards on Storage Writes**
  - *Chosen Approach*: Before saving to `localStorage`, the writer verifies that `distanceMeters >= previousSaved.distanceMeters`, `totalAscentMeters >= previousSaved.totalAscentMeters`, and `breadcrumbs.length >= previousSaved.breadcrumbs.length` for the same session ID.
  - *Why*: Guarantees that even in the event of an out-of-order callback or asynchronous state update, data can never roll backward.

---

## 4. Technical Architecture & Data Strategy

### System Architecture & Data Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    Browser Geolocation API                   │
│          navigator.geolocation.watchPosition / Device         │
└──────────────────────────────┬───────────────────────────────┘
                               │ High-frequency GPS fixes (1Hz)
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                         gpsService                           │
│  - Persistent Watch & Motion Listeners (GC-immune singleton) │
│  - Active Session ID Validation: currentSessionId === ID     │
│  - Movement Auto-Resume Detector (Speed >= 2.0 km/h)         │
│  - Geodesic Distance, Heading & VAM Calculation              │
└──────────────┬───────────────────────────────┬───────────────┘
               │ Fix Data                      │ Movement State
               ▼                               ▼
┌──────────────────────────────────────────────────────────────┐
│                   App.tsx Session Buffer                     │
│  sessionBufferRef (Monotonic Accumulator):                   │
│  - sessionId, monotonic distance, monotonic ascent           │
│  - append-only breadcrumb buffer                             │
└──────────────┬───────────────────────────────┬───────────────┘
               │                               │
       5-Second Isolated Timer         Instant React State Ticks
               │ (Reads Ref directly)          │ (HUD / Map Rendering)
               ▼                               ▼
┌──────────────────────────────┐  ┌────────────────────────────┐
│      Atomic LocalStorage     │  │     Magene C706 UI HUD     │
│  - Verified non-decreasing   │  │  - Real-time speedometer   │
│  - Active ride preservation  │  │  - Live breadcrumb map     │
└──────────────────────────────┘  └────────────────────────────┘
```

### Core Components to Update

1. **`src/utils/gpsService.ts`**:
   - Add session tracking state: `activeSessionId: string | null`, with `setTrackingSession(id: string | null)` and `getTrackingSession(): string | null`.
   - Maintain persistent event listeners for movement detection: retain long-lived watch handles and optional device motion listeners.
   - Guard callbacks: ensure fix processing checks active tracking session state where appropriate.
   - Implement movement detection triggers that notify `App.tsx` directly when speed $\ge$ 2.0 km/h is observed during pause/idle.

2. **`src/App.tsx`**:
   - Introduce `sessionBufferRef`:
     - Tracks current session ID, non-decreasing `distanceMeters`, non-decreasing `totalAscentMeters`, and full append-only `breadcrumbs`.
   - Refactor 5-second auto-save `useEffect`:
     - Remove high-frequency state variables from dependencies (`distanceTraveled`, `totalAscent`, `liveBreadcrumbs`, `currentElevation`, etc.).
     - Depend strictly on `[activeSession?.id, isRecording, isPaused]`.
     - In the timer callback, read from `sessionBufferRef.current`, verify `sessionBufferRef.current.sessionId === activeSession.id`, ensure monotonicity, and save atomically.
   - Synchronize GPS fix handler:
     - On GPS fix, mutate `sessionBufferRef.current` synchronously before calling `setDistanceTraveled`, `setTotalAscent`, and `setLiveBreadcrumbs`.
     - Auto-resume recording automatically on movement detection when paused or unstarted, honoring user preference.
   - Session lifecycle synchronization:
     - When starting, resuming, or stopping an activity, notify `gpsService.setTrackingSession(id)`.

3. **`src/utils/rideHistory.ts`**:
   - Enhance `saveActiveSession` with safety validation: ensure that if a session with the same ID already exists in storage, new writes cannot overwrite with lower distance or truncated breadcrumbs unless explicitly marked as a new session.

---

## 5. Verification & Testing Plan

1. **Unit & Logic Testing**:
   - Verify monotonic buffer behavior: test that successive GPS fixes strictly increment distance and breadcrumbs.
   - Verify session ID validation: confirm fixes with mismatched or null session IDs are rejected from mutating active recording metrics.
2. **Auto-Save Continuity Test**:
   - Simulate high-frequency GPS fixes (100ms - 1000ms intervals) for 30 seconds.
   - Verify that the 5-second interval fires reliably every 5 seconds without timer cancellation.
   - Inspect `localStorage.getItem('magene-active-session-v1')` to confirm breadcrumb count and distance grow monotonically.
3. **Compilation & Linting**:
   - Execute `lint_applet` and `compile_applet` to ensure zero TypeScript errors and clean production build.
