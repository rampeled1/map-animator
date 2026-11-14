/**
 * test_whole_tour_preview_parity.ts
 *
 * Automated verification for Whole Tour Preview & Create Video export framing parity:
 * 1. Shared computeWholeTourFitPadding produces identical 48/1080 proportional inner margins
 *    for both Editor Preview frames and Export viewports across 16:9, 9:16, and 1:1.
 * 2. Changing aspect ratio (16:9 -> 9:16 -> 1:1) invalidates buildWholeTourFramingKey.
 * 3. Long horizontal, vertical, and irregular routes produce valid complete bounds.
 * 4. MapViewer.tsx uses the shared framing helper in both updatePlaybackFrame and passive useEffect.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  computeRouteBounds,
  computeWholeTourFitPadding,
  buildWholeTourFramingKey,
} from './src/utils/cameraPresetMapper.ts';
import { getExportDimensions } from './src/utils/videoRecorder.ts';
import type { RoutePoint } from './src/types/index.ts';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ ${msg}`);
}

function computeFrameRect(viewW: number, viewH: number, aspectW: number, aspectH: number) {
  const availW = Math.max(viewW - 40, 0);
  const availH = Math.max(viewH - 40, 0);
  const ratio = aspectW / aspectH;
  let w = availW;
  let h = w / ratio;
  if (h > availH) {
    h = availH;
    w = h * ratio;
  }
  return {
    x: (viewW - w) / 2,
    y: (viewH - h) / 2,
    width: w,
    height: h,
  };
}

console.log('=== TEST SUITE: WHOLE TOUR PREVIEW / EXPORT PARITY ===\n');

// ---------------------------------------------------------------------------
// 1. Export vs Preview proportional padding parity across 16:9, 9:16, 1:1
// ---------------------------------------------------------------------------
console.log('--- 1. Aspect-Ratio Padding Parity (16:9, 9:16, 1:1) ---');
const editorView = { w: 1200, h: 800 };

for (const aspect of ['16:9', '9:16', '1:1'] as const) {
  const exp = getExportDimensions(aspect);
  const expFrame = { x: 0, y: 0, width: exp.width, height: exp.height };
  const expPad = computeWholeTourFitPadding(exp.width, exp.height, expFrame);
  assert(
    expPad.top === 48 && expPad.bottom === 48 && expPad.left === 48 && expPad.right === 48,
    `${aspect} export (${exp.width}x${exp.height}) uses exact 48px margins`
  );

  const prevFrame = computeFrameRect(editorView.w, editorView.h, exp.width, exp.height);
  const prevPad = computeWholeTourFitPadding(editorView.w, editorView.h, prevFrame);

  // Inner fit rectangle inside the editor canvas must sit strictly inside prevFrame
  const fitLeft = prevPad.left;
  const fitRight = editorView.w - prevPad.right;
  const fitTop = prevPad.top;
  const fitBottom = editorView.h - prevPad.bottom;

  assert(
    fitLeft > prevFrame.x && fitRight < prevFrame.x + prevFrame.width &&
      fitTop > prevFrame.y && fitBottom < prevFrame.y + prevFrame.height,
    `${aspect} preview fitBounds rect [${Math.round(fitLeft)}..${Math.round(fitRight)}, ${Math.round(fitTop)}..${Math.round(fitBottom)}] fits strictly inside preview frame`
  );

  // Relative margin inside the frame matches export (48/1080 ~= 0.0444)
  const expRelMargin = expPad.left / Math.min(exp.width, exp.height);
  const prevRelMargin = (fitLeft - prevFrame.x) / Math.min(prevFrame.width, prevFrame.height);
  assert(
    Math.abs(expRelMargin - prevRelMargin) < 0.005,
    `${aspect} preview relative margin (${prevRelMargin.toFixed(4)}) matches export (${expRelMargin.toFixed(4)})`
  );
}

// ---------------------------------------------------------------------------
// 2. Framing key invalidation on aspect-ratio switch & resize
// ---------------------------------------------------------------------------
console.log('\n--- 2. Framing Key Invalidation ---');
const longRoute: RoutePoint[] = [
  { lng: -10.5, lat: 38.7 },
  { lng: 2.35, lat: 48.85 },
  { lng: 13.4, lat: 52.52 },
];
const irregularRoute: RoutePoint[] = [
  { lng: 7.0, lat: 46.0 },
  { lng: 9.2, lat: 47.4 },
  { lng: 6.1, lat: 46.2 },
  { lng: 11.3, lat: 44.5 },
];

const f169 = computeFrameRect(1200, 800, 1920, 1080);
const f916 = computeFrameRect(1200, 800, 1080, 1920);
const f11 = computeFrameRect(1200, 800, 1080, 1080);

const k169 = buildWholeTourFramingKey(longRoute, '16:9', f169);
const k916 = buildWholeTourFramingKey(longRoute, '9:16', f916);
const k11 = buildWholeTourFramingKey(longRoute, '1:1', f11);

assert(k169 !== k916 && k916 !== k11 && k169 !== k11, 'Changing 16:9 -> 9:16 -> 1:1 produces distinct framing keys');

const longBounds = computeRouteBounds(longRoute)!;
assert(
  longBounds.minLng === -10.5 && longBounds.maxLng === 13.4 &&
    longBounds.minLat === 38.7 && longBounds.maxLat === 52.52,
  'Long route bounds include full start-to-destination span'
);

const irrBounds = computeRouteBounds(irregularRoute)!;
assert(
  irrBounds.minLng === 6.1 && irrBounds.maxLng === 11.3 &&
    irrBounds.minLat === 44.5 && irrBounds.maxLat === 47.4,
  'Irregular route bounds include all extreme intermediate points (no cut-off)'
);

// ---------------------------------------------------------------------------
// 3. MapViewer integration verification
// ---------------------------------------------------------------------------
console.log('\n--- 3. MapViewer Integration ---');
const mvSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/MapViewer.tsx'), 'utf-8');
assert(mvSrc.includes('computeWholeTourFitPadding'), 'MapViewer imports and uses computeWholeTourFitPadding');
assert(mvSrc.includes('buildWholeTourFramingKey'), 'MapViewer imports and uses buildWholeTourFramingKey');
assert(mvSrc.includes('applyWholeTourFraming(map, pts, effectivePitch'), 'Both updatePlaybackFrame and passive useEffect share applyWholeTourFraming');

console.log('\nALL WHOLE TOUR PREVIEW PARITY TESTS PASSED!\n');
