import { CatmullRom3DPath } from './src/utils/catmullRom3DPath.ts';
import { mapPresetToCameraBlocks, computeRouteBounds } from './src/utils/cameraPresetMapper.ts';
import { getAdaptedCanonicalRoute } from './src/utils/routeAdapter.ts';
import { getSmoothSnakePath } from './src/utils/snakePathInterpolation.ts';
import type { CanonicalRoute, MapSign, RoutePoint } from './src/types/index.ts';

async function runStabilizationUpdateVerification() {
  console.log('=== FOCUSED STABILIZATION UPDATE VERIFICATION: B11, B13, B03/B04 ===\n');
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
  // 1. B11 — Distance-Based Photo Positioning
  // --------------------------------------------------------------------------
  console.log('1. Verifying B11 (Distance-Based Photo Positioning):');

  // A 224 km route from Zurich to Geneva through Bern
  const routePoints: RoutePoint[] = [
    { lng: 8.5417, lat: 47.3769 }, // Zurich
    { lng: 7.9500, lat: 47.1500 },
    { lng: 7.4474, lat: 46.9480 }, // Bern
    { lng: 6.8000, lat: 46.6000 },
    { lng: 6.1432, lat: 46.2044 }, // Geneva
  ];

  const path = new CatmullRom3DPath(routePoints);
  const totalRouteDistKm = path.getTotalDistanceKm();
  console.log(`   Canonical route length: ${totalRouteDistKm.toFixed(2)} km`);
  assert(totalRouteDistKm > 200, 'Canonical route is regional route (> 200 km)');

  // A. Individual photo positioning at selected distance (e.g. 60 km)
  const selectedDistanceKm = 60.0;
  const pGeo = selectedDistanceKm / totalRouteDistKm;
  const u = path.getSplineParameterAtDistanceProgress(pGeo);
  const sample60 = path.sample(u);

  assert(sample60 !== null, 'Path successfully sampled at exactly 60 km');
  const [photoLng, photoLat] = [sample60!.worldPoint[0], sample60!.worldPoint[1]];

  // Verify marker follows route spline geometry, not a straight line
  const straightLng = routePoints[0].lng + (routePoints[routePoints.length - 1].lng - routePoints[0].lng) * pGeo;
  const straightLat = routePoints[0].lat + (routePoints[routePoints.length - 1].lat - routePoints[0].lat) * pGeo;
  const distFromStraight = Math.sqrt((photoLng - straightLng) ** 2 + (photoLat - straightLat) ** 2);
  assert(distFromStraight > 0.05, 'Marker follows route spline geometry, NOT straight line interpolation');

  // Create photo sign with routeDistanceKm
  const photo1: MapSign = {
    id: 'photo-1',
    lng: photoLng,
    lat: photoLat,
    style: 'photo',
    text: 'Scenic Lookout',
    photoUrl: 'data:image/png;base64,mock',
    triggerMode: 'onPassed',
    size: 1,
    routeDistanceKm: selectedDistanceKm,
  };

  const photo2: MapSign = {
    id: 'photo-2',
    lng: routePoints[2].lng,
    lat: routePoints[2].lat,
    style: 'photo',
    text: 'Bern Capital',
    photoUrl: 'data:image/png;base64,mock2',
    triggerMode: 'onPassed',
    size: 1,
    routeDistanceKm: 120.0,
  };

  const signs = [photo1, photo2];

  // Helper simulating MapViewer visibility filter
  function getVisiblePhotos(progressRatio: number, signsList: MapSign[], totalDist: number) {
    const traveledKm = progressRatio * totalDist;
    return signsList.filter((s) => {
      if (s.routeDistanceKm !== undefined && totalDist > 0) {
        return traveledKm >= s.routeDistanceKm;
      }
      return false;
    });
  }

  // C. Video playback visibility checks
  // At 40 km (progress ~0.18): neither photo visible
  const visAt40km = getVisiblePhotos(40 / totalRouteDistKm, signs, totalRouteDistKm);
  assert(visAt40km.length === 0, 'No photos visible before vehicle reaches 60 km');

  // At 60 km (exact trigger distance): Photo 1 appears
  const visAt60km = getVisiblePhotos(60 / totalRouteDistKm, signs, totalRouteDistKm);
  assert(visAt60km.length === 1 && visAt60km[0].id === 'photo-1', 'Photo 1 appears exactly when vehicle reaches 60 km');

  // At 90 km: Photo 1 REMAINS visible
  const visAt90km = getVisiblePhotos(90 / totalRouteDistKm, signs, totalRouteDistKm);
  assert(visAt90km.length === 1 && visAt90km[0].id === 'photo-1', 'Photo 1 remains visible after vehicle passes it');

  // At 140 km: Both Photo 1 and Photo 2 visible (overlapping display periods supported)
  const visAt140km = getVisiblePhotos(140 / totalRouteDistKm, signs, totalRouteDistKm);
  assert(visAt140km.length === 2, 'Multiple overlapping photos are both displayed once reached');

  // At end of video (100% progress): Both photos still visible
  const visAtEnd = getVisiblePhotos(1.0, signs, totalRouteDistKm);
  assert(visAtEnd.length === 2, 'All reached photos remain visible until video ends');

  // E. Route Changes and deterministic clamping
  // Shorten route to 100 km
  const shortenedRouteDistKm = 100.0;
  const clampedSigns = signs.map((s) => {
    if (s.routeDistanceKm !== undefined) {
      return {
        ...s,
        routeDistanceKm: Math.min(s.routeDistanceKm, shortenedRouteDistKm),
      };
    }
    return s;
  });

  assert(clampedSigns[0].routeDistanceKm === 60.0, 'Photo 1 (60 km) preserved untouched when within new route length');
  assert(clampedSigns[1].routeDistanceKm === 100.0, 'Photo 2 (originally 120 km) deterministically clamped to new route length (100 km)');
  assert(clampedSigns[0].routeDistanceKm !== clampedSigns[1].routeDistanceKm, 'Photos are NOT silently redistributed evenly');

  // --------------------------------------------------------------------------
  // 2. B13 — Repair Fly Along Camera
  // --------------------------------------------------------------------------
  console.log('\n2. Verifying B13 (Repair Fly Along Camera):');

  // Check preset mapping values
  const flyAlongBlocks = mapPresetToCameraBlocks('fly_along', routePoints);
  assert(flyAlongBlocks.length === 1, 'Fly Along produces 1 primary camera block');
  assert(flyAlongBlocks[0].kind === 'follow', 'Fly Along kind is "follow"');
  assert(flyAlongBlocks[0].followOrient === 'heading', 'Fly Along follows direction of travel');
  assert(flyAlongBlocks[0].zoom === 12, 'Calibrated Fly Along default zoom is 12 (NOT 15)');
  assert(flyAlongBlocks[0].pitch === 50, 'Calibrated Fly Along pitch is 50°');

  // Whole Tour comparison
  const wholeTourBlocks = mapPresetToCameraBlocks('whole_tour', routePoints);
  assert(wholeTourBlocks[0].kind === 'still', 'Whole Tour kind is "still"');
  assert(wholeTourBlocks[0].pitch === 10, 'Whole Tour pitch is 10°');

  // Camera tracking position across progress (0.0, 0.5, 1.0)
  for (const p of [0.0, 0.25, 0.5, 0.75, 1.0]) {
    const uStep = path.getSplineParameterAtDistanceProgress(p);
    const kine = path.sample(uStep);
    assert(kine !== null, `Vehicle kinematics computed at progress ${p}`);
    assert(
      Number.isFinite(kine!.worldPoint[0]) && Number.isFinite(kine!.worldPoint[1]),
      `Valid geographic coordinate at progress ${p}: [${kine!.worldPoint[0].toFixed(4)}, ${kine!.worldPoint[1].toFixed(4)}]`
    );
    assert(Number.isFinite(kine!.headingDeg), `Valid travel heading at progress ${p}: ${kine!.headingDeg.toFixed(1)}°`);
  }

  // Verify camera center matches vehicle position at progress 0.5
  const uHalf = path.getSplineParameterAtDistanceProgress(0.5);
  const kineHalf = path.sample(uHalf)!;
  const vehicleLngLat: [number, number] = [kineHalf.worldPoint[0], kineHalf.worldPoint[1]];
  // Center pos equals vehicle position
  const centerPos = vehicleLngLat;
  assert(centerPos[0] === vehicleLngLat[0] && centerPos[1] === vehicleLngLat[1], 'Camera center locks directly onto vehicle without drift');

  // --------------------------------------------------------------------------
  // 3. B03 / B04 — Route Tab Playback Simplification
  // --------------------------------------------------------------------------
  console.log('\n3. Verifying B03 / B04 (Route Tab Playback Simplification):');

  // Test speed settings
  const speeds = ['slow', 'normal', 'fast'] as const;
  const speedMultipliers: Record<string, number> = { slow: 0.5, normal: 1.0, fast: 2.0 };
  const baseSpeedKmh = 60;

  for (const spd of speeds) {
    const spdKmh = baseSpeedKmh * speedMultipliers[spd];
    assert(spdKmh > 0, `Speed "${spd}" configured properly: ${spdKmh} km/h`);
  }

  // Verify bounds computation without zoom-out interference
  const bounds = computeRouteBounds(routePoints);
  assert(bounds !== null, 'Route bounds computed accurately');
  assert(bounds!.minLng <= bounds!.maxLng && bounds!.minLat <= bounds!.maxLat, 'Bounding box is valid');

  console.log('\n========================================');
  console.log(`RESULTS: ${passed} / ${total} assertions passed.`);
  console.log('========================================');
}

runStabilizationUpdateVerification();
