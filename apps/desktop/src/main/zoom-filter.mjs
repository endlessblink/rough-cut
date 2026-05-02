const STRENGTH_TO_SCALE_DELTA = 1.5;

export function buildZoomFilter({ markers = [], sourceWidth, sourceHeight, fps = 30 } = {}) {
  if (!Array.isArray(markers) || markers.length === 0) {
    return { filterFragment: null, present: false };
  }
  if (!isPositiveInt(sourceWidth) || !isPositiveInt(sourceHeight)) {
    throw new Error('buildZoomFilter requires positive sourceWidth and sourceHeight.');
  }
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error('buildZoomFilter requires a positive fps to pin zoompan output rate.');
  }

  const sorted = [...markers].sort((a, b) => a.startFrame - b.startFrame);
  const z = composeZExpression(sorted);
  const x = composeAxisExpression(sorted, 'focalX', sourceWidth);
  const y = composeAxisExpression(sorted, 'focalY', sourceHeight);

  return {
    filterFragment: `zoompan=z='${z}':x='${x}':y='${y}':d=1:s=${sourceWidth}x${sourceHeight}:fps=${fps}`,
    present: true,
  };
}

function composeZExpression(sortedMarkers) {
  let expr = '1';
  for (let i = sortedMarkers.length - 1; i >= 0; i -= 1) {
    const marker = sortedMarkers[i];
    const ramp = composeRampExpression(marker);
    const delta = STRENGTH_TO_SCALE_DELTA * marker.strength;
    const inside = `1+${formatNumber(delta)}*(${ramp})`;
    expr = wrapInMarker(marker, inside, expr);
  }
  return expr;
}

function composeAxisExpression(sortedMarkers, axisKey, sourceDim) {
  let expr = '0';
  for (let i = sortedMarkers.length - 1; i >= 0; i -= 1) {
    const marker = sortedMarkers[i];
    const focal = axisKey === 'focalX' ? marker.focalPoint.x : marker.focalPoint.y;
    const focalLit = formatNumber(focal);
    const inside = `${sourceDim}*max(0,min(${focalLit}-1/(2*zoom),1-1/zoom))`;
    expr = wrapInMarker(marker, inside, expr);
  }
  return expr;
}

function composeRampExpression(marker) {
  const startFrame = marker.startFrame;
  const endFrame = marker.endFrame;
  const inEnd = startFrame + marker.zoomInDuration;
  const outStart = endFrame - marker.zoomOutDuration;
  const tIn = `(on-${startFrame})/${marker.zoomInDuration}`;
  const tOut = `(${endFrame}-on)/${marker.zoomOutDuration}`;
  const inside =
    `if(lt(on,${inEnd}),${smootherStepExpression(tIn)},` +
    `if(lt(on,${outStart}),1,${smootherStepExpression(tOut)}))`;
  return inside;
}

function smootherStepExpression(t) {
  return `(6*pow(${t},5)-15*pow(${t},4)+10*pow(${t},3))`;
}

function wrapInMarker(marker, insideExpr, fallbackExpr) {
  return `if(lt(on,${marker.startFrame}),${fallbackExpr},if(lt(on,${marker.endFrame}),${insideExpr},${fallbackExpr}))`;
}

function isPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    throw new Error(`zoom-filter: non-finite number ${value}`);
  }
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}
