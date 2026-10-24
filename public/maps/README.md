# Offline map packs (Guru-style downloads)

The app **does not ship** country map binaries. First load shows a **world overview** (online OSM/Carto). Users download OpenStreetMap-derived Magene packs into phone storage (OPFS / Custom folder) for offline rides.

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
public/maps/catalog.json          # country list + remote pack URLs + sizes
public/maps/packs/*.nav.json      # hostable N stubs
public/maps/packs/*.topo.json     # hostable T manifests (magene-topo-v2)
public/maps/packs/.gitkeep
```

Large binaries are **gitignored**:

- `*.pmtiles` (map + contour), Guru `*.vm` / `*.rt` / `*.elv`, caches, `tileCache.db`

## Publishing packs (ops / CDN)

1. Build a country map extract:

   ```bash
   npm run maps:extract -- --id=ph
   # or: npm run maps:ph
   # writes public/maps/packs/philippines.pmtiles (gitignored)
   # PMTILES_URL=https://… npm run maps:extract -- --id=vn
   # PROTOMAPS_BUILD=YYYYMMDD npm run maps:extract -- --id=sg
   ```

2. Build topographic contours (T companion):

   ```bash
   npm run maps:contours -- --id=ph
   # synthetic DEM isolines by default (ride-map look)
   # real isolines: CONTOUR_GEOJSON=./ph.geojson npm run maps:contours -- --id=ph
   # or: CONTOUR_PMTILES_URL=https://… npm run maps:contours -- --id=ph
   ```

3. Refresh N/T JSON stubs (optional):

   ```bash
   node scripts/write-sea-pack-stubs.mjs
   ```

4. Upload to the same paths as `layers.*.url` / `contourUrl` in [`catalog.json`](./catalog.json), e.g.:

   ```
   /maps/packs/philippines.pmtiles
   /maps/packs/philippines.nav.json
   /maps/packs/philippines.topo.json
   /maps/packs/philippines.contour.pmtiles
   ```

5. Or point catalog URLs at your CDN (absolute HTTPS). The app downloads into Maps Storage; install = valid local file (PMTiles magic / JSON), not “file exists on the server”.

6. Keep accurate `bytes` / `contourBytes` in the catalog for Download Maps size labels. `topo.bytes` should cover manifest + contour total.

## Runtime

1. No local country pack → world overview tiles (online).
2. User downloads M (and optionally N/T) via **Download Maps** → OPFS / Custom.
3. GPS inside pack bbox → `protomaps-leaflet` loads the local M blob offline.
4. **DET** (details) densifies labels + OsmAnd-style POI kinds from the M pack.
5. **T installed** → contour PMTiles overlay (not gated on DET).
6. Outside bbox or pack deleted → world overview again.

## Maps Storage

Profile → **Maps Storage**:

- **Internal** — OPFS (`MageneMaps/`)
- **Custom** — File System Access directory (Chromium)

Deleting a layer frees phone storage (T also deletes the companion contour file). Do not copy Guru dumps into this folder expecting them to render.
