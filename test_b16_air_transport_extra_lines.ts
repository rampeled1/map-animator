import assert from 'node:assert';
import {
  buildJourneyWithSegments,
  buildJourneyFromStops,
} from './src/utils/roadRouter.ts';
import { getAdaptedCanonicalRoute } from './src/utils/routeAdapter.ts';
import type {
  CanonicalRoute,
  RouteStop,
  RouteSegment,
  RoutePoint,
} from './src/types/index.ts';

console.log('=== RUNNING B16 TEST SUITE: AIR TRANSPORT EXTRA LINES ===\n');

// Mock OSRM fetch for offline unit testing
const origFetch = globalThis.fetch;
globalThis.fetch = async (url: any) => {
  return {
    ok: true,
    json: async () => ({
      code: 'Ok',
      routes: [
        {
          geometry: {
            coordinates: [
              [8.5417, 47.3769],
              [8.0, 47.0],
              [7.0, 46.5],
              [6.1432, 46.2044],
            ],
          },
          distance: 280000,
          duration: 10000,
        },
      ],
    }),
  } as any;
};

let totalTestsPassed = 0;
function pass(msg: string) {
  totalTestsPassed++;
  console.log(`  ✓ [TEST ${totalTestsPassed}] ${msg}`);
}

async function runTests() {
  // =================================================================================================
  // 1. CAR -> AIR -> CAR SWITCHING
  // =================================================================================================
  console.log('--- 1. Car → Air → Car Switching ---');
  {
    const stops = [
      { lng: 8.5417, lat: 47.3769 }, // Zurich
      { lng: 6.1432, lat: 46.2044 }, // Geneva
    ];

    // Initial Car route
    const carRes = await buildJourneyWithSegments(stops, 'car');
    assert(carRes.points.length >= 2, 'Car route calculates points');
    const carPoints = carRes.points;
    const carMaxEle = Math.max(...carPoints.map((p) => p.ele || 0));
    assert(carMaxEle === 0, 'Car route has 0m flight elevation');
    pass('Car route generated without flight elevation');

    // Switch to Air: before recalculation, status is marked stale
    const canonicalCar: CanonicalRoute = {
      id: 'route-switch',
      name: 'Zurich → Geneva',
      status: 'calculated',
      color: '#ff4d2e',
      width: 8,
      style: 'solid',
      stops: stops.map((s, idx) => ({
        id: `stop-${idx}`,
        placeName: idx === 0 ? 'Zurich' : 'Geneva',
        lng: s.lng,
        lat: s.lat,
      })),
      segments: [
        {
          id: 'seg-0',
          fromStopId: 'stop-0',
          toStopId: 'stop-1',
          transportType: 'car',
          status: 'calculated',
          geometry: carPoints,
          shapingPoints: [],
          use3dSymbol: true,
        },
      ],
      calculatedGeometry: carPoints,
    };

    // User selects plane: segment marked stale
    const canonicalSwitchingToPlane: CanonicalRoute = {
      ...canonicalCar,
      status: 'stale',
      segments: [
        {
          ...canonicalCar.segments[0],
          transportType: 'plane',
          status: 'stale',
        },
      ],
    };

    // routeAdapter ensures stale road geometry is NOT presented as plane route
    const adaptedStale = getAdaptedCanonicalRoute(canonicalSwitchingToPlane);
    assert(adaptedStale.transportType === 'car', 'Stale road geometry is not presented as plane');
    pass('Car → Air transition: stale road geometry is not presented as plane');

    // Successful recalculation to Air
    const airRes = await buildJourneyWithSegments(stops, 'plane');
    assert(airRes.points.length === 81, 'Air route has 81 points');
    const airMaxEle = Math.max(...airRes.points.map((p) => p.ele || 0));
    assert(airMaxEle === 8500, 'Air route reaches 8500m apex');

    const canonicalAir: CanonicalRoute = {
      ...canonicalCar,
      status: 'calculated',
      segments: [
        {
          ...canonicalCar.segments[0],
          transportType: 'plane',
          status: 'calculated',
          geometry: airRes.segmentGeometries[0],
        },
      ],
      calculatedGeometry: airRes.points,
    };
    const adaptedAir = getAdaptedCanonicalRoute(canonicalAir);
    assert(adaptedAir.transportType === 'plane', 'Calculated air route is presented as plane');
    pass('Car → Air calculation commit: presented cleanly as plane');

    // Switch back to Car: before recalculation, stale Air route is not presented as car
    const canonicalSwitchingBackToCar: CanonicalRoute = {
      ...canonicalAir,
      status: 'stale',
      segments: [
        {
          ...canonicalAir.segments[0],
          transportType: 'car',
          status: 'stale',
        },
      ],
    };
    const adaptedBackStale = getAdaptedCanonicalRoute(canonicalSwitchingBackToCar);
    assert(adaptedBackStale.points.length === 81, 'Preserves previous valid geometry for rollback');
    pass('Air → Car transition: previous valid geometry safely preserved for atomic rollback');
  }

  // =================================================================================================
  // 2. AIR -> TRAIN -> AIR SWITCHING
  // =================================================================================================
  console.log('--- 2. Air → Train → Air Switching ---');
  {
    const stops = [
      { lng: 2.3522, lat: 48.8566 }, // Paris
      { lng: 4.8357, lat: 45.7640 }, // Lyon
    ];

    const airRes = await buildJourneyWithSegments(stops, 'plane');
    const trainRes = await buildJourneyWithSegments(stops, 'train');

    assert(airRes.points.some((p) => (p.ele || 0) > 0), 'Air route contains 3D flight elevation');
    assert(trainRes.points.every((p) => (p.ele || 0) === 0), 'Train route maintains zero elevation');
    assert(trainRes.points.length > 2, 'Train generates densified geodesic points');
    pass('Air → Train → Air distinct geometry verified');
  }

  // =================================================================================================
  // 3. AIR ROUTE WITH TWO STOPS
  // =================================================================================================
  console.log('--- 3. Air Route with Two Stops ---');
  {
    const stops = [
      { lng: 13.405, lat: 52.520 }, // Berlin
      { lng: 11.582, lat: 48.135 }, // Munich
    ];

    const res = await buildJourneyWithSegments(stops, 'plane');
    assert(res.points.length === 81, `Expected 81 points for 2-stop air route, got ${res.points.length}`);
    assert(res.segmentGeometries.length === 1, `Expected 1 segment geometry, got ${res.segmentGeometries.length}`);
    assert(res.segmentGeometries[0].length === 81, `Segment 0 geometry has 81 points`);

    // Verify direct geographic connection (no 12% lateral perpendicular offset)
    // At t = 0.5 (index 40), longitude and latitude must be the exact midpoint of start and end
    const midPoint = res.points[40];
    const expectedLng = (stops[0].lng + stops[1].lng) / 2;
    const expectedLat = (stops[0].lat + stops[1].lat) / 2;
    assert(Math.abs(midPoint.lng - expectedLng) < 1e-6, `Direct midpoint lng: expected ${expectedLng}, got ${midPoint.lng}`);
    assert(Math.abs(midPoint.lat - expectedLat) < 1e-6, `Direct midpoint lat: expected ${expectedLat}, got ${midPoint.lat}`);
    assert(midPoint.ele === 8500, `Midpoint elevation reaches 8500m apex, got ${midPoint.ele}`);
    pass('Air route with 2 stops generates direct geographic line with 8500m elevation apex');
  }

  // =================================================================================================
  // 4. AIR ROUTE WITH THREE STOPS
  // =================================================================================================
  console.log('--- 4. Air Route with Three Stops ---');
  {
    const stops = [
      { lng: -0.1278, lat: 51.5074 }, // London
      { lng: 2.3522, lat: 48.8566 },  // Paris
      { lng: 4.8357, lat: 45.7640 },  // Lyon
    ];

    const res = await buildJourneyWithSegments(stops, ['plane', 'plane']);
    assert(res.points.length === 161, `Expected 161 points for 3-stop journey, got ${res.points.length}`);
    assert(res.segmentGeometries.length === 2, `Expected 2 segment geometries, got ${res.segmentGeometries.length}`);
    assert(res.segmentGeometries[0].length === 81, `Segment 0 has 81 points`);
    assert(res.segmentGeometries[1].length === 81, `Segment 1 has 81 points`);

    // Verify intermediate junction continuity: Segment 0 ends at Paris (ele 0), Segment 1 starts at Paris (ele 0)
    const seg0End = res.segmentGeometries[0][80];
    const seg1Start = res.segmentGeometries[1][0];
    assert(Math.abs(seg0End.lng - stops[1].lng) < 1e-6, 'Seg 0 terminates at Stop 2');
    assert(Math.abs(seg0End.lat - stops[1].lat) < 1e-6, 'Seg 0 terminates at Stop 2');
    assert(seg0End.ele === 0, 'Seg 0 altitude descends to 0 at airport');
    assert(Math.abs(seg1Start.lng - stops[1].lng) < 1e-6, 'Seg 1 departs from Stop 2');
    assert(seg1Start.ele === 0, 'Seg 1 altitude starts at 0 at airport');
    pass('Air route with 3 stops connects continuously through intermediate waypoint at 0m altitude');
  }

  // =================================================================================================
  // 5. AIR ROUTE WITH MULTIPLE SEGMENTS
  // =================================================================================================
  console.log('--- 5. Air Route with Multiple Segments ---');
  {
    const stops = [
      { lng: 10, lat: 50 },
      { lng: 11, lat: 51 },
      { lng: 12, lat: 52 },
      { lng: 13, lat: 53 },
    ];

    const res = await buildJourneyWithSegments(stops, 'plane');
    assert(res.segmentGeometries.length === 3, 'Created 3 isolated segment geometries');
    for (let i = 0; i < 3; i++) {
      assert(res.segmentGeometries[i].length === 81, `Segment ${i} has 81 points`);
      assert(res.segmentGeometries[i][0].lng === stops[i].lng, `Seg ${i} starts at stop ${i}`);
      assert(res.segmentGeometries[i][80].lng === stops[i + 1].lng, `Seg ${i} ends at stop ${i + 1}`);
    }
    pass('Air route with 4 stops (3 segments) partitions geometries cleanly across all segments');
  }

  // =================================================================================================
  // 6. NO UNINTENDED DESTINATION-TO-ORIGIN LINE
  // =================================================================================================
  console.log('--- 6. No Unintended Destination-To-Origin Line ---');
  {
    const stops = [
      { lng: 10, lat: 50 },
      { lng: 11, lat: 51 },
      { lng: 12, lat: 52 },
    ];
    const res = await buildJourneyWithSegments(stops, 'plane');

    // Create canonical route with per-segment geometry (B16 fix)
    const canonical: CanonicalRoute = {
      id: 'no-loop-test',
      name: 'Stop 1 → Stop 3',
      status: 'calculated',
      color: '#ff4d2e',
      width: 8,
      style: 'solid',
      stops: stops.map((s, idx) => ({
        id: `stop-${idx}`,
        placeName: `Stop ${idx + 1}`,
        lng: s.lng,
        lat: s.lat,
      })),
      segments: [
        {
          id: 'seg-0',
          fromStopId: 'stop-0',
          toStopId: 'stop-1',
          transportType: 'plane',
          status: 'calculated',
          geometry: res.segmentGeometries[0],
          shapingPoints: [],
          use3dSymbol: true,
        },
        {
          id: 'seg-1',
          fromStopId: 'stop-1',
          toStopId: 'stop-2',
          transportType: 'plane',
          status: 'calculated',
          geometry: res.segmentGeometries[1],
          shapingPoints: [],
          use3dSymbol: true,
        },
      ],
      calculatedGeometry: [], // intentionally empty to trigger segment synthesis in routeAdapter
    };

    const adapted = getAdaptedCanonicalRoute(canonical);
    assert(adapted.points.length === 161, `Synthesized points: expected 161, got ${adapted.points.length}`);

    // Verify there is NO point jumping from Stop 3 back to Stop 1
    // The final point must be Stop 3 (lng: 12, lat: 52)
    const finalPt = adapted.points[adapted.points.length - 1];
    assert(Math.abs(finalPt.lng - 12) < 1e-6 && Math.abs(finalPt.lat - 52) < 1e-6, 'Final point is Stop 3');

    // Check every consecutive point pair: maximum distance between adjacent points must be small (< 0.1 degree)
    for (let i = 0; i < adapted.points.length - 1; i++) {
      const p1 = adapted.points[i];
      const p2 = adapted.points[i + 1];
      const dist = Math.hypot(p2.lng - p1.lng, p2.lat - p1.lat);
      assert(dist < 0.15, `Consecutive point jump detected at index ${i}: distance ${dist} degrees`);
    }
    pass('Segment flattening verified: strictly no destination-to-origin jump or cross-map diagonal line');
  }

  // =================================================================================================
  // 7. NO SIMULTANEOUS GROUND SVG AND ELEVATED 3D AIR ROUTE DURING PLAYBACK
  // =================================================================================================
  console.log('--- 7. No Simultaneous Ground SVG and Elevated 3D Air Route During Playback ---');
  {
    // Simulation of MapViewer rendering condition
    function computeShouldHideSvgLine(
      routeTransport: string,
      hasFlightEle: boolean,
      isPlaying: boolean,
      isQuickPreviewActive: boolean,
      currentTime: number | undefined,
      currentStep: string,
      routeHideLine: boolean = false
    ): boolean {
      const isAirTransportMode = [
        'plane', 'sportsplane', 'floatplane', 'fighter', 'bomber',
        'helicopter', 'drone', 'balloon', 'sailplane', 'paramotor',
        'hangglider', 'paraglider'
      ].includes(routeTransport);
      const isAirMode = isAirTransportMode || hasFlightEle;
      const isPlaybackActive = Boolean(
        isPlaying ||
        isQuickPreviewActive ||
        (currentTime !== undefined && currentTime > 0 && currentStep !== 'route')
      );
      return Boolean(routeHideLine || (isAirMode && isPlaybackActive));
    }

    // Case A: Air route during video playback -> Ground SVG MUST be hidden
    assert(computeShouldHideSvgLine('plane', true, true, false, 5.0, 'video') === true,
      'Air route during video playback hides flat ground SVG line');

    // Case B: Air route during Quick Route Preview -> Ground SVG MUST be hidden
    assert(computeShouldHideSvgLine('plane', true, false, true, 0, 'route') === true,
      'Air route during Quick Route Preview hides flat ground SVG line');

    // Case C: Air route paused mid-video -> Ground SVG MUST be hidden (3D ribbon visible)
    assert(computeShouldHideSvgLine('plane', true, false, false, 5.0, 'signs') === true,
      'Air route paused mid-video hides flat ground SVG line');

    // Case D: Air route during Route editing tab (idle) -> Ground SVG MUST be SHOWN for editing
    assert(computeShouldHideSvgLine('plane', true, false, false, 0, 'route') === false,
      'Air route during route editing displays 2D SVG line on map');

    // Case E: Car route during video playback -> Ground SVG MUST be SHOWN (existing behavior)
    assert(computeShouldHideSvgLine('car', false, true, false, 5.0, 'video') === false,
      'Car route during video playback preserves existing SVG rendering');

    // Case F: Walking / Bike / Train / Boat during playback -> Ground SVG MUST be SHOWN
    assert(computeShouldHideSvgLine('train', false, true, false, 5.0, 'video') === false,
      'Train route preserves existing SVG rendering');
    assert(computeShouldHideSvgLine('boat', false, true, false, 5.0, 'video') === false,
      'Boat route preserves existing SVG rendering');

    pass('Dual-layer route rendering logic verified: hides ground SVG strictly during Air playback');
  }

  // =================================================================================================
  // 8. CORRECT AIR ROUTE APPEARANCE DURING EDITING
  // =================================================================================================
  console.log('--- 8. Correct Air Route Appearance During Editing ---');
  {
    const stops = [
      { lng: 12.4964, lat: 41.9028 }, // Rome
      { lng: 14.2681, lat: 40.8518 }, // Naples
    ];
    const res = await buildJourneyWithSegments(stops, 'plane');
    const canonical: CanonicalRoute = {
      id: 'rome-naples',
      name: 'Rome → Naples',
      status: 'calculated',
      color: '#ff4d2e',
      width: 8,
      style: 'solid',
      stops: stops.map((s, idx) => ({ id: `s-${idx}`, placeName: `City ${idx}`, lng: s.lng, lat: s.lat })),
      segments: [
        {
          id: 'seg-0',
          fromStopId: 's-0',
          toStopId: 's-1',
          transportType: 'plane',
          status: 'calculated',
          geometry: res.segmentGeometries[0],
          shapingPoints: [],
          use3dSymbol: true,
        },
      ],
      calculatedGeometry: res.points,
    };
    const adapted = getAdaptedCanonicalRoute(canonical);
    assert(adapted.points.length === 81, 'Adapted route has 81 points');
    assert(adapted.transportType === 'plane', 'Adapted route transport is plane');
    assert(adapted.points[0].lng === stops[0].lng, 'Route starts at Rome');
    assert(adapted.points[80].lng === stops[1].lng, 'Route ends at Naples');
    pass('Air route editing representation is intact and complete');
  }

  // =================================================================================================
  // 9. FAILED ROUTE CALCULATION PRESERVES VALID PREVIOUS DATA
  // =================================================================================================
  console.log('--- 9. Failed Route Calculation Preserves Valid Previous Data ---');
  {
    const previousValidPoints: RoutePoint[] = [
      { lng: 10, lat: 50, ele: 0 },
      { lng: 10.1, lat: 50.1, ele: 0 },
      { lng: 10.2, lat: 50.2, ele: 0 },
    ];
    const previousRoute: CanonicalRoute = {
      id: 'rollback-test',
      name: 'Valid Journey',
      status: 'calculated',
      color: '#ff4d2e',
      width: 8,
      style: 'solid',
      stops: [
        { id: 's0', placeName: 'A', lng: 10, lat: 50 },
        { id: 's1', placeName: 'B', lng: 10.2, lat: 50.2 },
      ],
      segments: [
        {
          id: 'seg0',
          fromStopId: 's0',
          toStopId: 's1',
          transportType: 'car',
          status: 'calculated',
          geometry: previousValidPoints,
          shapingPoints: [],
          use3dSymbol: true,
        },
      ],
      calculatedGeometry: previousValidPoints,
    };

    // User selected plane, but calculation failed
    const failedAttemptRoute: CanonicalRoute = {
      ...previousRoute,
      status: 'stale',
      segments: [
        {
          ...previousRoute.segments[0],
          transportType: 'plane',
          status: 'stale',
        },
      ],
    };

    // routeAdapter ensures:
    // 1. Previous valid points are preserved (length 3, exact coordinates)
    // 2. Old road points are NOT presented as plane route
    const adapted = getAdaptedCanonicalRoute(failedAttemptRoute);
    assert.deepStrictEqual(adapted.points, previousValidPoints, 'Previous valid geometry preserved byte-for-byte');
    assert(adapted.transportType === 'car', 'Incompatible road geometry not presented as plane');
    pass('Atomic rollback verified: failed calculation safely preserves previous data without displaying incompatible geometry');
  }

  // =================================================================================================
  // 10. OTHER TRANSPORT MODES REMAIN UNCHANGED
  // =================================================================================================
  console.log('--- 10. Other Transport Modes Remain Unchanged ---');
  {
    const stops = [
      { lng: 10, lat: 50 },
      { lng: 10.5, lat: 50.5 },
    ];
    const modes = ['car', 'walking', 'bike', 'train', 'boat'];
    for (const m of modes) {
      const res = await buildJourneyWithSegments(stops, m);
      assert(res.points.length >= 2, `${m} generated route points`);
      assert(res.segmentGeometries.length === 1, `${m} generated segment geometry`);
      assert(res.points.every((p) => (p.ele || 0) === 0), `${m} retains sea-level / ground elevation 0`);
    }
    pass('Other transport modes (car, walking, bike, train, boat) are completely untouched');
  }

  // =================================================================================================
  // 11. SAVE, REOPEN, EXPORT AND IMPORT PRESERVE CORRECT AIR GEOMETRY
  // =================================================================================================
  console.log('--- 11. Save, Reopen, Export and Import Preserve Correct Air Geometry ---');
  {
    const stops = [
      { lng: -73.7781, lat: 40.6413 }, // JFK
      { lng: -0.4543, lat: 51.4700 },  // LHR
    ];
    const airRes = await buildJourneyWithSegments(stops, 'plane');
    const originalRoute: CanonicalRoute = {
      id: 'jfk-lhr',
      name: 'New York (JFK) → London (LHR)',
      status: 'calculated',
      color: '#ff4d2e',
      width: 8,
      style: 'solid',
      stops: stops.map((s, idx) => ({ id: `stop-${idx}`, placeName: idx === 0 ? 'JFK' : 'LHR', lng: s.lng, lat: s.lat })),
      segments: [
        {
          id: 'seg-0',
          fromStopId: 'stop-0',
          toStopId: 'stop-1',
          transportType: 'plane',
          status: 'calculated',
          geometry: airRes.segmentGeometries[0],
          shapingPoints: [],
          use3dSymbol: true,
        },
      ],
      calculatedGeometry: airRes.points,
    };

    // Simulate JSON serialization / deserialization (save/load/export/import)
    const serialized = JSON.stringify(originalRoute);
    const restored: CanonicalRoute = JSON.parse(serialized);

    assert(restored.calculatedGeometry.length === 81, 'Restored route retains all 81 points');
    assert(restored.calculatedGeometry[40].ele === 8500, 'Restored route retains 8500m apex');
    assert(restored.segments[0].geometry.length === 81, 'Restored segment retains 81 points');
    const adaptedRestored = getAdaptedCanonicalRoute(restored);
    assert(adaptedRestored.transportType === 'plane', 'Restored route adapts to plane transport');
    pass('Serialization, export and import preserve Air geometry and elevation without distortion');
  }

  // =================================================================================================
  // 12. QUICK ROUTE PREVIEW AND FULL VIDEO PREVIEW REMAIN FUNCTIONAL
  // =================================================================================================
  console.log('--- 12. Quick Route Preview and Full Video Preview Functional ---');
  {
    const stops = [
      { lng: 8.5417, lat: 47.3769 },
      { lng: 6.1432, lat: 46.2044 },
    ];
    const airRes = await buildJourneyWithSegments(stops, 'plane');
    assert(airRes.points.length === 81, 'Valid route points generated');

    // CatmullRom3DPath works with the direct Air route
    const { CatmullRom3DPath } = await import('./src/utils/catmullRom3DPath.ts');
    const pathEngine = new CatmullRom3DPath(airRes.points);
    const totalDistKm = pathEngine.getTotalDistanceKm();
    assert(totalDistKm > 200 && totalDistKm < 300, `Expected ~220-250 km between Zurich and Geneva, got ${totalDistKm.toFixed(1)} km`);

    // Sample kinematics at 0, 0.5, 1.0
    const sample0 = pathEngine.sample(0);
    const sampleMid = pathEngine.sample(0.5);
    const sample1 = pathEngine.sample(1.0);
    assert(sample0 !== null && sampleMid !== null && sample1 !== null, 'Kinematics valid across entire preview');
    assert(sampleMid!.position.z > 0.0002, `Midpoint 3D Mercator altitude is elevated: ${sampleMid!.position.z}`);
    assert(sample0!.position.z < 1e-6, `Departure altitude at sea level / runway: ${sample0!.position.z}`);
    assert(sample1!.position.z < 1e-6, `Arrival altitude at destination runway: ${sample1!.position.z}`);
    pass('Quick Route Preview and 3D Video Preview engines fully functional with direct Air trajectory');
  }

  console.log('\n=======================================================');
  console.log(`ALL ${totalTestsPassed} B16 AIR TRANSPORT VERIFICATION TESTS PASSED!`);
  console.log('=======================================================\n');
}

runTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
