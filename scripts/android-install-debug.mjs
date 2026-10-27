/**
 * Replace-install debug APK without uninstalling (preserves ride history).
 * Uses: adb install -r
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apk = path.join(
  root,
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  'debug',
  'app-debug.apk'
);

if (!fs.existsSync(apk)) {
  console.error('APK not found:', apk);
  console.error('Run: npm run android:build:debug');
  process.exit(1);
}

console.log('Installing (replace, keep data):', apk);
const result = spawnSync('adb', ['install', '-r', apk], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if ((result.status ?? 1) !== 0) {
  console.error(`
Install failed. Common causes:
  - Signature mismatch vs previously installed APK (one-time uninstall needed; export rides first)
  - No device / unauthorized USB debugging
See android/README-install.md
`);
  process.exit(result.status ?? 1);
}

console.log('Done. App updated in place — ride history should be intact.');
