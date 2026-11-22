// Draws the DJ Toolbox logo and renders every icon file from it.
// Run with `npm run icons` in this folder (macOS only, it uses `iconutil`).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, '..', 'djHelperApp', 'public');

// Bar heights above the baseline, as in the app's waveform.
const HEIGHTS = [110, 190, 150, 260, 330, 400, 300, 230, 270, 160, 100];
const BASELINE = 610;
const PLAYHEAD_X = 543;

function fullBars() {
  const width = 44;
  const pitch = 62;
  const left = (1024 - ((HEIGHTS.length - 1) * pitch + width)) / 2;
  return HEIGHTS.map((height, index) => {
    const x = left + index * pitch;
    const played = x + width / 2 < PLAYHEAD_X;
    const fill = played ? 'url(#played)' : '#566591';
    const reflection = Math.round(height * 0.45);
    return (
      `<rect x="${x}" y="${BASELINE - height}" width="${width}" height="${height}" rx="22" fill="${fill}"/>` +
      `<rect x="${x}" y="${BASELINE + 14}" width="${width}" height="${reflection}" rx="22" fill="${fill}" opacity="0.3"/>`
    );
  }).join('');
}

// Fewer, thicker bars stay readable at favicon sizes.
function compactBars() {
  const heights = [260, 440, 600, 400, 240];
  const width = 100;
  const pitch = 140;
  const left = (1024 - ((heights.length - 1) * pitch + width)) / 2;
  return heights
    .map(
      (height, index) =>
        `<rect x="${left + index * pitch}" y="${(1024 - height) / 2}" width="${width}" height="${height}" rx="50" fill="url(#played)"/>`,
    )
    .join('');
}

function logoSvg({ compact, bleed }) {
  const detail = compact
    ? compactBars()
    : `${fullBars()}
  <rect x="${PLAYHEAD_X - 3}" y="178" width="6" height="${BASELINE + 90 - 178}" rx="3" fill="#ff5d7a"/>
  <circle cx="${PLAYHEAD_X}" cy="178" r="17" fill="#ff5d7a"/>`;
  const viewBox = bleed ? '100 100 824 824' : '0 0 1024 1024';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="1024" height="1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#232e57"/>
      <stop offset="1" stop-color="#0b0f1a"/>
    </linearGradient>
    <linearGradient id="played" gradientUnits="userSpaceOnUse" x1="180" y1="200" x2="544" y2="640">
      <stop offset="0" stop-color="#7596ff"/>
      <stop offset="1" stop-color="#a45bff"/>
    </linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.28"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.04"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.1"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#7f5bff" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#7f5bff" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="body"><rect x="100" y="100" width="824" height="824" rx="186"/></clipPath>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#000000" flood-opacity="0.45"/>
    </filter>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="186" fill="#0b0f1a" filter="url(#shadow)"/>
  <rect x="100" y="100" width="824" height="824" rx="186" fill="url(#bg)"/>
  <g clip-path="url(#body)">
    <ellipse cx="512" cy="540" rx="440" ry="330" fill="url(#glow)"/>
    ${detail}
  </g>
  <rect x="103" y="103" width="818" height="818" rx="183" fill="none" stroke="url(#rim)" stroke-width="6"/>
</svg>
`;
}

function renderPng(svg, size) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
}

// Windows-style .ico that embeds PNGs, which every browser accepts.
function buildIco(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    // 0 means 256 in an .ico directory entry.
    header.writeUInt8(size % 256, entry);
    header.writeUInt8(size % 256, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

function buildIcns(svg, target) {
  const iconset = fs.mkdtempSync(path.join(os.tmpdir(), 'djtoolbox-')) + '/icon.iconset';
  fs.mkdirSync(iconset);
  for (const size of [16, 32, 128, 256, 512]) {
    fs.writeFileSync(path.join(iconset, `icon_${size}x${size}.png`), renderPng(svg, size));
    fs.writeFileSync(path.join(iconset, `icon_${size}x${size}@2x.png`), renderPng(svg, size * 2));
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', target]);
  fs.rmSync(path.dirname(iconset), { recursive: true });
}

const appIcon = logoSvg({ compact: false, bleed: false });
const favicon = logoSvg({ compact: true, bleed: true });

fs.writeFileSync(path.join(here, 'icon.svg'), appIcon);
buildIcns(appIcon, path.join(here, 'icon.icns'));

fs.writeFileSync(path.join(publicDir, 'favicon.svg'), favicon);
fs.writeFileSync(
  path.join(publicDir, 'favicon.ico'),
  buildIco([16, 32, 48].map((size) => ({ size, png: renderPng(favicon, size) }))),
);
const fullBleed = logoSvg({ compact: false, bleed: true });
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), renderPng(fullBleed, 180));

// The Windows app icon: the simple logo for small sizes, the detailed one from 48px up.
fs.writeFileSync(
  path.join(here, 'icon.ico'),
  buildIco(
    [16, 24, 32, 48, 64, 128, 256].map((size) => ({
      size,
      png: renderPng(size <= 32 ? favicon : fullBleed, size),
    })),
  ),
);

console.log(
  'Wrote desktop/icon.{svg,icns,ico} and djHelperApp/public/{favicon.svg,favicon.ico,apple-touch-icon.png}',
);
