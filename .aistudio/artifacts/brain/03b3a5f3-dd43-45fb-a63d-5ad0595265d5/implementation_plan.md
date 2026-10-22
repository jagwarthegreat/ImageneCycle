# Add Current Time/Date Metric & Relocate Map Controls to Sidebar

Add a live 24-hour clock and date metric to the secondary header sub-strip (red box area) and move the floating map controls (Auto-Center and 180° Inversion) into a dedicated "Map Settings" card in the sidebar drawer.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following design decisions were confirmed through interactive clarification and govern this implementation:

- **Confirmed Decision 1 (Clock & Date Format)**: 24-hour time with ticking seconds and short date (`14:35:20` / `OCT 22`) formatted with digital tabular numerals, placed as the center column between `TOTAL DIST` and `TOTAL ASCENT`.
- **Confirmed Decision 2 (Sidebar Map Settings Placement)**: Position the new **Map Settings** card directly in the sidebar drawer above display preferences/tools for quick in-ride accessibility while keeping the live Leaflet map unobstructed.
- **Confirmed Decision 3 (Clean Map Canvas)**: Remove the floating `CENTER ON` and `180° FLIP` buttons from the Leaflet overlay surface, keeping only course fit/locate and zoom controls for an uncluttered bike computer map display.

---

## 1. Overview & Core Concept

- **What It Does**:
  1. Expands the 2-column metric strip (`TOTAL DIST` | `TOTAL ASCENT`) into a balanced 3-column instrument cluster: `[ TOTAL DIST | TIME / DATE | TOTAL ASCENT ]`.
  2. Creates a clean, centralized **Map Settings** panel in the Magene C706 slide-out drawer featuring dedicated tactile switches for **Auto-Center Map** and **Invert Arrow 180°**.
  3. De-clutters the live GPS navigation viewport by removing intrusive floating buttons.
- **Target Audience**: Cyclists navigating outdoor routes who need immediate glanceable awareness of time-of-day alongside route distance and elevation gain, and who want clean map visibility without accidental button taps while riding.
- **Key Value**: Professional Magene C706 head-unit aesthetics, comprehensive ride context, and simplified map interaction.

---

## 2. User Experience & Visual Design

### A. Sub-Strip Metric Rebalancing (Red Box Section)
- **3-Column Grid (`grid-cols-3 divide-x divide-zinc-200 dark:divide-zinc-800`)**:
  - **Left Column (`TOTAL DIST` / `DIST.REMAIN`)**: Numeric distance in kilometers with high-contrast digital typography (`font-digital text-[20px] sm:text-[24px]`).
  - **Center Column (`TIME / DATE`)**:
    - Primary digital clock: `HH:mm:ss` (24h format) ticking every second with fixed-width tabular numerals to avoid jitter (`font-digital text-[18px] sm:text-[22px] font-bold tabular-nums`).
    - Secondary date kicker: `THU, OCT 22` or `OCT 22` in clean uppercase athletic typography (`font-sports font-bold text-[9px] sm:text-[10px] tracking-wider text-zinc-500`).
  - **Right Column (`TOTAL ASCENT` / `REM. ASCENT`)**: Elevation in meters (`font-digital text-[20px] sm:text-[24px]`).
- **Daylight & Dark Mode Contrast**: Seamlessly conforms to light mode (crisp white background, dark zinc numerals) and dark mode (`bg-zinc-950`, crisp emerald/white figures).

### B. Map Settings in the Sidebar Drawer
- **Dedicated Map Settings Section**:
  - Located in the drawer's `GPS / MAP` tab directly above hardware tools and auto-lap configurations.
  - **Auto-Center Toggle**: Clear switch indicating whether the map automatically follows the cyclist's GPS coordinate or allows free-panning.
  - **180° Heading Invert Toggle**: Clear switch indicating whether the orientation arrow is flipped 180° for reverse handlebar mounts. Persisted in `localStorage`.
- **Streamlined Map Viewport**:
  - The bottom-right floating stack retains only contextual Zoom (`+` / `−`) and Route Fit / Snap-to-location buttons.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: 3-Column Instrument Cluster**
  - *Chosen Approach*: Replace the 2-column flex grid with an equal-width 3-column grid (`grid-cols-3 divide-x`).
  - *Why*: In cycling computers (Garmin Edge, Wahoo ELEMNT, Magene C-series), time-of-day and elapsed riding time are distinct metrics. Having current time + date right below ride duration provides instant schedule tracking without having to exit the ride screen.
  - *Alternatives Considered*: Floating clock badge in the top bar (already crowded with battery, BLE status, GPS quality, and recording indicators).
- **Decision 2: Centralized Map Settings in Sidebar Drawer**
  - *Chosen Approach*: Lift `autoCenter` and `invertHeading` states to `App.tsx` and pass them into `GpsMapView`, surfacing the controls in the drawer's Map Settings panel.
  - *Why*: Floating buttons on Leaflet maps are prone to accidental touch when cycling over rough terrain and obscure map routes and turn-by-turn prompts. The drawer provides dedicated, fat-finger-friendly touch switches ($48\text{px}$ touch targets).

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────┐
│                        App.tsx                         │
│  - State: autoCenter (boolean, default true)           │
│  - State: invertHeading (persisted in localStorage)    │
│  - Drawer: "Map Settings" Toggle Switches Card         │
└───────────────────────────┬────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
┌───────────────────────────┐ ┌──────────────────────────┐
│      MageneDevice.tsx     │ │      GpsMapView.tsx      │
│  - 3-Col Header Sub-Strip │ │  - Pure map rendering    │
│    • Col 1: TOTAL DIST    │ │  - Follows autoCenter    │
│    • Col 2: TIME / DATE   │ │  - Needle uses inverted  │
│    • Col 3: TOTAL ASCENT  │ │    heading if enabled    │
│  - 1s interval clock hook │ │  - Clutter-free overlay  │
└───────────────────────────┘ └──────────────────────────┘
```

### Component & File Work Plan:

1. **`src/components/MageneDevice.tsx`**:
   - Add interval timer for real-time 24-hour clock (`HH:mm:ss`) and formatted date (`OCT 22`).
   - Update the red-boxed second row from `grid-cols-2` to `grid-cols-3 divide-x`.
   - Pass `autoCenter` and `invertHeading` props to `GpsMapView`.

2. **`src/components/GpsMapView.tsx`**:
   - Accept `autoCenter` and `invertHeading` (plus optional callbacks) as controlled props.
   - Remove the floating `CENTER ON` and `180° FLIP` buttons from the overlay stack in lines 570–596.
   - Maintain map center behavior when `autoCenter` is true.

3. **`src/App.tsx`**:
   - Manage `autoCenter` and `invertHeading` states (with `localStorage` persistence for `invertHeading`).
   - Add a high-visibility **Map Settings** card in the drawer (`routes` tab) above display preferences and developer tools.
   - Pass `autoCenter` and `invertHeading` to `MageneDevice`.
