/**
 * Increment android/version.properties VERSION_CODE (and patch VERSION_NAME).
 * Usage: node scripts/android-bump-version.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const propsPath = path.join(root, 'android', 'version.properties');

if (!fs.existsSync(propsPath)) {
  console.error('Missing', propsPath);
  process.exit(1);
}

const raw = fs.readFileSync(propsPath, 'utf8');
const lines = raw.split(/\r?\n/);
let code = 11;
let name = '2.0.1';

for (const line of lines) {
  const trimmed = line.trim();
  if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
  const [k, ...rest] = trimmed.split('=');
  const v = rest.join('=').trim();
  if (k.trim() === 'VERSION_CODE') code = parseInt(v, 10) || code;
  if (k.trim() === 'VERSION_NAME') name = v || name;
}

const nextCode = code + 1;
const parts = name.split('.');
if (parts.length >= 3 && /^\d+$/.test(parts[parts.length - 1])) {
  parts[parts.length - 1] = String(parseInt(parts[parts.length - 1], 10) + 1);
  name = parts.join('.');
} else {
  name = `${name}.${nextCode}`;
}

const out = `# Bumped by \`npm run android:bump\` before debug APK builds.
# Android requires versionCode >= installed app for in-place updates.
VERSION_CODE=${nextCode}
VERSION_NAME=${name}
`;

fs.writeFileSync(propsPath, out, 'utf8');
console.log(`Bumped VERSION_CODE ${code} → ${nextCode}, VERSION_NAME → ${name}`);
