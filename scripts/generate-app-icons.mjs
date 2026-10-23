/**
 * Generate Android launcher + splash assets from public/logo.png
 */
import sharp from 'sharp';
import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'public', 'logo.png');
const resDir = path.join(root, 'android', 'app', 'src', 'main', 'res');
const NAVY = { r: 11, g: 18, b: 32, alpha: 1 }; // #0B1220

const densities = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192
};

// Adaptive foreground is typically 108dp; keep same pixel sizes as legacy launcher
const fgDensities = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432
};

async function writeIcon(outPath, size) {
  await mkdir(path.dirname(outPath), { recursive: true });
  await sharp(src)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .png()
    .toFile(outPath);
  console.log('wrote', path.relative(root, outPath), `${size}x${size}`);
}

async function writeSplash(outPath, width, height) {
  await mkdir(path.dirname(outPath), { recursive: true });
  const logoSize = Math.round(Math.min(width, height) * 0.55);
  const logoBuf = await sharp(src)
    .resize(logoSize, logoSize, { fit: 'contain', background: NAVY })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: NAVY
    }
  })
    .composite([{ input: logoBuf, gravity: 'centre' }])
    .png()
    .toFile(outPath);
  console.log('wrote', path.relative(root, outPath), `${width}x${height}`);
}

async function main() {
  for (const [density, size] of Object.entries(densities)) {
    const dir = path.join(resDir, `mipmap-${density}`);
    await writeIcon(path.join(dir, 'ic_launcher.png'), size);
    await writeIcon(path.join(dir, 'ic_launcher_round.png'), size);
  }

  for (const [density, size] of Object.entries(fgDensities)) {
    const dir = path.join(resDir, `mipmap-${density}`);
    await writeIcon(path.join(dir, 'ic_launcher_foreground.png'), size);
  }

  // Default + a few splash sizes (logo centered on navy)
  await writeSplash(path.join(resDir, 'drawable', 'splash.png'), 480, 800);
  await writeSplash(path.join(resDir, 'drawable-port-mdpi', 'splash.png'), 320, 480);
  await writeSplash(path.join(resDir, 'drawable-port-hdpi', 'splash.png'), 480, 800);
  await writeSplash(path.join(resDir, 'drawable-port-xhdpi', 'splash.png'), 720, 1280);
  await writeSplash(path.join(resDir, 'drawable-port-xxhdpi', 'splash.png'), 1080, 1920);
  await writeSplash(path.join(resDir, 'drawable-port-xxxhdpi', 'splash.png'), 1440, 2560);
  await writeSplash(path.join(resDir, 'drawable-land-mdpi', 'splash.png'), 480, 320);
  await writeSplash(path.join(resDir, 'drawable-land-hdpi', 'splash.png'), 800, 480);
  await writeSplash(path.join(resDir, 'drawable-land-xhdpi', 'splash.png'), 1280, 720);
  await writeSplash(path.join(resDir, 'drawable-land-xxhdpi', 'splash.png'), 1920, 1080);
  await writeSplash(path.join(resDir, 'drawable-land-xxxhdpi', 'splash.png'), 2560, 1440);

  // Also keep a copy under assets for reference
  await copyFile(src, path.join(root, 'android', 'app', 'src', 'main', 'assets', 'public', 'logo.png')).catch(() => {});

  console.log('done');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
