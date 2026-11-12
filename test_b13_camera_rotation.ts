import { CatmullRom3DPath } from './src/utils/catmullRom3DPath.ts';
import { mapPresetToCameraBlocks, computeRouteBounds } from './src/utils/cameraPresetMapper.ts';
import type { RoutePoint } from './src/types/index.ts';

// Implementation under test: shortest signed angular difference and follow bearing calculation
function shortestAngularDiff(targetDeg: number, currentDeg: number): number {
  return ((((targetDeg - currentDeg + 540) % 360) + 360) % 360) - 180;
}

class CameraFollowEngine {
  private followBearing: number | null = null;
  private lastProgress: number = 0;

  public update(targetBearingNorm: number, progress: number, isPlaying: boolean): number {
    const progressJump = Math.abs(progress - this.lastProgress);
    this.lastProgress = progress;

    if (this.followBearing === null || !isPlaying || progressJump > 0.05) {
      this.followBearing = targetBearingNorm;
    } else {
      const diff = shortestAngularDiff(targetBearingNorm, this.followBearing);
      const alpha = 0.20;
      const unclampedStep = alpha * diff;
      // Cap maximum rotational angular speed to prevent whipping on extreme 180° hairpins
      const maxAngularSpeed = 6.0;
      const step = Math.max(-maxAngularSpeed, Math.min(maxAngularSpeed, unclampedStep));
      const next = this.followBearing + step;
      this.followBearing = ((next % 360) + 360) % 360;
    }
    return this.followBearing;
  }

  public reset() {
    this.followBearing = null;
    this.lastProgress = 0;
  }
}

async function runCameraRotationTests() {
  console.log('=== VERIFYING B13 CAMERA ROTATION & SMOOTH BEARING TRACKING ===\n');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, name: string) {
    total++;
    if (condition) {
      console.log(`  ✓ ${name}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${name}`);
      process.exitCode = 1;
    }
  }

  // --------------------------------------------------------------------------
  // 1. Shortest Angular Difference Across Critical Boundaries
  // --------------------------------------------------------------------------
  console.log('1. Verifying Shortest Signed Angular Difference:');

  // Crossing North (0° / 360°) clockwise: 355° -> 5°
  const northClockwise = shortestAngularDiff(5, 355);
  assert(northClockwise === 10, `North crossing (355° -> 5°) yields +10° (got ${northClockwise}°)`);

  // Crossing North (0° / 360°) counter-clockwise: 5° -> 355°
  const northCounter = shortestAngularDiff(355, 5);
  assert(northCounter === -10, `North crossing (5° -> 355°) yields -10° (got ${northCounter}°)`);

  // Crossing South (180° boundary): 175° -> 185°
  const southClockwise = shortestAngularDiff(185, 175);
  assert(southClockwise === 10, `South crossing (175° -> 185°) yields +10° (got ${southClockwise}°)`);

  // Crossing South counter-clockwise: 185° -> 175°
  const southCounter = shortestAngularDiff(175, 185);
  assert(southCounter === -10, `South crossing (185° -> 175°) yields -10° (got ${southCounter}°)`);

  // Exactly opposite (180° turn)
  const opp = Math.abs(shortestAngularDiff(180, 0));
  assert(opp === 180, 'Opposite heading yields 180°');

  // --------------------------------------------------------------------------
  // 2. North-to-East Direction Change (0° -> 90°)
  // --------------------------------------------------------------------------
  console.log('\n2. Verifying North-to-East Direction Change:');
  const northToEastPoints: RoutePoint[] = [
    { lng: 10.00, lat: 50.00 },
    { lng: 10.00, lat: 50.10 }, // Traveling North (0°)
    { lng: 10.05, lat: 50.15 }, // Turning North-East (45°)
    { lng: 10.15, lat: 50.15 }, // Traveling East (90°)
  ];
  const n2ePath = new CatmullRom3DPath(northToEastPoints);
  const n2eEngine = new CameraFollowEngine();

  let maxStepN2E = 0;
  let prevBearingN2E = -1;
  for (let i = 0; i <= 100; i++) {
    const p = i / 100;
    const u = n2ePath.getSplineParameterAtDistanceProgress(p);
    const sample = n2ePath.sample(u)!;
    const normH = ((sample.headingDeg % 360) + 360) % 360;
    const camBearing = n2eEngine.update(normH, p, true);

    if (prevBearingN2E >= 0) {
      const step = Math.abs(shortestAngularDiff(camBearing, prevBearingN2E));
      if (step > maxStepN2E) maxStepN2E = step;
    }
    prevBearingN2E = camBearing;
  }
  assert(maxStepN2E < 5.0, `North-to-East rotation is smooth (max step change: ${maxStepN2E.toFixed(2)}° < 5.0°)`);
  assert(prevBearingN2E > 75 && prevBearingN2E < 105, `Final bearing aligns with East heading: ${prevBearingN2E.toFixed(1)}°`);

  // --------------------------------------------------------------------------
  // 3. East-to-South Direction Change (90° -> 180°)
  // --------------------------------------------------------------------------
  console.log('\n3. Verifying East-to-South Direction Change:');
  const eastToSouthPoints: RoutePoint[] = [
    { lng: 10.00, lat: 50.00 },
    { lng: 10.10, lat: 50.00 }, // Traveling East (90°)
    { lng: 10.15, lat: 49.95 }, // Turning South-East (135°)
    { lng: 10.15, lat: 49.85 }, // Traveling South (180°)
  ];
  const e2sPath = new CatmullRom3DPath(eastToSouthPoints);
  const e2sEngine = new CameraFollowEngine();

  let maxStepE2S = 0;
  let prevBearingE2S = -1;
  for (let i = 0; i <= 100; i++) {
    const p = i / 100;
    const u = e2sPath.getSplineParameterAtDistanceProgress(p);
    const sample = e2sPath.sample(u)!;
    const normH = ((sample.headingDeg % 360) + 360) % 360;
    const camBearing = e2sEngine.update(normH, p, true);

    if (prevBearingE2S >= 0) {
      const step = Math.abs(shortestAngularDiff(camBearing, prevBearingE2S));
      if (step > maxStepE2S) maxStepE2S = step;
    }
    prevBearingE2S = camBearing;
  }
  assert(maxStepE2S < 5.0, `East-to-South rotation is smooth (max step change: ${maxStepE2S.toFixed(2)}° < 5.0°)`);
  assert(prevBearingE2S > 165 && prevBearingE2S < 195, `Final bearing aligns with South heading: ${prevBearingE2S.toFixed(1)}°`);

  // --------------------------------------------------------------------------
  // 4. Route Crossing 0° / 360° North Boundary
  // --------------------------------------------------------------------------
  console.log('\n4. Verifying Route Crossing 0° / 360° Boundary:');
  const crossingNorthPoints: RoutePoint[] = [
    { lng: 10.02, lat: 50.00 },
    { lng: 10.00, lat: 50.05 }, // Heading North-North-West (~340°)
    { lng: 10.00, lat: 50.10 }, // Crossing North (0°/360°)
    { lng: 10.02, lat: 50.15 }, // Heading North-North-East (~20°)
  ];
  const northCrossPath = new CatmullRom3DPath(crossingNorthPoints);
  const northCrossEngine = new CameraFollowEngine();

  let maxStepNorthCross = 0;
  let prevBearingNorthCross = -1;
  let hasCrossedBoundary = false;

  for (let i = 0; i <= 100; i++) {
    const p = i / 100;
    const u = northCrossPath.getSplineParameterAtDistanceProgress(p);
    const sample = northCrossPath.sample(u)!;
    const normH = ((sample.headingDeg % 360) + 360) % 360;
    const camBearing = northCrossEngine.update(normH, p, true);

    if (prevBearingNorthCross >= 0) {
      const step = Math.abs(shortestAngularDiff(camBearing, prevBearingNorthCross));
      if (step > maxStepNorthCross) maxStepNorthCross = step;
      if (Math.abs(shortestAngularDiff(normH, 0)) < 2) {
        hasCrossedBoundary = true;
      }
    }
    prevBearingNorthCross = camBearing;
  }

  assert(hasCrossedBoundary, 'Route successfully crosses the exact 0°/360° North boundary');
  assert(maxStepNorthCross < 2.0, `Crossing North causes NO 360° spin (max step change: ${maxStepNorthCross.toFixed(3)}° < 2.0°)`);

  // --------------------------------------------------------------------------
  // 5. Alpine Hairpins & Sharp Curves
  // --------------------------------------------------------------------------
  console.log('\n5. Verifying Sharp Hairpin Curves:');
  const hairpinPoints: RoutePoint[] = [
    { lng: 10.4533, lat: 46.5292 },
    { lng: 10.4580, lat: 46.5310 },
    { lng: 10.4540, lat: 46.5330 }, // Switchback 1
    { lng: 10.4610, lat: 46.5350 }, // Switchback 2
    { lng: 10.4570, lat: 46.5370 }, // Switchback 3
    { lng: 10.4655, lat: 46.5380 },
  ];
  const hairpinPath = new CatmullRom3DPath(hairpinPoints);
  const hairpinEngine = new CameraFollowEngine();

  let maxStepHairpin = 0;
  let prevBearingHairpin = -1;
  for (let i = 0; i <= 200; i++) {
    const p = i / 200;
    const u = hairpinPath.getSplineParameterAtDistanceProgress(p);
    const sample = hairpinPath.sample(u)!;
    const normH = ((sample.headingDeg % 360) + 360) % 360;
    const camBearing = hairpinEngine.update(normH, p, true);

    if (prevBearingHairpin >= 0) {
      const step = Math.abs(shortestAngularDiff(camBearing, prevBearingHairpin));
      if (step > maxStepHairpin) maxStepHairpin = step;
    }
    prevBearingHairpin = camBearing;
  }
  assert(maxStepHairpin < 8.0, `Alpine hairpins produce gradual, smooth rotation (max step: ${maxStepHairpin.toFixed(2)}° < 8.0°)`);

  // --------------------------------------------------------------------------
  // 6. Long Straight Sections (Kansas I-70)
  // --------------------------------------------------------------------------
  console.log('\n6. Verifying Long Straight Sections:');
  const straightPoints: RoutePoint[] = [
    { lng: -101.5000, lat: 39.3500 },
    { lng: -99.5000, lat: 39.3500 },
    { lng: -97.5000, lat: 39.3500 },
  ];
  const straightPath = new CatmullRom3DPath(straightPoints);
  const straightEngine = new CameraFollowEngine();

  let straightMaxJitter = 0;
  let straightFirstBearing = -1;
  for (let i = 0; i <= 100; i++) {
    const p = i / 100;
    const u = straightPath.getSplineParameterAtDistanceProgress(p);
    const sample = straightPath.sample(u)!;
    const normH = ((sample.headingDeg % 360) + 360) % 360;
    const camBearing = straightEngine.update(normH, p, true);

    if (i === 0) straightFirstBearing = camBearing;
    const jitter = Math.abs(camBearing - straightFirstBearing);
    if (jitter > straightMaxJitter) straightMaxJitter = jitter;
  }
  assert(straightMaxJitter < 0.01, `Straight section orientation is rock-solid (jitter: ${straightMaxJitter.toFixed(4)}° < 0.01°)`);

  // --------------------------------------------------------------------------
  // 7. Pause, Resume and Restart
  // --------------------------------------------------------------------------
  console.log('\n7. Verifying Pause, Resume and Restart:');
  const prEngine = new CameraFollowEngine();
  const testRoutePoints: RoutePoint[] = [
    { lng: 8.5417, lat: 47.3769 },
    { lng: 7.4474, lat: 46.9480 },
    { lng: 6.1432, lat: 46.2044 },
  ];
  const prPath = new CatmullRom3DPath(testRoutePoints);

  // Play to 30%
  let bAt30 = 0;
  for (let i = 0; i <= 30; i++) {
    const p = i / 100;
    const u = prPath.getSplineParameterAtDistanceProgress(p);
    const sample = prPath.sample(u)!;
    const normH = ((sample.headingDeg % 360) + 360) % 360;
    bAt30 = prEngine.update(normH, p, true);
  }

  // Pause at 30%
  const u30 = prPath.getSplineParameterAtDistanceProgress(0.3);
  const target30 = ((prPath.sample(u30)!.headingDeg % 360) + 360) % 360;
  const bPaused = prEngine.update(target30, 0.3, false);
  assert(bPaused === target30, `Paused state locks immediately to target bearing (${bPaused.toFixed(1)}°) without lag`);

  // Restart to 0%
  const u0 = prPath.getSplineParameterAtDistanceProgress(0.0);
  const target0 = ((prPath.sample(u0)!.headingDeg % 360) + 360) % 360;
  const bRestarted = prEngine.update(target0, 0.0, false);
  assert(bRestarted === target0, `Restart to 0% immediately restores initial route heading (${bRestarted.toFixed(1)}°)`);

  // --------------------------------------------------------------------------
  // 8. Switching Between Whole Tour and Fly Along
  // --------------------------------------------------------------------------
  console.log('\n8. Verifying Whole Tour <-> Fly Along Switching:');
  const wholeTourBlocks = mapPresetToCameraBlocks('whole_tour', testRoutePoints);
  assert(wholeTourBlocks[0].kind === 'still', 'Whole Tour remains unchanged (kind: "still")');
  assert(wholeTourBlocks[0].pitch === 10, 'Whole Tour pitch remains 10°');

  prEngine.reset(); // Simulates reset on switching away from follow
  const bReturnedToFollow = prEngine.update(target0, 0.0, false);
  assert(bReturnedToFollow === target0, 'Switching back to Fly Along cleanly initializes orientation to vehicle');

  console.log('\n========================================');
  console.log(`RESULTS: ${passed} / ${total} assertions passed.`);
  console.log('========================================');
}

runCameraRotationTests();
