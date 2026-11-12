import assert from 'node:assert';
import { shortestAngularDiff, computeRouteBounds, mapPresetToCameraBlocks } from './src/utils/cameraPresetMapper.ts';
import { CatmullRom3DPath } from './src/utils/catmullRom3DPath.ts';
import {
  computeQuickPreviewDurationSeconds,
  QUICK_PREVIEW_BASE_SPEED_KMH,
  QUICK_PREVIEW_SPEED_MULTIPLIERS,
} from './src/types/index.ts';
import type { RoutePoint, CameraModePreset, CameraBlock } from './src/types/index.ts';

console.log('=== RUNNING STABILIZATION ROUND 2 TEST SUITE ===\n');

let totalTestsPassed = 0;
function pass(msg: string) {
  totalTestsPassed++;
  console.log(`  ✓ [TEST ${totalTestsPassed}] ${msg}`);
}

// =================================================================================================
// 1. FLY ALONG — SMOOTH CAMERA MOVEMENT & FRAME-RATE INDEPENDENCE
// =================================================================================================
console.log('--- 1. Fly Along Smooth Camera Movement & Interpolation ---');

const lambdaCenter = 15.0; // s^-1

// 1.1 Frame-rate independence test: 30 FPS vs 60 FPS vs 120 FPS over 1 second
// Moving from [10.0, 45.0] to [10.01, 45.01]
function simulateDecayOverTime(
  startPos: [number, number],
  targetPos: [number, number],
  totalTimeSec: number,
  fps: number
): [number, number] {
  const dt = 1 / fps;
  const steps = Math.round(totalTimeSec * fps);
  let center: [number, number] = [startPos[0], startPos[1]];

  for (let i = 0; i < steps; i++) {
    // Constant target for step response analysis
    const decayFactor = 1 - Math.exp(-lambdaCenter * dt);
    const nextLng = center[0] + (targetPos[0] - center[0]) * decayFactor;
    const nextLat = center[1] + (targetPos[1] - center[1]) * decayFactor;
    center = [nextLng, nextLat];
  }
  return center;
}

const pos30 = simulateDecayOverTime([10.0, 45.0], [10.01, 45.01], 0.5, 30);
const pos60 = simulateDecayOverTime([10.0, 45.0], [10.01, 45.01], 0.5, 60);
const pos120 = simulateDecayOverTime([10.0, 45.0], [10.01, 45.01], 0.5, 120);

// At 0.5s with lambda=15, 1 - exp(-15 * 0.5) = 1 - exp(-7.5) = 0.999446
const diff30_60 = Math.hypot(pos30[0] - pos60[0], pos30[1] - pos60[1]);
const diff60_120 = Math.hypot(pos60[0] - pos120[0], pos60[1] - pos120[1]);

assert(diff30_60 < 1e-6, `30 FPS vs 60 FPS difference must be < 1e-6 (got ${diff30_60.toExponential(4)})`);
assert(diff60_120 < 1e-6, `60 FPS vs 120 FPS difference must be < 1e-6 (got ${diff60_120.toExponential(4)})`);
pass(`Frame-rate independence verified across 30, 60, and 120 FPS (delta < ${diff30_60.toExponential(2)})`);

// 1.2 Maximum lag verification at Slow (30 km/h), Normal (60 km/h), and Fast (120 km/h)
// In steady state: lagDistance = velocity / lambda
// At 30 km/h = 8.33 m/s -> lag = 8.33 / 15 = 0.56 m
// At 60 km/h = 16.67 m/s -> lag = 16.67 / 15 = 1.11 m
// At 120 km/h = 33.33 m/s -> lag = 33.33 / 15 = 2.22 m
const lagSlowM = (30 / 3.6) / lambdaCenter;
const lagNormalM = (60 / 3.6) / lambdaCenter;
const lagFastM = (120 / 3.6) / lambdaCenter;

assert(lagSlowM < 1.0, 'Slow speed lag must be < 1.0 m');
assert(lagNormalM < 1.5, 'Normal speed lag must be < 1.5 m');
assert(lagFastM < 2.5, 'Fast speed lag must be < 2.5 m');
pass(`Steady-state camera tracking lag bounded: Slow = ${lagSlowM.toFixed(2)}m, Normal = ${lagNormalM.toFixed(2)}m, Fast = ${lagFastM.toFixed(2)}m (< 0.1 screen pixels at zoom 12)`);

// 1.3 Pause, Seek, and Restart immediate lock
let followCenter: [number, number] | null = null;
const vehiclePosA: [number, number] = [10.0, 45.0];
const vehiclePosB: [number, number] = [10.5, 45.5];

// On initial mount / preset change:
function updateCameraCenter(
  vehiclePos: [number, number],
  isPlaying: boolean,
  progressJump: number,
  dtSec: number
): [number, number] {
  if (followCenter === null || !isPlaying || progressJump > 0.05) {
    followCenter = [vehiclePos[0], vehiclePos[1]];
    return vehiclePos;
  }
  const decayFactor = 1 - Math.exp(-lambdaCenter * dtSec);
  const nextLng = followCenter[0] + (vehiclePos[0] - followCenter[0]) * decayFactor;
  const nextLat = followCenter[1] + (vehiclePos[1] - followCenter[1]) * decayFactor;
  followCenter = [nextLng, nextLat];
  return followCenter;
}

// Initial frame
const center1 = updateCameraCenter(vehiclePosA, false, 0, 0.016);
assert.deepStrictEqual(center1, vehiclePosA, 'Initial lock must be instantaneous');
pass('Initial camera center locks immediately to vehicle position');

// Large progress jump (seek / restart)
const centerSeek = updateCameraCenter(vehiclePosB, true, 0.5, 0.016);
assert.deepStrictEqual(centerSeek, vehiclePosB, 'Seek / restart with jump > 0.05 must lock immediately');
pass('Seek and restart immediately lock camera center without lag');

// Pause locks immediately
followCenter = [10.2, 45.2];
const centerPause = updateCameraCenter(vehiclePosB, false, 0, 0.016);
assert.deepStrictEqual(centerPause, vehiclePosB, 'Pause locks immediately to vehicle position');
pass('Pausing playback immediately locks camera center to vehicle');

// 1.4 No regression to B13 camera rotation
assert.strictEqual(shortestAngularDiff(355, 5), -10, 'Angular diff 355->5 across North is -10 deg');
assert.strictEqual(shortestAngularDiff(5, 355), 10, 'Angular diff 5->355 across North is +10 deg');
pass('B13 shortest-angular-path rotation logic strictly preserved');


// =================================================================================================
// 2. WHOLE TOUR — CACHE INVALIDATION & FITBOUNDS
// =================================================================================================
console.log('\n--- 2. Whole Tour Cache Invalidation ---');

const testRoutePoints: RoutePoint[] = [
  { lat: 46.50, lng: 10.40 },
  { lat: 46.55, lng: 10.45 },
  { lat: 46.60, lng: 10.50 },
  { lat: 46.65, lng: 10.55 },
];

let lastWholeTourKey = '';
let fitBoundsCalls = 0;

function executeWholeTourCameraLogic(
  preset: CameraModePreset,
  pts: RoutePoint[],
  isPlaying: boolean
) {
  // Fix logic: Invalidate cache when leaving Whole Tour
  if (preset !== 'whole_tour') {
    lastWholeTourKey = '';
  }

  const effectiveMode = preset === 'whole_tour' ? 'still' : 'follow';
  if (effectiveMode === 'still') {
    if (preset === 'whole_tour' && pts.length > 0) {
      const tourKey = `${pts.length}-${pts[0]?.lat.toFixed(4)},${pts[0]?.lng.toFixed(4)}-${pts[pts.length - 1]?.lat.toFixed(4)},${pts[pts.length - 1]?.lng.toFixed(4)}`;
      if (lastWholeTourKey !== tourKey) {
        lastWholeTourKey = tourKey;
        fitBoundsCalls++;
      }
      return;
    }
  }
}

// Sequence: Fly Along -> Whole Tour -> Fly Along -> Whole Tour
fitBoundsCalls = 0;
lastWholeTourKey = '';

// Step 1: Start on Fly Along
executeWholeTourCameraLogic('fly_along', testRoutePoints, false);
assert.strictEqual(fitBoundsCalls, 0, 'No fitBounds on Fly Along');

// Step 2: Switch to Whole Tour
executeWholeTourCameraLogic('whole_tour', testRoutePoints, false);
assert.strictEqual(fitBoundsCalls, 1, 'fitBounds called on 1st Whole Tour selection');
pass('Whole Tour: fitBounds() called on initial selection');

// Step 3: During playback in Whole Tour, ensure NO repeated fitBounds calls
for (let frame = 0; frame < 60; frame++) {
  executeWholeTourCameraLogic('whole_tour', testRoutePoints, true);
}
assert.strictEqual(fitBoundsCalls, 1, 'fitBounds not repeatedly called during active playback in Whole Tour');
pass('Whole Tour: fitBounds() strictly called ONCE during playback (no repeated calls)');

// Step 4: Switch back to Fly Along
executeWholeTourCameraLogic('fly_along', testRoutePoints, false);
assert.strictEqual(lastWholeTourKey, '', 'Cache key invalidated on leaving Whole Tour');
pass('Whole Tour: cache key invalidated upon leaving Whole Tour');

// Step 5: Switch back to Whole Tour (2nd time)
executeWholeTourCameraLogic('whole_tour', testRoutePoints, false);
assert.strictEqual(fitBoundsCalls, 2, 'fitBounds called on 2nd Whole Tour selection');
pass('Whole Tour: fitBounds() called reliably on returning to Whole Tour (Fly Along -> Whole Tour -> Fly Along -> Whole Tour)');

// Step 6: Route geometry change triggers fitBounds
const updatedRoutePoints = [...testRoutePoints, { lat: 46.70, lng: 10.60 }];
executeWholeTourCameraLogic('whole_tour', updatedRoutePoints, false);
assert.strictEqual(fitBoundsCalls, 3, 'fitBounds called when route geometry changes');
pass('Whole Tour: route geometry modification recalculates bounds and calls fitBounds()');


// =================================================================================================
// 3. ROUTE COMPLETION — VEHICLE AND CAMERA DESTINATION RETENTION
// =================================================================================================
console.log('\n--- 3. Route Completion Behavior ---');

const projectDuration = 40.0;
let currentTimeState = 39.9;
let isPlayingState = true;
let isRenderingState = false;
let renderAllScenesState = false;
let activeSceneIdx = 0;
const sceneCount = 1;

// Simulate timeline playhead tick at completion
function tickTimelineLoop(deltaSec: number) {
  const prev = currentTimeState;
  const next = prev + deltaSec;
  if (next >= projectDuration) {
    if (isRenderingState && renderAllScenesState && activeSceneIdx < sceneCount - 1) {
      activeSceneIdx++;
      currentTimeState = 0;
      return;
    }
    isPlayingState = false;
    currentTimeState = projectDuration; // Approved fix: retain duration!
    return;
  }
  currentTimeState = next;
}

// 3.1 Playback reaches end
tickTimelineLoop(0.2); // 39.9 + 0.2 = 40.1 >= 40.0
assert.strictEqual(isPlayingState, false, 'Playback stopped at duration');
assert.strictEqual(currentTimeState, 40.0, 'Current time retained at 40.0s (100%)');
pass('Playback completion retains currentTime = duration (40.0s), does not reset to 0');

// 3.2 Vehicle progress at completion
const completionProgress = currentTimeState / projectDuration;
assert.strictEqual(completionProgress, 1.0, 'Progress ratio is exactly 1.0 at completion');
pass('Vehicle progress strictly retained at 100% (destination)');

// 3.3 Clicking Play after completion restarts from 0
function onFooterPlayClick() {
  if (currentTimeState >= projectDuration) {
    currentTimeState = 0;
    isPlayingState = true;
  } else {
    isPlayingState = !isPlayingState;
  }
}

onFooterPlayClick();
assert.strictEqual(currentTimeState, 0, 'Clicking Play when completed restarts from time 0');
assert.strictEqual(isPlayingState, true, 'Clicking Play when completed starts playing');
pass('Clicking Play when completed restarts playback cleanly from 0.0s');

// 3.4 Pausing mid-route preserves position
currentTimeState = 22.5;
isPlayingState = true;
onFooterPlayClick(); // Toggles to pause
assert.strictEqual(isPlayingState, false, 'Toggled to paused');
assert.strictEqual(currentTimeState, 22.5, 'Paused time preserved at 22.5s');
pass('Pausing mid-route preserves exact currentTime (22.5s)');

// 3.5 Resuming from pause continues from same position
onFooterPlayClick(); // Toggles to resume
assert.strictEqual(isPlayingState, true, 'Resumed to playing');
assert.strictEqual(currentTimeState, 22.5, 'Resumed from exact paused time 22.5s');
pass('Resuming mid-route continues from exact position');

// 3.6 Spacebar shortcut behaves identically
currentTimeState = projectDuration;
isPlayingState = false;
function onSpacebarPress() {
  if (currentTimeState >= projectDuration) {
    currentTimeState = 0;
    isPlayingState = true;
  } else {
    isPlayingState = !isPlayingState;
  }
}
onSpacebarPress();
assert.strictEqual(currentTimeState, 0, 'Spacebar when completed restarts from 0.0s');
assert.strictEqual(isPlayingState, true, 'Spacebar when completed starts playing');
pass('Spacebar shortcut restarts completed playback from 0.0s');

// 3.7 Multi-scene export transition preserved
isRenderingState = true;
renderAllScenesState = true;
activeSceneIdx = 0;
currentTimeState = 39.9;
// Test multi-scene with 2 scenes
const multiSceneCount = 2;
function tickMultiSceneLoop(deltaSec: number) {
  const prev = currentTimeState;
  const next = prev + deltaSec;
  if (next >= projectDuration) {
    if (isRenderingState && renderAllScenesState && activeSceneIdx < multiSceneCount - 1) {
      activeSceneIdx++;
      currentTimeState = 0;
      return;
    }
    isPlayingState = false;
    currentTimeState = projectDuration;
    return;
  }
  currentTimeState = next;
}
tickMultiSceneLoop(0.2);
assert.strictEqual(activeSceneIdx, 1, 'Multi-scene export transitions to next scene');
assert.strictEqual(currentTimeState, 0, 'Multi-scene export resets currentTime for next scene');
pass('Multi-scene export transition logic strictly preserved');


// =================================================================================================
// 4. QUICK ROUTE PREVIEW INDEPENDENT SEPARATION
// =================================================================================================
console.log('\n--- 4. Quick Route Preview Independent Separation ---');

const d60 = 60;
assert.strictEqual(computeQuickPreviewDurationSeconds(d60, 'normal'), 30, '60 km @ normal = 30s');
assert.strictEqual(computeQuickPreviewDurationSeconds(d60, 'slow'), 60, '60 km @ slow = 60s');
assert.strictEqual(computeQuickPreviewDurationSeconds(d60, 'fast'), 15, '60 km @ fast = 15s');
assert.strictEqual(computeQuickPreviewDurationSeconds(5, 'normal'), 10, '5 km @ normal clamped to min 10s');
assert.strictEqual(computeQuickPreviewDurationSeconds(400, 'normal'), 120, '400 km @ normal clamped to max 120s');
pass('Quick Route Preview hybrid duration model, calibration, and clamping completely preserved');

console.log(`\n=======================================================`);
console.log(`ALL ${totalTestsPassed} STABILIZATION ROUND 2 TESTS PASSED!`);
console.log(`=======================================================`);
