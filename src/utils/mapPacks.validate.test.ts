import { validatePackBlob, isGuruProprietaryFileName } from './mapPacks';

/** Self-check for pack validation — run: npx tsx src/utils/mapPacks.validate.test.ts */
export async function assertValidate(): Promise<void> {
  const header = new TextEncoder().encode('PMTiles');
  const pad = new Uint8Array(1024);
  pad.set(header, 0);
  await validatePackBlob('map', new Blob([pad]));

  let failed = false;
  try {
    await validatePackBlob('map', new Blob([new TextEncoder().encode('<!DOCTYPE html>')]));
  } catch {
    failed = true;
  }
  if (!failed) throw new Error('HTML should fail PMTiles validation');

  failed = false;
  try {
    await validatePackBlob('map', new Blob([new Uint8Array([0x34, 0x6d, 0x6f, 0x67, ...new Array(20).fill(0)])]));
  } catch {
    failed = true;
  }
  if (!failed) throw new Error('Guru 4mog should fail');

  if (!isGuruProprietaryFileName('443174 - Philippines.vm')) {
    throw new Error('Guru filename not detected');
  }

  await validatePackBlob(
    'navigation',
    new Blob([JSON.stringify({ format: 'magene-nav-v1' })], { type: 'application/json' })
  );
}

const isMain =
  typeof process !== 'undefined' &&
  (process.argv[1]?.endsWith('mapPacks.validate.test.ts') ||
    process.argv[1]?.endsWith('mapPacks.validate.test.js'));

if (isMain) {
  assertValidate()
    .then(() => console.log('mapPacks.validate ok'))
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
}
