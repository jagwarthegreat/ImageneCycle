# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are cyclists on real rides — endurance, climbing, and navigation — who need a glanceable phone HUD and reliable recording while they ride. This is an in-ride computer, not a post-ride analytics desk tool.

## Product Purpose

ImageneCycle is a GPS bike computer for the phone: live ride metrics, ClimbPro elevation awareness, BLE sensor pairing, offline map packs, route planning/following, and ride history with export (including Strava upload). Success means the rider can trust the HUD and the recording through multi-hour rides, pauses, background pressure, and intermittent connectivity.

## Positioning

Phone-first Magene C706–style ride HUD with live ClimbPro (planned courses and free-ride climb detection), plus downloadable Magene-format offline map packs (M/N/T) focused on Southeast Asia — not a generic fitness tracker and not Guru Maps proprietary packs.

## Operating Context

- Used outdoors on a phone mount or in-hand glances while riding.
- Primary delivery today: Capacitor Android app (`com.imagenecycle.app`) wrapping the Vite/React web UI; browser/dev remains a valid run target.
- Core on-ride loop: start/resume activity → GPS + optional BLE sensors → ClimbPro / map / route guidance → auto-pause/resume on movement → persist session → summarize, history, export.
- Offline maps: world overview online first; country Magene packs downloaded into device storage (OPFS / custom folder). SEA catalog includes PH, VN, SG, MY, ID, TW, BN.
- Supporting flows: route builder / GPX, maps download & storage management, BLE sensor modal, ride summary and history maps.

## Capabilities and Constraints

Confirmed functionality in the product:

- Live GPS tracking, ride metrics (distance, speed, ascent, grade/VAM, riding vs saddle time), breadcrumbs.
- ClimbPro engine for planned routes and free-ride climb recording.
- BLE sensors (e.g. power / HR via Magene-oriented BLE manager).
- Offline Magene M/N/T packs (PMTiles basemap, nav JSON, topo + contour PMTiles); Guru `.vm` / `.rt` / `.elv` explicitly unsupported.
- Route library, OSRM-assisted planning/turns where used, ride history, FIT/GPX/JSON export, Strava connect/upload.
- Foreground/background recording support on Android; monotonic session persistence to avoid metric rollback.

Technical stack (incumbent): React 19, Vite, Tailwind, Leaflet/Protomaps/pmtiles, Capacitor 8 (Android), Express helper server scripts for map tooling.

Undecided / not claimed: iOS ship target, commercial licensing, public CDN pack hosting details as product guarantees.

## Brand Commitments

- Product name: **ImageneCycle** (UI, app id, meta title/description).
- Magene appears as HUD metaphor and offline pack format naming (C706-style computer, Magene M/N/T packs) — not recorded as an official Magene affiliation or endorsement.
- Logo asset: `public/logo.png`.
- Voice: instrument / bike-computer — concise labels, sports HUD terminology (DIST.REM, ClimbPro, riding time, etc.).

## Evidence on Hand

- Runnable app UI under `src/` (notably `MageneDevice` HUD, maps modals, ClimbPro chart, BLE/route/history flows).
- Offline maps docs and SEA catalog: `public/maps/README.md`, `public/maps/catalog.json`.
- Brand mark: `public/logo.png`.
- Do not fabricate: testimonials, benchmarks, pricing, Magene partnership claims, or unsupported map formats.

## Product Principles

1. **Trust the recording** — ride data must not cut off, roll back, or surprise the rider mid-activity.
2. **Glanceable on the bike** — hierarchy and density serve helmet/mount glances, not desktop browsing.
3. **Useful offline** — maps and guidance degrade honestly when packs or network are missing.
4. **Open formats, clear limits** — Magene-compatible packs and standard exports; never pretend Guru proprietary packs work.
5. **Instrument voice** — short, precise cycling terminology over marketing copy in the HUD.
