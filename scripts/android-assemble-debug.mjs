/**
 * Run Gradle assembleDebug from android/ (Windows + Unix).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(root, 'android');
const isWin = process.platform === 'win32';
const gradlew = path.join(androidDir, isWin ? 'gradlew.bat' : 'gradlew');

const result = spawnSync(gradlew, ['assembleDebug'], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: isWin
});

process.exit(result.status ?? 1);
