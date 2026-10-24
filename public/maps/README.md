# Offline map packs (local zip install)

The app **does not ship** country map binaries. First load shows a **world overview** (online OSM/Carto). Users install OpenStreetMap-derived Magene packs from a **local zip** on the phone into Maps Storage (OPFS / Custom folder) for offline rides.

| Layer | Magene file | Role |
|-------|-------------|------|
| **M** Map | `{id} - {Name}.map.pmtiles` | Protomaps vector basemap (OSM data); DET paints dense labels/POIs |
| **N** Navigation | `{id} - {Name}.nav.json` | Routing assistance pack |
| **T** Topographic | `{id} - {Name}.topo.json` + `{id} - {Name}.contour.pmtiles` | Contour overlay offline; elev mainly from saved routes |

**Not supported:** Guru Maps Pro `.vm` / `.rt` / `.elv` (proprietary GLMap). Those files must not be added to the app bundle or Maps Storage for rendering.

## SEA catalog

Philippines, Vietnam, Singapore, Malaysia, Indonesia, Taiwan, Brunei — see [`catalog.json`](./catalog.json).

## What ships in the SPA

```
public/maps/catalog.json          # country list + sizes / bbox
public/maps/packs/*.nav.json      # N stubs
public/maps/packs/*.topo.json     # T manifests (magene-topo-v2)
public/maps/packs/.gitkeep
```

Large binaries are **gitignored**:

- `*.pmtiles` (map + contour), Guru `*.vm` / `*.rt` / `*.elv`, caches, `tileCache.db`
- `dist-map-zips/` (sideload archives from `npm run maps:zip`)

## Build + sideload a country zip

1. Build a country map extract:

   ```bash
   npm run maps:extract -- --id=ph
   # writes public/maps/packs/philippines.pmtiles (gitignored)
   ```

2. Build topographic contours (T companion):

   ```bash
   npm run maps:contours -- --id=ph
   ```

3. Refresh N/T JSON stubs (optional):

   ```bash
   node scripts/write-sea-pack-stubs.mjs
   ```

4. Pack a sideload zip (**STORE** / no recompression):

   ```bash
   npm run maps:zip -- --id=ph
   # → dist-map-zips/philippines-maps.zip
   ```

   Flat members inside the zip:

   ```
   philippines.pmtiles
   philippines.contour.pmtiles
   philippines.nav.json
   philippines.topo.json
   ```

5. Copy the zip onto the phone:

   ```
   Download/ImageneCycle/philippines-maps.zip
   ```

   USB, Drive, or any file manager is fine. On Android 13+, if the app cannot scan that folder, use **Browse** in Download Maps.

6. In the app: **Download Maps** → **Install** (or Browse). Files land in Maps Storage; the zip is left on disk.

7. Before Android release: `npm run maps:guard` (fails if any `public/maps/packs/*.pmtiles` would ship in the bundle). Keep accurate `bytes` / `contourBytes` in the catalog.

Network CDN / Supabase upload is **not** used for install. Optional `VITE_MAP_PACK_*` env vars are unused for this flow.

## Runtime

1. No local country pack → world overview tiles (online).
2. User installs M (and optionally N/T) via **Download Maps** from a local zip → OPFS / Custom.
3. GPS inside pack bbox → `protomaps-leaflet` loads the local M blob offline.
4. **DET** (details) densifies labels + OsmAnd-style POI kinds from the M pack.
5. **T installed** → contour PMTiles overlay (not gated on DET).
6. Outside bbox or pack deleted → world overview again.

## Maps Storage

Profile → **Maps Storage**:

- **Internal** — OPFS (`MageneMaps/`)
- **Custom** — File System Access directory (Chromium)

Deleting a layer frees phone storage (T also deletes the companion contour file). Do not copy Guru dumps into this folder expecting them to render.
