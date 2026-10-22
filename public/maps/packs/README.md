# Hostable country packs

Publish Magene files here (or on a CDN with matching `catalog.json` URLs). **Do not commit** large binaries.

| File | Commit? |
|------|---------|
| `*.nav.json` / `*.topo.json` | OK (tiny stubs) |
| `*.pmtiles` | No — gitignored; build with `npm run maps:ph` or upload from CI |
| Guru `*.vm` / `*.rt` / `*.elv` | No — unsupported |

See [../README.md](../README.md).
