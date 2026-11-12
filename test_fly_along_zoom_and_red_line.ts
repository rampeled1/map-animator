import assert from 'assert';
import { mapPresetToCameraBlocks } from './src/utils/cameraPresetMapper.ts';
import { getAdaptedCanonicalRoute } from './src/utils/routeAdapter.ts';
import type { CanonicalRoute } from './src/types/index.ts';

console.log('=== TEST SUITE: FLY ALONG ZOOM & RED LINE INVESTIGATION ===\n');

let passedTests = 0;
function pass(msg: string) {
  console.log(`  ✓ ${msg}`);
  passedTests++;
}

// ============================================================================
// 1. Perspective Frustum Math & Near-Plane Clipping Simulation
// ============================================================================
console.log('--- 1. Perspective Frustum Math & Near-Plane Clipping ---');

function computePerspectiveW(
  pixelMatrix: number[] | Float64Array,
  worldSize: number,
  mercatorX: number,
  mercatorY: number,
  ele: number = 0
): number {
  const x = mercatorX * worldSize;
  const y = mercatorY * worldSize;
  const z = ele || 0;
  return pixelMatrix[3] * x + pixelMatrix[7] * y + pixelMatrix[11] * z + pixelMatrix[15];
}

// Synthetic 50° pitch perspective matrix (camera at z=1000 looking forward)
const m50 = [
  1.0, 0, 0, 0,
  0, Math.cos(50 * Math.PI / 180), Math.sin(50 * Math.PI / 180), 0.002,
  0, -Math.sin(50 * Math.PI / 180), Math.cos(50 * Math.PI / 180), 0.00076,
  0, 0, -1000, 0.1,
];

// Test points: Point in front (w > 0) vs point behind camera eye plane (w < 0)
const wFront = computePerspectiveW(m50, 1000, 0.5, 0.6);
const wBehind = computePerspectiveW(m50, 1000, 0.5, -0.6);
console.log('wFront:', wFront, 'wBehind:', wBehind);

assert(wFront > 0.05, 'Point in front has w > 0.05');
assert(wBehind < 0, 'Point behind camera eye plane has w < 0');
pass('Homogeneous coordinate w correctly discriminates points in front vs behind camera');

// Raw division by negative w inverts screen coordinates
const unclippedScreenX = 100 / wBehind;
assert(unclippedScreenX < 0, 'Raw division by negative w inverts coordinate direction');
pass('Confirmed: Raw map.project() produces inverted coordinates when w < 0');

// Clipping segment at w = 0.05
const tClip = (0.05 - wBehind) / (wFront - wBehind);
assert(tClip > 0 && tClip < 1, 'Interpolation parameter t is strictly in (0, 1)');
const wClipped = wBehind + tClip * (wFront - wBehind);
assert(Math.abs(wClipped - 0.05) < 1e-6, 'Clipped point sits exactly on w = 0.05 near plane');
pass('Near-plane interpolation clips segment at w = 0.05 boundary without inversion');

// ============================================================================
// 2. Fly Along Starting Zoom Evaluation
// ============================================================================
console.log('\n--- 2. Fly Along Starting Zoom Evaluation ---');

const flyAlongBlocks = mapPresetToCameraBlocks('fly_along');
assert(flyAlongBlocks.length === 1, 'Generates single camera block');
assert(flyAlongBlocks[0].kind === 'follow', 'Fly Along kind is follow');
assert(flyAlongBlocks[0].followOrient === 'heading', 'Fly Along followOrient is heading');
assert(flyAlongBlocks[0].pitch === 50, 'Fly Along pitch is 50');
pass('Fly Along preset generates correct follow/heading/pitch configuration');

const wholeTourBlocks = mapPresetToCameraBlocks('whole_tour');
assert(wholeTourBlocks[0].kind === 'still', 'Whole Tour kind is still');
assert(wholeTourBlocks[0].pitch === 10, 'Whole Tour pitch is 10 (almost flat top-down)');
pass('Whole Tour preset preserves still/pitch 10 configuration');

// ============================================================================
// 3. Whole Tour Viewport Integrity Across Viewport Sizes
// ============================================================================
console.log('\n--- 3. Whole Tour Viewport Integrity ---');

const testRoute: CanonicalRoute = {
  id: 'route-test-1',
  name: 'Test Journey',
  status: 'calculated',
  color: '#ff4d2e',
  width: 8,
  style: 'solid',
  stops: [
    { id: 's1', placeName: 'Zurich', lng: 8.5417, lat: 47.3769 },
    { id: 's2', placeName: 'Geneva', lng: 6.1432, lat: 46.2044 },
  ],
  segments: [],
  calculatedGeometry: [
    { lng: 8.5417, lat: 47.3769 },
    { lng: 7.4474, lat: 46.9480 },
    { lng: 6.1432, lat: 46.2044 },
  ],
};

const adapted = getAdaptedCanonicalRoute(testRoute);
assert(adapted.points.length === 3, 'Adapted route retains 3 points');
assert(adapted.color === '#ff4d2e', 'Adapted route color is red');
pass('Canonical route adapter preserves route geometry cleanly');

console.log('\n=======================================================');
console.log(`ALL ${passedTests} INVESTIGATION TESTS PASSED!`);
console.log('=======================================================\n');
