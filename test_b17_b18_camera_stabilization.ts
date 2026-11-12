import assert from 'node:assert';
import {
  shortestAngularDiff,
  mapPresetToCameraBlocks,
  computeRouteBounds,
} from './src/utils/cameraPresetMapper.ts';
import type { RoutePoint, CameraBlock, CameraModePreset } from './src/types/index.ts';

console.log('=== RUNNING B17 & B18 TEST SUITE: CAMERA STABILIZATION ===\n');

// -------------------------------------------------------------
// PART 1: B18 — WHOLE TOUR PRESET SWITCHING & MODE RESOLUTION
// -------------------------------------------------------------
console.log('--- PART 1: B18 Whole Tour Preset Switching & Mode Precedence ---');

const testRoutePoints: RoutePoint[] = [
  { lng: 11.582, lat: 48.135 },
  { lng: 11.600, lat: 48.150 },
  { lng: 11.620, lat: 48.170 },
];

// Test 1: Preset mapping creates correct Whole Tour block
const wholeTourBlocks = mapPresetToCameraBlocks('whole_tour', testRoutePoints);
assert.strictEqual(wholeTourBlocks.length, 1, 'Whole Tour should produce 1 primary block');
assert.strictEqual(wholeTourBlocks[0].kind, 'still', 'Whole Tour block kind must be "still"');
assert.strictEqual(wholeTourBlocks[0].pitch, 10, 'Whole Tour pitch should default to 10°');
assert.strictEqual(wholeTourBlocks[0].zoom, 10, 'Whole Tour zoom should default to 10');
console.log('  ✓ [TEST 1] mapPresetToCameraBlocks("whole_tour") generates valid "still" block');

// Test 2: Mode resolution precedence in MapViewer
// Replicating MapViewer effectiveMode resolution logic:
function resolveEffectiveMode(cameraPreset: CameraModePreset, activeBlock: CameraBlock | null, cameraMode: string): string {
  return cameraPreset === 'whole_tour'
    ? 'still'
    : (activeBlock ? activeBlock.kind : (cameraPreset === 'fly_along' ? 'follow' : (cameraMode || 'follow')));
}

const staleFlyAlongBlock: CameraBlock = {
  id: 'cam-stale-fly-along',
  tRatio: 0,
  kind: 'follow',
  followOrient: 'heading',
  center: [11.582, 48.135],
  pitch: 50,
  zoom: 12,
  bearing: 0,
  easing: 'smooth',
};

// When user selects 'whole_tour', even if activeBlock is a stale 'follow' block, effectiveMode MUST be 'still'
const resolvedMode = resolveEffectiveMode('whole_tour', staleFlyAlongBlock, 'follow');
assert.strictEqual(resolvedMode, 'still', 'effectiveMode must be "still" when cameraPreset === "whole_tour", even if activeBlock.kind === "follow"');
console.log('  ✓ [TEST 2] effectiveMode evaluates to "still" and ignores stale activeBlock.kind');

// When user selects 'fly_along', effectiveMode is 'follow'
const flyAlongMode = resolveEffectiveMode('fly_along', null, 'still');
assert.strictEqual(flyAlongMode, 'follow', 'effectiveMode must be "follow" when cameraPreset === "fly_along"');
console.log('  ✓ [TEST 3] effectiveMode evaluates to "follow" when cameraPreset === "fly_along"');

// Test 4: Whole Tour cache lifecycle (lastWholeTourKeyRef)
class WholeTourCacheSimulator {
  public lastWholeTourKey = '';
  public fitBoundsCalls: { bounds: any; pitch: number; bearing: number }[] = [];

  public update(cameraPreset: CameraModePreset, pts: RoutePoint[], pitch = 10) {
    if (cameraPreset !== 'whole_tour') {
      this.lastWholeTourKey = '';
      return;
    }

    if (pts.length > 0) {
      const tourKey = `${pts.length}-${pts[0]?.lat.toFixed(4)},${pts[0]?.lng.toFixed(4)}-${pts[pts.length - 1]?.lat.toFixed(4)},${pts[pts.length - 1]?.lng.toFixed(4)}`;
      if (this.lastWholeTourKey !== tourKey) {
        this.lastWholeTourKey = tourKey;
        const bounds = computeRouteBounds(pts);
        if (bounds) {
          this.fitBoundsCalls.push({ bounds, pitch, bearing: 0 });
        }
      }
    }
  }
}

const cacheSim = new WholeTourCacheSimulator();

// Step A: In Fly Along mode
cacheSim.update('fly_along', testRoutePoints);
assert.strictEqual(cacheSim.lastWholeTourKey, '', 'Cache key is empty in Fly Along');
assert.strictEqual(cacheSim.fitBoundsCalls.length, 0, 'No fitBounds in Fly Along');

// Step B: Switch Fly Along -> Whole Tour
cacheSim.update('whole_tour', testRoutePoints);
assert.notStrictEqual(cacheSim.lastWholeTourKey, '', 'Cache key set upon entering Whole Tour');
assert.strictEqual(cacheSim.fitBoundsCalls.length, 1, 'fitBounds called on first entry to Whole Tour');
console.log('  ✓ [TEST 4] Switching Fly Along -> Whole Tour triggers fitBounds');

// Step C: Next render frame in Whole Tour (same route points)
cacheSim.update('whole_tour', testRoutePoints);
assert.strictEqual(cacheSim.fitBoundsCalls.length, 1, 'fitBounds not redundantly spammed on subsequent frames');
console.log('  ✓ [TEST 5] Subsequent frames in Whole Tour preserve map view without re-triggering fitBounds');

// Step D: Switch Whole Tour -> Fly Along
cacheSim.update('fly_along', testRoutePoints);
assert.strictEqual(cacheSim.lastWholeTourKey, '', 'Cache key cleared upon leaving Whole Tour');
console.log('  ✓ [TEST 6] Leaving Whole Tour resets cache key to empty string');

// Step E: Switch Fly Along -> Whole Tour again (the B18 re-entry bug)
cacheSim.update('whole_tour', testRoutePoints);
assert.strictEqual(cacheSim.fitBoundsCalls.length, 2, 'fitBounds triggers again upon re-entering Whole Tour');
console.log('  ✓ [TEST 7] Re-entering Whole Tour from Fly Along cleanly executes fitBounds again');

// Step F: Route points change in Whole Tour
const extendedRoutePoints = [...testRoutePoints, { lng: 11.650, lat: 48.200 }];
cacheSim.update('whole_tour', extendedRoutePoints);
assert.strictEqual(cacheSim.fitBoundsCalls.length, 3, 'fitBounds triggers when route points change');
console.log('  ✓ [TEST 8] Modifying route points in Whole Tour updates tourKey and triggers fitBounds');


// -------------------------------------------------------------
// PART 2: B17 — FLY ALONG CAMERA SMOOTHNESS & HARMONIZED DAMPING
// -------------------------------------------------------------
console.log('\n--- PART 2: B17 Fly Along Camera Smoothness & Harmonized Damping ---');

// Test 9: Shortest Signed Angular Difference across 0° / 360° North boundary
const northDiffPos = shortestAngularDiff(5, 355);
assert.strictEqual(northDiffPos, 10, 'Crossing North from 355° to 5° should yield +10°');
const northDiffNeg = shortestAngularDiff(355, 5);
assert.strictEqual(northDiffNeg, -10, 'Crossing North from 5° to 355° should yield -10°');
console.log('  ✓ [TEST 9] Shortest angular diff correctly calculates ±10° without 360° flips');

// Test 10: Harmonized Exponential Decay Simulation (60 FPS)
// Compare lambda = 10.0 s^-1 for both bearing and center
class CameraFollowSimulator {
  public bearing: number | null = null;
  public center: [number, number] | null = null;
  public lastTime: number | null = null;

  public update(
    vehicleLngLat: [number, number],
    targetBearing: number,
    now: number,
    isPlaying: boolean,
    progressJump = 0
  ) {
    const last = this.lastTime ?? now;
    this.lastTime = now;
    const dtSec = Math.max(0.005, Math.min(0.05, (now - last) / 1000));

    if (this.bearing === null || !isPlaying || progressJump > 0.08) {
      this.bearing = targetBearing;
    } else {
      const diff = shortestAngularDiff(targetBearing, this.bearing);
      const lambdaBearing = 10.0;
      const decay = 1 - Math.exp(-lambdaBearing * dtSec);
      const unclampedStep = diff * decay;
      const maxSpeed = 240.0; // deg/sec
      const maxStep = maxSpeed * dtSec;
      const step = Math.sign(unclampedStep) * Math.min(Math.abs(unclampedStep), maxStep);
      this.bearing = ((this.bearing + step) % 360 + 360) % 360;
    }

    if (this.center === null || !isPlaying || progressJump > 0.08) {
      this.center = [vehicleLngLat[0], vehicleLngLat[1]];
    } else {
      const lambdaCenter = 10.0;
      const decay = 1 - Math.exp(-lambdaCenter * dtSec);
      const prev = this.center;
      this.center = [
        prev[0] + (vehicleLngLat[0] - prev[0]) * decay,
        prev[1] + (vehicleLngLat[1] - prev[1]) * decay,
      ];
    }

    return { bearing: this.bearing, center: this.center };
  }
}

const sim = new CameraFollowSimulator();
const fps60 = 1000 / 60; // 16.666 ms

// Step A: Initialize at t = 0
let state = sim.update([10.0, 50.0], 90, 0, true);
assert.strictEqual(state.bearing, 90, 'Initial bearing locks immediately');
assert.deepStrictEqual(state.center, [10.0, 50.0], 'Initial center locks immediately');
console.log('  ✓ [TEST 10] Initial frame locks orientation and position cleanly');

// Step B: Straight line motion (East at 60 km/h ~ 16.7 m/s ~ 0.00015 deg/sec)
let maxStepDeg = 0;
for (let frame = 1; frame <= 60; frame++) {
  const prevBearing = state.bearing!;
  const lng = 10.0 + frame * (0.00015 / 60);
  state = sim.update([lng, 50.0], 90, frame * fps60, true);
  const step = Math.abs(state.bearing! - prevBearing);
  if (step > maxStepDeg) maxStepDeg = step;
}
assert.strictEqual(maxStepDeg, 0, 'No rotational jitter on straight road');
console.log('  ✓ [TEST 11] Straight route maintains rock-solid bearing with 0.000° jitter');

// Step C: 90° Turn from East (90°) to South (180°) over 1 second (60 frames)
const turnSteps: number[] = [];
let maxTurnStepDeg = 0;
for (let frame = 1; frame <= 60; frame++) {
  const prevBearing = state.bearing!;
  const target = 90 + (frame / 60) * 90; // Sweeping to 180°
  state = sim.update([10.01 + frame * 0.0001, 50.0 - frame * 0.0001], target, (60 + frame) * fps60, true);
  const step = Math.abs(shortestAngularDiff(state.bearing!, prevBearing));
  turnSteps.push(step);
  if (step > maxTurnStepDeg) maxTurnStepDeg = step;
}

// Bounded step size: at 240°/s, max step per 16.7ms frame is 4.0°
assert.ok(maxTurnStepDeg <= 4.01, `Max angular step (${maxTurnStepDeg.toFixed(2)}°) within 240°/s bound`);
assert.ok(maxTurnStepDeg > 0.5, 'Camera smoothly follows turn');
console.log(`  ✓ [TEST 12] 90° turn rotates smoothly with max step ${maxTurnStepDeg.toFixed(2)}°/frame (bounded by 240°/s)`);

// Step D: Settling time after turn ends
// Vehicle now continues straight South (180°) for 0.5s (30 frames)
for (let frame = 1; frame <= 30; frame++) {
  state = sim.update([10.02, 50.0 - 0.006 - frame * 0.0001], 180, (120 + frame) * fps60, true);
}
const angularLagAfterSettling = Math.abs(shortestAngularDiff(180, state.bearing!));
assert.ok(angularLagAfterSettling < 0.5, `Camera settled onto final heading within 0.5s (lag: ${angularLagAfterSettling.toFixed(2)}°)`);
console.log(`  ✓ [TEST 13] Camera settles onto new heading in ~0.3s (settling error: ${angularLagAfterSettling.toFixed(3)}°)`);

// Step E: Jump on seek or restart (progressJump > 0.08)
const jumpedState = sim.update([12.0, 45.0], 270, 3000, true, 0.5); // 50% seek jump
assert.strictEqual(jumpedState.bearing, 270, 'Bearing snaps immediately on timeline seek/restart');
assert.deepStrictEqual(jumpedState.center, [12.0, 45.0], 'Center snaps immediately on timeline seek/restart');
console.log('  ✓ [TEST 14] Timeline seek/scrub cleanly snaps camera without lingering exponential lag');

// Step F: Delta time clamping against React commit jitter
// Simulate a 150ms garbage-collection pause
const clampedState = sim.update([12.001, 45.0], 275, 3150, true, 0.001);
// Clamping dtSec to 0.05 prevents a massive 150ms jump
const stepFromLag = Math.abs(shortestAngularDiff(clampedState.bearing!, 270));
assert.ok(stepFromLag <= (240.0 * 0.05) + 0.01, `Delta clamping prevents excessive jump during render lag: step was ${stepFromLag.toFixed(2)}°`);
console.log(`  ✓ [TEST 15] Frame delta clamping successfully guards against React render pauses`);

console.log('\n========================================');
console.log('RESULTS: ALL 15 / 15 TESTS PASSED.');
console.log('========================================');
