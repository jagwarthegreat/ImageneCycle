# Country pack stubs (dehydrated)

Tiny N/T JSON stubs live here for the catalog. **Do not commit** large binaries.

| File | Commit? |
|------|---------|
| `*.nav.json` / `*.topo.json` | OK (tiny stubs / T manifests) |
| `*.pmtiles` / `*.contour.pmtiles` | No — gitignored local build artifacts only |
| Guru `*.vm` / `*.rt` / `*.elv` | No — unsupported |

**Sideload flow:** build binaries with `npm run maps:extract` / `maps:contours`, then `npm run maps:zip -- --id=ph`. Copy the zip to the phone (`Download/ImageneCycle/`). Never put `.pmtiles` in the APK — `npm run maps:guard` / `build:release` will fail if they sit under `public/maps`.

See [../README.md](../README.md).
