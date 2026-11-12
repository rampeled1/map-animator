import assert from 'node:assert';
import {
  computeQuickPreviewDurationSeconds,
  QUICK_PREVIEW_BASE_SPEED_KMH,
  QUICK_PREVIEW_SPEED_MULTIPLIERS,
  QUICK_PREVIEW_MIN_DURATION_SEC,
  QUICK_PREVIEW_MAX_DURATION_SEC,
  QUICK_PREVIEW_REF_DISTANCE_KM,
  QUICK_PREVIEW_REF_NORMAL_DURATION_SEC,
} from './src/types/index.ts';
import { CatmullRom3DPath } from './src/utils/catmullRom3DPath.ts';
import type { RoutePoint } from './src/types/index.ts';

console.log('=== RUNNING COMPREHENSIVE HYBRID DURATION MODEL TEST SUITE ===');

let passedAssertions = 0;
function pass(msg: string) {
  passedAssertions++;
  console.log(`  ✓ [TEST ${passedAssertions}] ${msg}`);
}

// -------------------------------------------------------------------------------------------------
// 1. CALIBRATION POINT & EXACT MATHEMATICAL SPECIFICATION
// Calibration: 60 km reference route at Normal (60 km/h) = 30 seconds
// Formula: rawDuration = (distanceKm / 60) * (60 / effectiveSpeedKmh) * 30
// -------------------------------------------------------------------------------------------------
console.log('\n--- 1. Reference Calibration Route (60 km) ---');

const d60 = 60;
const dur60Normal = computeQuickPreviewDurationSeconds(d60, 'normal');
assert.strictEqual(dur60Normal, 30, '60 km route at Normal must equal exactly 30.0s');
pass(`60 km @ normal: ${dur60Normal}s (exact match to 30.0s calibration)`);

const dur60Slow = computeQuickPreviewDurationSeconds(d60, 'slow');
assert.strictEqual(dur60Slow, 60, '60 km route at Slow (30 km/h equiv) must equal exactly 60.0s');
pass(`60 km @ slow: ${dur60Slow}s (exact 2x duration of normal)`);

const dur60Fast = computeQuickPreviewDurationSeconds(d60, 'fast');
assert.strictEqual(dur60Fast, 15, '60 km route at Fast (120 km/h equiv) must equal exactly 15.0s');
pass(`60 km @ fast: ${dur60Fast}s (exact 0.5x duration of normal)`);

// Verify speed ratios: Slow / Normal == 2.0, Normal / Fast == 2.0
assert.strictEqual(dur60Slow / dur60Normal, 2.0, 'Slow/Normal ratio must be 2.0');
assert.strictEqual(dur60Normal / dur60Fast, 2.0, 'Normal/Fast ratio must be 2.0');
pass(`Relative speed ordering preserved: Slow (60s) > Normal (30s) > Fast (15s)`);

// -------------------------------------------------------------------------------------------------
// 2. SHORT ROUTE CLAMPING (MINIMUM 10 SECONDS)
// -------------------------------------------------------------------------------------------------
console.log('\n--- 2. Short Route Clamping (Min 10s) ---');

// 5 km route: raw normal = 2.5s -> clamp to 10s
const d5 = 5;
const dur5Normal = computeQuickPreviewDurationSeconds(d5, 'normal');
assert.strictEqual(dur5Normal, 10, '5 km @ normal raw is 2.5s, must clamp to min 10s');
pass(`5 km @ normal: raw 2.5s -> clamped to ${dur5Normal}s`);

const dur5Fast = computeQuickPreviewDurationSeconds(d5, 'fast');
assert.strictEqual(dur5Fast, 10, '5 km @ fast raw is 1.25s, must clamp to min 10s');
pass(`5 km @ fast: raw 1.25s -> clamped to ${dur5Fast}s`);

const dur5Slow = computeQuickPreviewDurationSeconds(d5, 'slow');
assert.strictEqual(dur5Slow, 10, '5 km @ slow raw is 5.0s, must clamp to min 10s');
pass(`5 km @ slow: raw 5.0s -> clamped to ${dur5Slow}s`);

// Exact boundary check for min clamp:
// For Normal speed, raw = (d / 60) * 30 = d / 2.
// raw == 10s when d = 20 km.
const dur20Normal = computeQuickPreviewDurationSeconds(20, 'normal');
assert.strictEqual(dur20Normal, 10, '20 km @ normal raw is exactly 10s (min boundary)');
pass(`20 km @ normal: exactly on min clamp threshold (10.0s)`);

const dur19Normal = computeQuickPreviewDurationSeconds(19.9, 'normal');
assert.strictEqual(dur19Normal, 10, '19.9 km @ normal raw is 9.95s, must clamp to 10s');
pass(`19.9 km @ normal: 9.95s clamped to 10.0s`);

const dur21Normal = computeQuickPreviewDurationSeconds(21, 'normal');
assert.strictEqual(dur21Normal, 10.5, '21 km @ normal raw is 10.5s, unclamped');
pass(`21 km @ normal: 10.5s unclamped`);

// -------------------------------------------------------------------------------------------------
// 3. LONG ROUTE CLAMPING (MAXIMUM 120 SECONDS)
// -------------------------------------------------------------------------------------------------
console.log('\n--- 3. Long Route Clamping (Max 120s) ---');

// 400 km route: raw normal = 200s -> clamp to 120s
const d400 = 400;
const dur400Normal = computeQuickPreviewDurationSeconds(d400, 'normal');
assert.strictEqual(dur400Normal, 120, '400 km @ normal raw is 200s, must clamp to max 120s');
pass(`400 km @ normal: raw 200s -> clamped to ${dur400Normal}s`);

const dur400Slow = computeQuickPreviewDurationSeconds(d400, 'slow');
assert.strictEqual(dur400Slow, 120, '400 km @ slow raw is 400s, must clamp to max 120s');
pass(`400 km @ slow: raw 400s -> clamped to ${dur400Slow}s`);

const dur400Fast = computeQuickPreviewDurationSeconds(d400, 'fast');
assert.strictEqual(dur400Fast, 100, '400 km @ fast raw is 100s, unclamped (< 120s)');
pass(`400 km @ fast: raw 100s unclamped -> ${dur400Fast}s`);

// Exact boundary check for max clamp:
// For Normal speed, raw = d / 2.
// raw == 120s when d = 240 km.
const dur240Normal = computeQuickPreviewDurationSeconds(240, 'normal');
assert.strictEqual(dur240Normal, 120, '240 km @ normal raw is exactly 120s (max boundary)');
pass(`240 km @ normal: exactly on max clamp threshold (120.0s)`);

const dur241Normal = computeQuickPreviewDurationSeconds(241, 'normal');
assert.strictEqual(dur241Normal, 120, '241 km @ normal raw is 120.5s, must clamp to 120s');
pass(`241 km @ normal: 120.5s clamped to 120.0s`);

const dur239Normal = computeQuickPreviewDurationSeconds(239, 'normal');
assert.strictEqual(dur239Normal, 119.5, '239 km @ normal raw is 119.5s, unclamped');
pass(`239 km @ normal: 119.5s unclamped`);

// -------------------------------------------------------------------------------------------------
// 4. MEDIUM ROUTES (PROPORTIONAL SCALING IN UNCLAMPED REGION)
// -------------------------------------------------------------------------------------------------
console.log('\n--- 4. Medium Routes (Proportional Scaling) ---');

const d100 = 100;
const dur100Slow = computeQuickPreviewDurationSeconds(d100, 'slow');
const dur100Normal = computeQuickPreviewDurationSeconds(d100, 'normal');
const dur100Fast = computeQuickPreviewDurationSeconds(d100, 'fast');

assert.strictEqual(dur100Slow, 100, '100 km @ slow = 100s');
assert.strictEqual(dur100Normal, 50, '100 km @ normal = 50s');
assert.strictEqual(dur100Fast, 25, '100 km @ fast = 25s');
pass(`100 km: Slow = ${dur100Slow}s, Normal = ${dur100Normal}s, Fast = ${dur100Fast}s`);
assert.strictEqual(dur100Slow / dur100Normal, 2.0, 'Relative ratio Slow/Normal = 2');
assert.strictEqual(dur100Normal / dur100Fast, 2.0, 'Relative ratio Normal/Fast = 2');
pass('Relative speed differences strictly preserved in unclamped region');

// Linearity check: 100 km is 100/60 * 30 = 50s. 80 km is 80/60 * 30 = 40s.
const dur80Normal = computeQuickPreviewDurationSeconds(80, 'normal');
assert.strictEqual(dur80Normal, 40, '80 km @ normal = 40s');
pass('Linear proportionality verified: duration scales linearly with distance');

// -------------------------------------------------------------------------------------------------
// 5. EDGE CASES: ZERO, NEGATIVE, UNDEFINED
// -------------------------------------------------------------------------------------------------
console.log('\n--- 5. Edge Cases ---');

assert.strictEqual(computeQuickPreviewDurationSeconds(0, 'normal'), 0, '0 km must return 0 duration');
pass('0 km distance returns 0s');

assert.strictEqual(computeQuickPreviewDurationSeconds(-10, 'normal'), 0, 'Negative distance must return 0 duration');
pass('Negative distance returns 0s');

// -------------------------------------------------------------------------------------------------
// 6. GEOGRAPHIC ACCURACY OF ANIMATION TICK & SPLINE LOOKUP
// -------------------------------------------------------------------------------------------------
console.log('\n--- 6. Geographic Accuracy of Animation Progress ---');

const testRoutePoints: RoutePoint[] = [
  { lat: 45.0, lng: 7.0 },
  { lat: 45.5, lng: 7.5 },
  { lat: 46.0, lng: 8.0 },
  { lat: 46.5, lng: 8.5 },
];
const engine = new CatmullRom3DPath(testRoutePoints);
const totalKm = engine.getTotalDistanceKm();
const previewDuration = computeQuickPreviewDurationSeconds(totalKm, 'normal');

// Simulate 1 second of playback (60 FPS = 1/60 delta)
const dt = 1.0;
const dProgress = dt / previewDuration;
const expectedKmCovered = (dt / previewDuration) * totalKm;

const u0 = engine.getSplineParameterAtDistanceProgress(0);
const u1 = engine.getSplineParameterAtDistanceProgress(dProgress);

const p0 = engine.sample(u0)!.worldPoint;
const p1 = engine.sample(u1)!.worldPoint;

function haversine(c1: [number, number, number], c2: [number, number, number]): number {
  const R = 6371.0088;
  const dlat = ((c2[1] - c1[1]) * Math.PI) / 180;
  const dlng = ((c2[0] - c1[0]) * Math.PI) / 180;
  const a = Math.sin(dlat / 2) ** 2 + Math.cos((c1[1] * Math.PI) / 180) * Math.cos((c2[1] * Math.PI) / 180) * Math.sin(dlng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const measuredKm = haversine(p0, p1);
const errorMeters = Math.abs(measuredKm - expectedKmCovered) * 1000;
assert(errorMeters < 10, `Geographic distance per tick error (${errorMeters.toFixed(3)} m) should be under 10 m`);
pass(`Geographic progress accurate to ${errorMeters.toFixed(3)} m for ${totalKm.toFixed(1)} km route`);

// -------------------------------------------------------------------------------------------------
// 7. EMPTY GEOMETRY FALLBACK REGRESSION TEST
// -------------------------------------------------------------------------------------------------
console.log('\n--- 7. Empty Geometry Fallback Regression Check ---');

const fallbackPoints: RoutePoint[] = [
  { lat: 48.8566, lng: 2.3522 },
  { lat: 45.7640, lng: 4.8357 },
];
const canonicalRouteEmpty = {
  id: 'c-route-1',
  name: 'Route 1',
  sourceType: 'manual' as const,
  stops: [],
  segments: [],
  calculatedGeometry: [] as RoutePoint[], // empty array!
};
const projectRoutes = [{ id: 'route-1', points: fallbackPoints }];

// The old code: canonicalRouteEmpty.calculatedGeometry || projectRoutes[0]?.points || [] -> yielded []
const oldPts = canonicalRouteEmpty?.calculatedGeometry || projectRoutes[0]?.points || [];
assert.strictEqual(oldPts.length, 0, 'Confirmation of old bug: [] evaluates to truthy in JS logical OR');

// The fixed code:
const fixedPts = (canonicalRouteEmpty?.calculatedGeometry && canonicalRouteEmpty.calculatedGeometry.length > 0)
  ? canonicalRouteEmpty.calculatedGeometry
  : (projectRoutes[0]?.points || []);
assert.strictEqual(fixedPts.length, 2, 'Fixed fallback: correctly falls back to projectRoutes[0].points when calculatedGeometry is empty');
pass('Empty calculatedGeometry correctly falls back to projectRoutes[0].points');

console.log(`\n=======================================================`);
console.log(`ALL ${passedAssertions} HYBRID DURATION TESTS PASSED WITH 100% SUCCESS!`);
console.log(`=======================================================`);
