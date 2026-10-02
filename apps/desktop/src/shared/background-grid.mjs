// The faint grid behind the recording. One definition, used by the viewer (drawn into
// the background layer) and by the export (an ffmpeg pixel filter), so what you see in the
// editor is what you export. The cyan centre/third guides are NOT part of this: they are an
// editing aid and stay in the viewer only.

export const BACKGROUND_GRID_COLUMNS = 12;
export const BACKGROUND_GRID_ROWS = 12;
export const BACKGROUND_GRID_RGB = Object.freeze([148, 163, 184]);
export const BACKGROUND_GRID_ALPHA = 0.18;

/**
 * Is the grid on? An explicit choice always wins. Without one it is on for a plain colour
 * (the dark editor look) and off for wallpapers and gradients, where lines would fight the picture.
 */
export function isBackgroundGridOn(background) {
  if (typeof background?.bgGrid === 'boolean') return background.bgGrid;
  return !background?.bgImage && !background?.bgGradient;
}

/** Canvas version, for the viewer. Interior lines only: no line on the outer edge. */
export function drawBackgroundGrid(ctx, canvasWidth, canvasHeight) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(${BACKGROUND_GRID_RGB.join(', ')}, ${BACKGROUND_GRID_ALPHA})`;
  ctx.beginPath();
  for (let i = 1; i < BACKGROUND_GRID_COLUMNS; i += 1) {
    const x = (canvasWidth / BACKGROUND_GRID_COLUMNS) * i;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasHeight);
  }
  for (let i = 1; i < BACKGROUND_GRID_ROWS; i += 1) {
    const y = (canvasHeight / BACKGROUND_GRID_ROWS) * i;
    ctx.moveTo(0, y);
    ctx.lineTo(canvasWidth, y);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * ffmpeg version, for the export: a single-frame filter that blends the same lines over
 * whatever the background already is. A 1px line centred on a pixel boundary covers two
 * pixel columns at half strength, exactly what the canvas stroke above produces.
 */
export function buildBackgroundGridFilter() {
  const cols = BACKGROUND_GRID_COLUMNS;
  const rows = BACKGROUND_GRID_ROWS;
  // Coverage of the nearest interior line along one axis (0 at the outer edges).
  const coverage = (pos, size, divisions) => {
    const step = `${size}/${divisions}`;
    const m = `mod(${pos}+0.5,${step})`;
    return `gt(${pos},1)*lt(${pos},${size}-1)*max(0,1-min(${m},${step}-${m}))`;
  };
  const strength = `${BACKGROUND_GRID_ALPHA}*max(${coverage('X', 'W', cols)},${coverage('Y', 'H', rows)})`;
  const channel = (plane, value) => `${plane}='${plane}(X,Y)+(${value}-${plane}(X,Y))*${strength}'`;
  const [r, g, b] = BACKGROUND_GRID_RGB;
  return `format=rgb24,geq=${channel('r', r)}:${channel('g', g)}:${channel('b', b)},format=rgba`;
}
