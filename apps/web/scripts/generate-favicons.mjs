import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');
const sourceSvgPath = path.join(webRoot, 'src/brand/favicon-source.svg');
const publicDir = path.join(webRoot, 'public');

const FILES = {
  svg: 'favicon.svg',
  ico: 'favicon.ico',
  png16: 'favicon-16x16.png',
  png32: 'favicon-32x32.png',
  appleTouch: 'apple-touch-icon.png',
  android192: 'android-chrome-192x192.png',
  android512: 'android-chrome-512x512.png',
  manifest: 'site.webmanifest'
};

async function renderPngBuffer(svgBuffer, size) {
  return sharp(svgBuffer).resize(size, size).png().toBuffer();
}

async function writePng(svgBuffer, size, filename) {
  const output = await renderPngBuffer(svgBuffer, size);
  await fs.writeFile(path.join(publicDir, filename), output);
}

async function run() {
  await fs.mkdir(publicDir, { recursive: true });

  const svgBuffer = await fs.readFile(sourceSvgPath);
  await fs.copyFile(sourceSvgPath, path.join(publicDir, FILES.svg));

  await writePng(svgBuffer, 16, FILES.png16);
  await writePng(svgBuffer, 32, FILES.png32);
  await writePng(svgBuffer, 180, FILES.appleTouch);
  await writePng(svgBuffer, 192, FILES.android192);
  await writePng(svgBuffer, 512, FILES.android512);

  const icoBuffer = await pngToIco([
    await renderPngBuffer(svgBuffer, 16),
    await renderPngBuffer(svgBuffer, 32),
    await renderPngBuffer(svgBuffer, 48)
  ]);
  await fs.writeFile(path.join(publicDir, FILES.ico), icoBuffer);

  const manifest = {
    name: 'Apotheon',
    short_name: 'Apotheon',
    icons: [
      {
        src: `/${FILES.android192}`,
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: `/${FILES.android512}`,
        sizes: '512x512',
        type: 'image/png'
      }
    ],
    theme_color: '#090b12',
    background_color: '#090b12',
    display: 'standalone'
  };

  await fs.writeFile(path.join(publicDir, FILES.manifest), `${JSON.stringify(manifest, null, 2)}\n`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
