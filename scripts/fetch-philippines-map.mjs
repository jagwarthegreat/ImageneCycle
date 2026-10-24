/**
 * Back-compat wrapper — prefer: npm run maps:extract -- --id=ph
 */
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, 'fetch-country-map.mjs');
const result = spawnSync(process.execPath, [script, '--id=ph', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env
});
process.exit(result.status ?? 1);
