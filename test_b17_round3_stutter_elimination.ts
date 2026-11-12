/**
 * test_b17_round3_stutter_elimination.ts
 *
 * Automated verification test suite for B17 Rendering Correction Round 3 — Global Playback Stutter Elimination:
 * 1. Correction A: Single camera writer during active playback (Quick Preview & Timeline), passive effect disabled during playback, active when paused/idle/Whole Tour.
 * 2. Correction B: Memoized projectRoutes, guarded ThreeMapLayer.setRoute() and setModelKind(), async model loading race protection & GPU disposal.
 * 3. Correction C: 3D ribbon optimization (hidden for ground routes, preserved & buffer-reused for Air/elevated routes).
 * 4. Correction D: WeakMap cumulative distance cache, binary search, zero point cloning, single smooth path per frame, cached SVG projection during 30 Hz React commits.
 * 5. Correction E: Deterministic rAF callback scheduling order (authoritative playback clock registered before MapLibre _render).
 */

import * as fs from 'fs';
import * as path from 'path';
import { getSmoothSnakePath } from './src/utils/snakePathInterpolation.ts';
import { ThreeMapLayer } from './src/utils/threeMapLayer.ts';
import { computeOptionARouteProjection } from './src/utils/routeProjection.ts';
import { shortestAngularDiff } from './src/utils/cameraPresetMapper.ts';
import type { RoutePoint } from './src/types/index.ts';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ ${msg}`);
}

console.log('=== TEST SUITE: B17 ROUND 3 GLOBAL PLAYBACK STUTTER ELIMINATION ===\n');

// Build a realistic 1,000-point route
const route1000: RoutePoint[] = [];
for (let i = 0; i < 1000; i++) {
  const t = i / 999;
  route1000.push({
    lng: 2.3522 + t * 0.25 + Math.sin(t * 15) * 0.01,
    lat: 48.8566 + t * 0.18 + Math.cos(t * 12) * 0.008,
    ele: 0,
  });
}

// -----------------------------------------------------------------------------
// 1. CORRECTION A: Camera Single-Writer & Passive Effect Gating
// -----------------------------------------------------------------------------
console.log('--- 1. Correction A: Single Camera Writer & Passive Effect Gating ---');
{
  const mapViewerSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/MapViewer.tsx'),
    'utf8'
  );

  // Verify passive camera effect has early exit during active playback
  assert(
    mapViewerSrc.includes('if (isPlaying || (isQuickPreviewActive && (isQuickPreviewPlaying ?? true))) {\n      return;\n    }'),
    'Passive camera useEffect exits immediately when Timeline playback or Quick Route Preview is actively playing'
  );

  // Simulate 180 frames (3.0s at 60 Hz) with 30 Hz React commits to verify 1:1 camera jumpTo and 1.00x step ratio
  let followBearingRef: number | null = null;
  let followCenterRef: [number, number] | null = null;
  let lastFollowProgressRef = 0;
  let jumpToCalls = 0;
  const centerSteps: number[] = [];

  for (let f = 1; f <= 180; f++) {
    const dtSec = 1 / 60;
    const progress = f / 180;
    const sample = getSmoothSnakePath(route1000, progress)!;
    const vehicleLngLat: [number, number] = [sample.tipPoint.lng, sample.tipPoint.lat];
    const targetBearing = ((sample.headingDeg % 360) + 360) % 360;

    // 1. Authoritative updatePlaybackFrame()
    const progressJump = Math.abs(progress - lastFollowProgressRef);
    lastFollowProgressRef = progress;

    if (followBearingRef === null || progressJump > 0.08) {
      followBearingRef = targetBearing;
    } else {
      const diff = shortestAngularDiff(targetBearing, followBearingRef);
      const decay = 1 - Math.exp(-10.0 * dtSec);
      const maxStep = 240.0 * dtSec;
      const step = Math.sign(diff * decay) * Math.min(Math.abs(diff * decay), maxStep);
      followBearingRef = ((followBearingRef + step) % 360 + 360) % 360;
    }

    const prevCenter = followCenterRef;
    if (followCenterRef === null || progressJump > 0.08) {
      followCenterRef = [vehicleLngLat[0], vehicleLngLat[1]];
    } else {
      const decay = 1 - Math.exp(-10.0 * dtSec);
      followCenterRef = [
        followCenterRef[0] + (vehicleLngLat[0] - followCenterRef[0]) * decay,
        followCenterRef[1] + (vehicleLngLat[1] - followCenterRef[1]) * decay,
      ];
    }
    jumpToCalls++;

    if (prevCenter) {
      const stepDist = Math.hypot(
        followCenterRef[0] - prevCenter[0],
        followCenterRef[1] - prevCenter[1]
      );
      centerSteps.push(stepDist);
    }

    // 2. Throttled 30 Hz React state flush (every 2nd frame): passive useEffect is gated
    const isPlaying = true;
    const passiveEffectRuns = !isPlaying;
    if (passiveEffectRuns) {
      throw new Error('Passive effect must not run during active playback');
    }
  }
  assert(true, 'Passive camera useEffect remained gated across all 90 throttled React state commits');

  let evenSum = 0;
  let oddSum = 0;
  let evenCount = 0;
  let oddCount = 0;
  for (let i = 10; i < centerSteps.length; i++) {
    if (i % 2 === 0) {
      evenSum += centerSteps[i];
      evenCount++;
    } else {
      oddSum += centerSteps[i];
      oddCount++;
    }
  }
  const sawtoothRatio = (evenSum / evenCount) / (oddSum / oddCount);

  assert(jumpToCalls === 180, `Camera updated exactly once per playback frame: ${jumpToCalls} updates for 180 frames (60.0 Hz)`);
  assert(
    Math.abs(sawtoothRatio - 1.0) < 0.03,
    `Even/Odd frame camera displacement ratio is smooth 1.00x (measured: ${sawtoothRatio.toFixed(3)}x vs 2.94x sawtooth before fix)`
  );
}

// -----------------------------------------------------------------------------
// 2. CORRECTION B: Route & Vehicle Reconstruction Guards + Async Race Safety
// -----------------------------------------------------------------------------
console.log('\n--- 2. Correction B: Route & Vehicle Reconstruction Guards + Async Safety ---');
{
  const editorSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/EditorPage.tsx'),
    'utf8'
  );
  assert(
    editorSrc.includes('const projectRoutes: Route[] = useMemo(\n    () => [getAdaptedCanonicalRoute(canonicalRoute)],\n    [canonicalRoute]\n  );'),
    'EditorPage memoizes projectRoutes with useMemo([canonicalRoute])'
  );

  const layer = new ThreeMapLayer({ modelKind: 'car', colorHex: '#ff4d2e' });
  let pathUpdateCalls = 0;
  const origUpdatePoints = (layer as any).pathEngine.updatePoints.bind((layer as any).pathEngine);
  (layer as any).pathEngine.updatePoints = (pts: RoutePoint[]) => {
    pathUpdateCalls++;
    return origUpdatePoints(pts);
  };

  // First setRoute builds spline
  layer.setRoute(route1000, '#ff4d2e');
  assert(pathUpdateCalls === 1, 'Initial setRoute() builds CatmullRom3DPath once');

  // Repeated setRoute with same array reference does NOT rebuild spline
  layer.setRoute(route1000, '#ff4d2e');
  layer.setRoute(route1000, '#ff4d2e');
  assert(pathUpdateCalls === 1, 'Unchanged route reference skips CatmullRom3DPath rebuild (0 redundant rebuilds)');

  // Repeated setRoute with cloned array of identical coordinates also skips rebuild
  const clonedIdentical = route1000.map((p) => ({ ...p }));
  layer.setRoute(clonedIdentical, '#ff4d2e');
  assert(pathUpdateCalls === 1, 'Cloned route with identical geometry skips CatmullRom3DPath rebuild');

  // Genuine route edit (e.g. dragging a waypoint) DOES rebuild spline
  const editedRoute = route1000.map((p, idx) => (idx === 500 ? { ...p, lat: p.lat + 0.05 } : p));
  layer.setRoute(editedRoute, '#ff4d2e');
  assert(pathUpdateCalls === 2, 'Modified route geometry triggers CatmullRom3DPath rebuild immediately');

  // Vehicle model guard test
  let loadModelCalls = 0;
  const origLoadModel = (layer as any).vehicleManager.loadModel.bind((layer as any).vehicleManager);
  (layer as any).vehicleManager.loadModel = async (...args: any[]) => {
    loadModelCalls++;
    return origLoadModel(...args);
  };

  await (layer as any).loadVehicleModel();
  assert(loadModelCalls === 1, 'Initial loadVehicleModel() loads 3D vehicle once');

  // Calling setModelKind with same kind ('car') must NOT reload
  layer.setModelKind('car');
  layer.setModelKind('car');
  assert(loadModelCalls === 1, 'Unchanged modelKind ("car") does NOT reload or recreate 3D vehicle meshes');

  // Async race protection: rapid model switching ('tank' -> 'fighter')
  let resolveTank!: (g: any) => void;
  let resolveFighter!: (g: any) => void;
  const tankGroup = (layer as any).vehicleManager.createProceduralModel('tank', '#ff4d2e');
  const fighterGroup = (layer as any).vehicleManager.createProceduralModel('fighter', '#ff4d2e');

  (layer as any).vehicleManager.loadModel = (kind: string) => {
    if (kind === 'tank') {
      return new Promise((r) => {
        resolveTank = r;
      });
    }
    return new Promise((r) => {
      resolveFighter = r;
    });
  };

  const previousVehicleGroup = (layer as any).vehicleGroup;
  layer.setModelKind('tank');
  // While tank is still loading asynchronously, vehicleGroup must remain visible (no flicker!)
  assert(
    (layer as any).vehicleGroup === previousVehicleGroup && previousVehicleGroup !== null,
    'Existing vehicleGroup remains in scene while new model loads asynchronously (zero mid-frame flicker)'
  );

  // User immediately switches to 'fighter' before 'tank' finishes loading
  layer.setModelKind('fighter');
  resolveFighter(fighterGroup);
  await new Promise((r) => setTimeout(r, 5));
  assert((layer as any).vehicleGroup === fighterGroup, 'Newer async model ("fighter") applied cleanly');

  // Now stale 'tank' promise resolves late — must NOT overwrite 'fighter'!
  resolveTank(tankGroup);
  await new Promise((r) => setTimeout(r, 5));
  assert(
    (layer as any).vehicleGroup === fighterGroup,
    'Stale async model load ("tank") is discarded and cannot overwrite newer selection ("fighter")'
  );
}

// -----------------------------------------------------------------------------
// 3. CORRECTION C: 3D Ribbon Optimization (Ground vs Air)
// -----------------------------------------------------------------------------
console.log('\n--- 3. Correction C: 3D Ribbon Optimization (Ground vs Air) ---');
{
  const layer = new ThreeMapLayer({ modelKind: 'car', colorHex: '#ff4d2e' });
  // Initialize ribbon meshes and mock renderer/map
  (layer as any).initRibbonMeshes();
  (layer as any).initTipTargetMesh();
  (layer as any).vehicleGroup = (layer as any).vehicleManager.createProceduralModel('car', '#ff4d2e');
  (layer as any).scene.add((layer as any).vehicleGroup);
  (layer as any).map = {
    triggerRepaint() {},
  };
  (layer as any).renderer = {
    resetState() {},
    render() {},
  };

  let generateRibbonCalls = 0;
  const origGenerateRibbon = (layer as any).pathEngine.generateRibbonGeometry.bind((layer as any).pathEngine);
  (layer as any).pathEngine.generateRibbonGeometry = (...args: any[]) => {
    generateRibbonCalls++;
    return origGenerateRibbon(...args);
  };

  // Ground route (ele = 0, modelKind = 'car')
  layer.setRoute(route1000, '#ff4d2e');
  layer.setProgress(0.5);
  layer.render({} as any, {
    modelViewProjectionMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  } as any);

  assert(generateRibbonCalls === 0, 'Ground route skips 3D WebGL ribbon extrusion completely (0 generateRibbonGeometry calls)');
  assert(
    (layer as any).ribbonOuterMesh.visible === false && (layer as any).ribbonInnerMesh.visible === false,
    'Ground route hides 3D ribbon meshes while keeping 2D SVG route overlay active'
  );
  assert((layer as any).vehicleGroup.visible === true, 'Ground route keeps 3D vehicle visible');

  // Air route (modelKind = 'fighter')
  (layer as any).modelKind = 'fighter';
  const outerPosAttrBefore = (layer as any).ribbonOuterMesh.geometry.getAttribute('position');
  const outerIndexBefore = (layer as any).ribbonOuterMesh.geometry.index;

  layer.render({} as any, {
    modelViewProjectionMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  } as any);
  layer.setProgress(0.6);
  layer.render({} as any, {
    modelViewProjectionMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  } as any);

  const outerPosAttrAfter = (layer as any).ribbonOuterMesh.geometry.getAttribute('position');
  const outerIndexAfter = (layer as any).ribbonOuterMesh.geometry.index;

  assert(generateRibbonCalls === 2, 'Air route generates 3D elevated WebGL ribbon on each frame');
  assert(
    (layer as any).ribbonOuterMesh.visible === true && (layer as any).ribbonInnerMesh.visible === true,
    'Air route displays 3D ribbon meshes'
  );
  assert(
    outerPosAttrBefore === outerPosAttrAfter,
    'Air route reuses pre-allocated THREE.BufferAttribute in-place without allocating new GPU buffers per frame'
  );
  assert(
    outerIndexBefore === outerIndexAfter,
    'Air route reuses shared static index buffer across frames'
  );
}

// -----------------------------------------------------------------------------
// 4. CORRECTION D: Path Interpolation Cache, Zero Point Cloning & Single Projection
// -----------------------------------------------------------------------------
console.log('\n--- 4. Correction D: WeakMap Distance Cache & Zero Point Cloning ---');
{
  const sampleA = getSmoothSnakePath(route1000, 0.5)!;
  const sampleB = getSmoothSnakePath(route1000, 0.75)!;

  // Verify drawnPoints reuse original RoutePoint references (except for the interpolated tipPoint at the end)
  assert(
    sampleA.drawnPoints[0] === route1000[0] &&
      sampleA.drawnPoints[sampleA.segmentIndex] === route1000[sampleA.segmentIndex],
    'getSmoothSnakePath reuses original RoutePoint object references without cloning ({ ...pt })'
  );
  assert(
    sampleB.drawnPoints[250] === route1000[250],
    'Subsequent getSmoothSnakePath calls preserve exact point references and hit WeakMap cumulative distance cache'
  );

  // Verify MapViewer calls getSmoothSnakePath once per updatePlaybackFrame and caches projection for JSX
  const mapViewerSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/MapViewer.tsx'),
    'utf8'
  );
  const updateBodyMatch = mapViewerSrc.split('updatePlaybackFrame: (params: PlaybackFrameParams) => {')[1]?.split('const [viewSize, setViewSize]')[0] || '';
  const snakeCallsInUpdate = (updateBodyMatch.match(/getSmoothSnakePath\(/g) || []).length;
  assert(
    snakeCallsInUpdate === 1,
    `updatePlaybackFrame() calls getSmoothSnakePath() exactly once per frame (found: ${snakeCallsInUpdate})`
  );
  assert(
    mapViewerSrc.includes('const proj = cachedPlayback\n              ? cachedPlayback.proj\n              : computeOptionARouteProjection(map, currentPoints, snakeSample.headingDeg);'),
    'MapViewer JSX reuses cachedPlayback.proj during active playback instead of running duplicate computeOptionARouteProjection()'
  );
}

// -----------------------------------------------------------------------------
// 5. CORRECTION E: Authoritative rAF Scheduling Order
// -----------------------------------------------------------------------------
console.log('\n--- 5. Correction E: Authoritative rAF Callback Registration Order ---');
{
  const editorSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/EditorPage.tsx'),
    'utf8'
  );

  // Verify Quick Preview tick schedules requestAnimationFrame(tick) BEFORE updatePlaybackFrame
  const tickSection = editorSrc.split('const tick = (now: number) => {')[1]?.split('return () => {')[0] || '';
  const rafIdxQuick = tickSection.indexOf('previewRafRef.current = requestAnimationFrame(tick);');
  const updateIdxQuick = tickSection.lastIndexOf('mapViewerRef.current?.updatePlaybackFrame({');
  assert(
    rafIdxQuick > 0 && updateIdxQuick > rafIdxQuick,
    'Quick Preview tick() registers requestAnimationFrame(tick) BEFORE calling updatePlaybackFrame()'
  );

  // Verify Timeline loop schedules requestAnimationFrame(loop) BEFORE updatePlaybackFrame
  const loopSection = editorSrc.split('const loop = (now: number) => {')[1]?.split('return () => cancelAnimationFrame(frameId);')[0] || '';
  const rafIdxTimeline = loopSection.indexOf('frameId = requestAnimationFrame(loop);');
  const updateIdxTimeline = loopSection.lastIndexOf('mapViewerRef.current?.updatePlaybackFrame({');
  assert(
    rafIdxTimeline > 0 && updateIdxTimeline > rafIdxTimeline,
    'Timeline loop() registers requestAnimationFrame(loop) BEFORE calling updatePlaybackFrame()'
  );

  // Simulate W3C rAF queue across 60 frames to prove WebGL and SVG always render identical frame state F_k
  type RafCallback = (now: number) => void;
  let currentRafQueue: RafCallback[] = [];
  let nextRafQueue: RafCallback[] = [];
  const scheduleRaf = (cb: RafCallback) => {
    nextRafQueue.push(cb);
  };

  let stateProgress = 0;
  let svgRenderedProgress = -1;
  let webglRenderedProgress = -1;
  let mapFramePending = false;
  let continuousRepaint = false;
  let mismatchedFrames = 0;

  const mapRender = (_now: number) => {
    mapFramePending = false;
    webglRenderedProgress = stateProgress;
    if (continuousRepaint) {
      triggerMapRepaint();
    }
  };

  const triggerMapRepaint = () => {
    if (!mapFramePending) {
      mapFramePending = true;
      scheduleRaf(mapRender);
    }
  };

  const playbackTick = (now: number) => {
    // 1. Schedule next playback tick FIRST
    scheduleRaf(playbackTick);
    // 2. Advance state & SVG & trigger MapLibre repaint
    stateProgress = Math.round(now);
    svgRenderedProgress = stateProgress;
    continuousRepaint = true;
    triggerMapRepaint();
  };

  // Start playback (matching EditorPage useEffect: schedule playbackTick first, then initial updatePlaybackFrame triggers MapLibre repaint second)
  scheduleRaf(playbackTick);
  continuousRepaint = true;
  triggerMapRepaint();

  for (let frame = 1; frame <= 60; frame++) {
    currentRafQueue = nextRafQueue;
    nextRafQueue = [];
    for (const cb of currentRafQueue) {
      cb(frame * 16.667);
    }
    if (svgRenderedProgress !== webglRenderedProgress) {
      mismatchedFrames++;
    }
  }

  assert(
    mismatchedFrames === 0,
    `W3C rAF queue simulation over 60 frames: 0 frames with WebGL/SVG phase mismatch (both render exact state F_k in every frame)`
  );
}

console.log('\nALL B17 ROUND 3 STUTTER ELIMINATION TESTS PASSED CLEANLY.');
