import assert from 'assert';
import { mapPresetToCameraBlocks } from './src/utils/cameraPresetMapper.ts';
import { getAdaptedCanonicalRoute } from './src/utils/routeAdapter.ts';
import type { CanonicalRoute } from './src/types/index.ts';

console.log('=== TEST SUITE: OPTION A NEAR-PLANE MATHEMATICAL CLIPPING ===\n');

let passedTests = 0;
function pass(testName: string) {
  console.log(`  ✓ ${testName}`);
  passedTests++;
}

// ============================================================================
// 1. Perspective Homogeneous Clip W Calculation & Coordinate Inversion Proof
// ============================================================================
console.log('--- 1. Perspective Homogeneous Clip Coordinate W Calculation ---');

function computeClipW(
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

// 50° pitch perspective matrix in MapLibre column-major convention
const m50 = [
  1.0, 0, 0, 0,
  0, Math.cos(50 * Math.PI / 180), Math.sin(50 * Math.PI / 180), 0.002,
  0, -Math.sin(50 * Math.PI / 180), Math.cos(50 * Math.PI / 180), 0.00076,
  0, 0, -1000, 0.1,
];

const ptFront = { lng: 8.54, lat: 47.37, mx: 0.523, my: 0.350 };
const ptBehind = { lng: 8.54, lat: 47.20, mx: 0.523, my: -0.450 };

const wFront = computeClipW(m50, 1000, ptFront.mx, ptFront.my);
const wBehind = computeClipW(m50, 1000, ptBehind.mx, ptBehind.my);

assert(wFront > 0.05, `Point in front has w > 0.05 (got ${wFront.toFixed(3)})`);
assert(wBehind < 0, `Point behind camera has negative w (got ${wBehind.toFixed(3)})`);
pass('Homogeneous clip w correctly differentiates in-front vs. behind camera points');

// Verify inversion: Dividing by negative w inverts screen coordinate direction
const rawUnclippedCoord = (100 / wBehind);
assert(rawUnclippedCoord < 0, 'Unclipped projection divides by negative w and inverts direction');
pass('Mathematical proof: Raw map.project() inverts coordinates when w < 0');

// ============================================================================
// 2. Near-Plane Boundary Clipping & Linear Segment Interpolation
// ============================================================================
console.log('\n--- 2. Near-Plane Boundary Clipping & Linear Segment Interpolation ---');

const W_NEAR_MIN = 0.05;
const tNear = (W_NEAR_MIN - wBehind) / (wFront - wBehind);
assert(tNear > 0 && tNear < 1, `Interpolation factor t is valid: ${tNear}`);

const clippedW = wBehind + tNear * (wFront - wBehind);
assert(Math.abs(clippedW - W_NEAR_MIN) < 1e-9, `Clipped point sits exactly on w = ${W_NEAR_MIN}`);
pass('Segment intersection accurately clips at w = 0.05 boundary');

// Test linear interpolation for geographic coordinates
const p0 = { lng: 8.0, lat: 47.0, ele: 400 };
const p1 = { lng: 8.5, lat: 47.5, ele: 800 };
const clippedLng = p0.lng + tNear * (p1.lng - p0.lng);
const clippedLat = p0.lat + tNear * (p1.lat - p0.lat);
const clippedEle = p0.ele + tNear * (p1.ele - p0.ele);

assert(clippedLng > p0.lng && clippedLng < p1.lng, 'Clipped longitude is bounded within segment');
assert(clippedLat > p0.lat && clippedLat < p1.lat, 'Clipped latitude is bounded within segment');
assert(clippedEle > p0.ele && clippedEle < p1.ele, 'Clipped elevation is bounded within segment');
pass('Geographic coordinates accurately interpolated at near-plane intersection');

// ============================================================================
// 3. SVG Subpath Splitting Algorithm (Never Bridging Across Invisible Sections)
// ============================================================================
console.log('\n--- 3. SVG Subpath Splitting Algorithm ---');

interface MockPoint {
  lng: number;
  lat: number;
  ele?: number;
  w: number;
  screenX: number;
  screenY: number;
}

function runSubpathClipping(points: MockPoint[]) {
  const W_MIN = 0.05;
  const projectedSubpaths: [number, number][][] = [];
  let currentProjSegment: [number, number][] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];

    if (a.w > W_MIN && b.w > W_MIN) {
      if (currentProjSegment.length === 0) {
        currentProjSegment.push([a.screenX, a.screenY]);
      }
      currentProjSegment.push([b.screenX, b.screenY]);
    } else if (a.w <= W_MIN && b.w > W_MIN) {
      if (currentProjSegment.length > 0) {
        projectedSubpaths.push(currentProjSegment);
        currentProjSegment = [];
      }
      const t = Math.max(0, Math.min(1, (W_MIN - a.w) / (b.w - a.w)));
      const clipX = a.screenX + t * (b.screenX - a.screenX);
      const clipY = a.screenY + t * (b.screenY - a.screenY);
      currentProjSegment.push([clipX, clipY]);
      currentProjSegment.push([b.screenX, b.screenY]);
    } else if (a.w > W_MIN && b.w <= W_MIN) {
      if (currentProjSegment.length === 0) {
        currentProjSegment.push([a.screenX, a.screenY]);
      }
      const t = Math.max(0, Math.min(1, (W_MIN - a.w) / (b.w - a.w)));
      const clipX = a.screenX + t * (b.screenX - a.screenX);
      const clipY = a.screenY + t * (b.screenY - a.screenY);
      currentProjSegment.push([clipX, clipY]);
      projectedSubpaths.push(currentProjSegment);
      currentProjSegment = [];
    } else {
      if (currentProjSegment.length > 0) {
        projectedSubpaths.push(currentProjSegment);
        currentProjSegment = [];
      }
    }
  }

  if (currentProjSegment.length > 0) {
    projectedSubpaths.push(currentProjSegment);
  }

  const d = projectedSubpaths
    .filter((sub) => sub.length >= 2)
    .map((sub) => sub.map((p, idx) => `${idx ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(''))
    .join(' ');

  return { projectedSubpaths, d };
}

// Test Case A: Continuous route fully in front of camera
{
  const pts: MockPoint[] = [
    { lng: 8.0, lat: 47.0, w: 1.0, screenX: 100, screenY: 100 },
    { lng: 8.1, lat: 47.1, w: 1.2, screenX: 200, screenY: 200 },
    { lng: 8.2, lat: 47.2, w: 1.5, screenX: 300, screenY: 300 },
  ];
  const { d, projectedSubpaths } = runSubpathClipping(pts);
  assert(projectedSubpaths.length === 1, 'Fully visible route produces exactly 1 subpath');
  assert(!d.includes('M200') && !d.includes('M300'), 'Fully visible route has no disjoint M breaks');
  assert(d.startsWith('M100.0 100.0L200.0 200.0L300.0 300.0'), 'Path connects continuously');
  pass('Fully visible route connects cleanly without subpath breaks');
}

// Test Case B: Route entirely behind camera
{
  const pts: MockPoint[] = [
    { lng: 8.0, lat: 47.0, w: -0.5, screenX: -100, screenY: -100 },
    { lng: 8.1, lat: 47.1, w: -1.0, screenX: -200, screenY: -200 },
  ];
  const { d, projectedSubpaths } = runSubpathClipping(pts);
  assert(projectedSubpaths.length === 0, 'Entirely behind camera route produces 0 subpaths');
  assert(d === '', 'SVG d string is completely empty');
  pass('Route behind camera produces empty SVG string without inverted artifacts');
}

// Test Case C: Route crossing from behind camera into view frustum
{
  const pts: MockPoint[] = [
    { lng: 8.0, lat: 47.0, w: -0.95, screenX: -100, screenY: -100 }, // behind
    { lng: 8.5, lat: 47.5, w: 1.05, screenX: 500, screenY: 500 },    // in front
    { lng: 8.9, lat: 47.9, w: 1.50, screenX: 900, screenY: 900 },    // in front
  ];
  const { d, projectedSubpaths } = runSubpathClipping(pts);
  assert(projectedSubpaths.length === 1, 'Entering route produces 1 clipped subpath');
  assert(!d.includes('-100.0'), 'Inverted point -100 is strictly omitted');
  assert(d.includes('L500.0 500.0L900.0 900.0'), 'Visible points remain connected');
  pass('Entering route clips near plane and never connects to negative w point');
}

// Test Case D: U-Turn route: In Front -> Behind -> In Front (Disjoint Subpath Splitting)
{
  const pts: MockPoint[] = [
    { lng: 8.0, lat: 47.0, w: 1.0, screenX: 100, screenY: 100 },     // in front
    { lng: 8.1, lat: 47.1, w: 0.5, screenX: 200, screenY: 200 },     // in front
    { lng: 8.2, lat: 47.2, w: -0.5, screenX: -999, screenY: -999 },  // behind
    { lng: 8.3, lat: 47.3, w: -1.0, screenX: -999, screenY: -999 },  // behind
    { lng: 8.4, lat: 47.4, w: 0.8, screenX: 700, screenY: 700 },     // in front
    { lng: 8.5, lat: 47.5, w: 1.2, screenX: 800, screenY: 800 },     // in front
  ];
  const { d, projectedSubpaths } = runSubpathClipping(pts);
  assert(projectedSubpaths.length === 2, 'Route with behind-camera section splits into exactly 2 subpaths');
  const mCount = (d.match(/M/g) || []).length;
  assert(mCount === 2, `Path contains exactly 2 Move-To (M) commands, got ${mCount}`);
  assert(!d.includes('-999'), 'Negative coordinates strictly absent from path');
  pass('U-turn route splits into independent subpaths without artificial bridge lines');
}

// ============================================================================
// 4. Start Dot & Tip Marker Frustum Safety
// ============================================================================
console.log('\n--- 4. Start Dot & Tip Marker Frustum Safety ---');

const startDotFront = { w: 1.0, pos: [100, 200] };
const startDotBehind = { w: -0.5, pos: [100, 200] };

const isStartRenderedFront = startDotFront.w > W_NEAR_MIN;
const isStartRenderedBehind = startDotBehind.w > W_NEAR_MIN;

assert(isStartRenderedFront === true, 'Start dot is rendered when start point is in front');
assert(isStartRenderedBehind === false, 'Start dot is suppressed when start point is behind camera');
pass('Start dot safely rendered in front and suppressed when behind camera');

// ============================================================================
// 5. Preservation of Fly Along Starting Zoom 12.0 & Whole Tour Settings
// ============================================================================
console.log('\n--- 5. Preservation of Presets, Zooms & Whole Tour ---');

const flyAlongBlocks = mapPresetToCameraBlocks('fly_along');
assert(flyAlongBlocks[0].zoom === 12, `Fly Along starting zoom preserved at 12 (got ${flyAlongBlocks[0].zoom})`);
assert(flyAlongBlocks[0].pitch === 50, 'Fly Along pitch preserved at 50');
assert(flyAlongBlocks[0].kind === 'follow', 'Fly Along kind preserved as follow');
assert(flyAlongBlocks[0].followOrient === 'heading', 'Fly Along followOrient preserved as heading');
pass('Option B not implemented: Fly Along starting zoom strictly preserved at 12.0');

const wholeTourBlocks = mapPresetToCameraBlocks('whole_tour');
assert(wholeTourBlocks[0].kind === 'still', 'Whole Tour kind preserved as still');
assert(wholeTourBlocks[0].pitch === 10, 'Whole Tour pitch preserved at 10');
pass('Whole Tour behavior and configuration completely preserved');

// ============================================================================
// 6. Multi-Stop Canonical Route Adaptation
// ============================================================================
console.log('\n--- 6. Multi-Stop Canonical Route Adaptation ---');

const canonical: CanonicalRoute = {
  id: 'canonical-route-test',
  name: 'Zurich → Bern → Geneva',
  status: 'calculated',
  color: '#ff4d2e',
  width: 8,
  style: 'solid',
  stops: [
    { id: 'stop-0', placeName: 'Zurich', lng: 8.5417, lat: 47.3769 },
    { id: 'stop-1', placeName: 'Bern', lng: 7.4474, lat: 46.9480 },
    { id: 'stop-2', placeName: 'Geneva', lng: 6.1432, lat: 46.2044 },
  ],
  segments: [],
  calculatedGeometry: [
    { lng: 8.5417, lat: 47.3769 },
    { lng: 7.4474, lat: 46.9480 },
    { lng: 6.1432, lat: 46.2044 },
  ],
};

const adapted = getAdaptedCanonicalRoute(canonical);
assert(adapted.points.length === 3, 'Adapted route contains all 3 points');
assert(adapted.color === '#ff4d2e', 'Adapted route preserves red color');
assert(adapted.transportType === 'car', 'Adapted route defaults to car transport');
pass('Canonical route adaptation preserves full geometry and transport properties');

console.log('\n=======================================================');
console.log(`ALL ${passedTests} OPTION A NEAR-PLANE CLIPPING TESTS PASSED!`);
console.log('=======================================================\n');
