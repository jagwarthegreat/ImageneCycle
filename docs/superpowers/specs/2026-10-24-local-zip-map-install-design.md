# Local zip map install — design

**Date:** 2026-10-24  
**Status:** Approved / implemented

## Problem

Country PMTiles (~726 MB for Philippines) cannot ship in the APK and cannot use Supabase Free (~50 MB upload). Offline maps must still install onto the phone.

## Decision

Install from a **local per-country zip** already on the device. No CDN download for pack binaries.

## Flow

1. Ops: `maps:extract` / `maps:contours` → `npm run maps:zip -- --id=ph` → `dist-map-zips/philippines-maps.zip`
2. User copies zip to `Download/ImageneCycle/`
3. App **Download Maps** → scan that folder for `{slug}-maps.zip`, or **Browse**
4. Stream-unzip needed entries into existing Maps Storage (OPFS / custom)
5. Runtime basemap unchanged (`PMTiles` + `FileSource`)

## Package contract

| Item | Value |
|------|--------|
| Zip name | `{slug}-maps.zip` |
| Members (flat) | `{slug}.pmtiles`, `{slug}.contour.pmtiles`, `{slug}.nav.json`, `{slug}.topo.json` |
| Compression | STORE (level 0) — PMTiles already compressed |
| After install | Keep zip on disk |

## Constraints

- No network fetch for pack binaries
- Never load whole archive via `Filesystem.readFile` base64
- Stream unzip; stream-write large PMTiles chunks to OPFS
- `maps:guard` still blocks bundling `.pmtiles` in release builds

## Key modules

- `src/utils/mapZipInstall.ts` — scan, browse, stream extract
- `src/utils/mapPacks.ts` — `installMapLayerFromZip`
- `src/components/DownloadMapsModal.tsx` — Install / Browse UX
- `scripts/zip-country-map.mjs` — build sideload zips
