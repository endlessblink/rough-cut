// Builds the Windows app icon (a multi-size .ico: 16, 32, 48, 256 px) from the 1024 px PNG, with ffmpeg.
//
// The source PNG has no transparency: a near-black rounded square (about 938 px wide, corner radius about 155 px,
// starting at x=42, y=43) on a pure-black background. On the dark Windows taskbar that is an invisible black square.
// So the rounded square is cut out with transparent corners and placed on a light rounded plate, which gives it a
// visible edge on dark and light taskbars alike.

import { spawnSync } from 'node:child_process';

export const ICON_SIZES = [16, 32, 48, 256];

// Source artwork geometry, measured on rough-cut-mvp-icon.png.
const ART = { x: 42, y: 43, size: 938, radius: 155 };
const CANVAS = 1024;
const ART_SCALED = 940;
const PLATE = { half: 508, radius: 170 };

// Anti-aliased rounded-rectangle alpha for geq: `half` is the half-width, `radius` the corner radius, centred at (cx, cx).
const roundedAlpha = (cx, half, radius) => `255*clip(${radius}-hypot(max(abs(X-${cx})-${half - radius},0),max(abs(Y-${cx})-${half - radius},0))+0.5,0,1)`;

export function iconFilter() {
  const artHalf = ART_SCALED / 2;
  const artRadius = Math.round(ART.radius * (ART_SCALED / ART.size));
  const offset = (CANVAS - ART_SCALED) / 2;
  const art = `[0:v]crop=${ART.size}:${ART.size}:${ART.x}:${ART.y},scale=${ART_SCALED}:${ART_SCALED},format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${roundedAlpha(artHalf, artHalf, artRadius)}'[art]`;
  const plate = `color=c=0xe6eaf2:s=${CANVAS}x${CANVAS},format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${roundedAlpha(CANVAS / 2, PLATE.half, PLATE.radius)}'[plate]`;
  const joined = `[plate][art]overlay=${offset}:${offset}:format=auto:eof_action=endall,format=rgba,split=${ICON_SIZES.length}${ICON_SIZES.map((_, index) => `[s${index}]`).join('')}`;
  const sizes = ICON_SIZES.map((size, index) => `[s${index}]scale=${size}:${size}:flags=lanczos,format=rgba[i${size}]`);
  return [art, plate, joined, ...sizes].join(';');
}

export function makeIcon(png, out, { ffmpeg = 'ffmpeg' } = {}) {
  const maps = ICON_SIZES.flatMap((size) => ['-map', `[i${size}]`]);
  const result = spawnSync(ffmpeg, ['-y', '-v', 'error', '-i', png, '-filter_complex', iconFilter(), ...maps, '-frames:v', '1', '-c:v', 'png', out], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Could not build the app icon with ffmpeg: ${result.stderr}`);
}
