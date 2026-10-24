/**
 * Fail the build if country .pmtiles sit under public/maps — they inflate the APK.
 * Sideload via `npm run maps:zip` → phone Download/ImageneCycle/ instead.
 *
 * Usage: node scripts/guard-no-bundled-pmtiles.mjs
 */

import { existsSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('..', import.meta.url));
const mapsDir = join(root, 'public', 'maps');

function walkPmtiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkPmtiles(full, out);
    else if (name.toLowerCase().endsWith('.pmtiles')) out.push(full);
  }
  return out;
}

const found = walkPmtiles(mapsDir);
if (found.length) {
  console.error('Refusing to proceed: .pmtiles under public/maps would ship in the app bundle:\n');
  for (const f of found) {
    const mb = (statSync(f).size / (1024 * 1024)).toFixed(1);
    console.error(`  ${relative(root, f)} (${mb} MB)`);
  }
  console.error('\nKeep them gitignored locally for maps:zip, but remove from public/maps before release.');
  console.error('Sideload: npm run maps:zip -- --id=ph → copy zip to Download/ImageneCycle/ on the phone.');
  process.exit(1);
}

console.log('maps:guard OK — no .pmtiles under public/maps');
