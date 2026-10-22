# Offline map packs (Guru-style downloads)

The app **does not ship** country map binaries. First load shows a **world overview** (online OSM/Carto). Users download OpenStreetMap-derived Magene packs into phone storage (OPFS / Custom folder) for offline rides.

| Layer | Magene file | Role |
|-------|-------------|------|
| **M** Map | `{id} - {Name}.map.pmtiles` | Protomaps vector basemap (OSM data) |
| **N** Navigation | `{id} - {Name}.nav.json` | Routing assistance pack |
| **T** Topographic | `{id} - {Name}.topo.json` | Topo pack; elev mainly from saved routes |

**Not supported:** Guru Maps Pro `.vm` / `.rt` / `.elv` (proprietary GLMap). Those files must not be added to the app bundle or Maps Storage for rendering.

## What ships in the SPA

```
public/maps/catalog.json          # country list + remote pack URLs + sizes
public/maps/packs/*.nav.json      # tiny hostable N stubs (optional)
public/maps/packs/*.topo.json     # tiny hostable T stubs (optional)
public/maps/packs/.gitkeep
```

Large binaries are **gitignored**:

- `*.pmtiles`, Guru `*.vm` / `*.rt` / `*.elv`, caches, `tileCache.db`

## Publishing packs (ops / CDN)

1. Build a country extract (example Philippines):

   ```bash
   npm run maps:ph
   # downloads go-pmtiles CLI once, extracts PH from a recent Protomaps daily build
   # writes public/maps/packs/philippines.pmtiles (gitignored)
   # or: PMTILES_URL=https://… npm run maps:ph
   # or: PROTOMAPS_BUILD=YYYYMMDD npm run maps:ph
   ```

2. Upload `{country}.pmtiles` (and nav/topo JSON) to the same paths as `layers.*.url` in [`catalog.json`](./catalog.json), e.g.:

   ```
   /maps/packs/philippines.pmtiles
   /maps/packs/philippines.nav.json
   /maps/packs/philippines.topo.json
   ```

3. Or point catalog URLs at your CDN (absolute HTTPS). The app downloads into Maps Storage; install = valid local file (PMTiles magic), not “file exists on the server”.

4. Keep accurate `bytes` in the catalog for Download Maps size labels.

## Runtime

1. No local country pack → world overview tiles (online).
2. User downloads M (and optionally N/T) via **Download Maps** → OPFS / Custom.
3. GPS inside pack bbox → `protomaps-leaflet` loads the local blob URL offline.
4. Outside bbox or pack deleted → world overview again.

## Maps Storage

Profile → **Maps Storage**:

- **Internal** — OPFS (`MageneMaps/`)
- **Custom** — File System Access directory (Chromium)

Deleting a layer frees phone storage. Do not copy Guru dumps into this folder expecting them to render.
