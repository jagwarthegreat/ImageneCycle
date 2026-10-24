# Hostable country packs

Publish Magene files here (or on a CDN with matching `catalog.json` URLs). **Do not commit** large binaries.

| File | Commit? |
|------|---------|
| `*.nav.json` / `*.topo.json` | OK (tiny stubs / T manifests) |
| `*.pmtiles` / `*.contour.pmtiles` | No — gitignored; `npm run maps:extract` / `npm run maps:contours` |
| Guru `*.vm` / `*.rt` / `*.elv` | No — unsupported |

See [../README.md](../README.md).
