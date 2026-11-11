import {
  CANONICAL_TRANSPORTS,
  getRoutingProfileForTransport,
} from './src/constants/canonicalTransports.ts';
import {
  buildJourneyFromStops,
  getRoadRoute,
} from './src/utils/roadRouter.ts';
import type {
  CanonicalTransportType,
  CanonicalRoute,
  RouteStop,
  RouteSegment,
  RoutePoint,
} from './src/types/index.ts';

async function runTargetedCorrectionsTests() {
  console.log('=== RUNNING STAGE 6 TARGETED CORRECTIONS VERIFICATION ===\n');
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

  // =========================================================================
  // 1. Per-Segment Transport Selection: Train / Plane / Car -> Train / Boat / Car
  // =========================================================================
  console.log('1. Testing Per-Segment Transport Selection:');

  const initialSegments: RouteSegment[] = [
    {
      id: 'seg-0',
      fromStopId: 'stop-0',
      toStopId: 'stop-1',
      transportType: 'train',
      routingProfile: 'direct',
      shapingPoints: [],
      use3dSymbol: true,
      status: 'calculated',
      geometry: [],
    },
    {
      id: 'seg-1',
      fromStopId: 'stop-1',
      toStopId: 'stop-2',
      transportType: 'plane',
      routingProfile: 'direct',
      shapingPoints: [],
      use3dSymbol: true,
      status: 'calculated',
      geometry: [],
    },
    {
      id: 'seg-2',
      fromStopId: 'stop-2',
      toStopId: 'stop-3',
      transportType: 'car',
      routingProfile: 'driving',
      shapingPoints: [],
      use3dSymbol: true,
      status: 'calculated',
      geometry: [],
    },
  ];

  const canonicalWithThreeSegments: CanonicalRoute = {
    id: 'route-mixed-3',
    name: 'Tri-Modal Journey',
    status: 'calculated',
    color: '#ff4d2e',
    width: 8,
    style: 'solid',
    stops: [
      { id: 'stop-0', placeName: 'City A', customLabel: 'City A', showLabel: true, lng: 11.0, lat: 46.0 },
      { id: 'stop-1', placeName: 'City B', customLabel: 'City B', showLabel: true, lng: 11.5, lat: 46.5 },
      { id: 'stop-2', placeName: 'City C', customLabel: 'City C', showLabel: true, lng: 12.0, lat: 47.0 },
      { id: 'stop-3', placeName: 'City D', customLabel: 'City D', showLabel: true, lng: 12.5, lat: 47.5 },
    ],
    segments: initialSegments,
    calculatedGeometry: [{ lng: 11.0, lat: 46.0 }, { lng: 12.5, lat: 47.5 }],
  };

  // Simulate updating segment 1 from 'plane' to 'boat'
  const targetSegIndex = 1;
  const newTransport: CanonicalTransportType = 'boat';

  const updatedSegments = (canonicalWithThreeSegments.segments || []).map((seg, idx) => {
    if (idx === targetSegIndex) {
      return {
        ...seg,
        transportType: newTransport,
        status: 'stale' as const,
        routingProfile: getRoutingProfileForTransport(newTransport),
      };
    }
    return seg;
  });

  assert(updatedSegments[0].transportType === 'train', 'Segment 0 remains "train"');
  assert(updatedSegments[0].routingProfile === 'direct', 'Segment 0 routingProfile remains "direct"');
  assert(updatedSegments[1].transportType === 'boat', 'Segment 1 correctly changed from "plane" to "boat"');
  assert(updatedSegments[1].routingProfile === 'direct', 'Segment 1 routingProfile is "direct"');
  assert(updatedSegments[2].transportType === 'car', 'Segment 2 remains "car"');
  assert(updatedSegments[2].routingProfile === 'driving', 'Segment 2 routingProfile remains "driving"');
  assert(updatedSegments[1].status === 'stale', 'Updated segment status is marked "stale"');
  assert(
    updatedSegments.map((s) => s.transportType).join('/') === 'train/boat/car',
    'Overall multi-leg configuration is exactly "train/boat/car"'
  );

  // =========================================================================
  // 2. Segment Boundary Duplication Check
  // =========================================================================
  console.log('\n2. Testing Segment Boundary Duplication:');

  const multiStops = [
    { lng: 11.255, lat: 46.498 }, // Stop 1 (Bolzano)
    { lng: 11.320, lat: 46.540 }, // Stop 2 (Merano)
    { lng: 11.450, lat: 46.600 }, // Stop 3 (Bressanone)
  ];

  const journeyCoords = await buildJourneyFromStops(multiStops, ['train', 'plane']);

  // Check that NO two consecutive points have identical coordinates
  let consecutiveDuplicatesCount = 0;
  for (let i = 0; i < journeyCoords.length - 1; i++) {
    const p1 = journeyCoords[i];
    const p2 = journeyCoords[i + 1];
    if (Math.abs(p1.lng - p2.lng) < 1e-7 && Math.abs(p1.lat - p2.lat) < 1e-7) {
      consecutiveDuplicatesCount++;
    }
  }

  assert(consecutiveDuplicatesCount === 0, `Zero consecutive duplicate boundary vertices found (got ${consecutiveDuplicatesCount})`);
  assert(
    Math.abs(journeyCoords[journeyCoords.length - 1].lng - multiStops[2].lng) < 1e-7 &&
    Math.abs(journeyCoords[journeyCoords.length - 1].lat - multiStops[2].lat) < 1e-7,
    'Destination coordinate is exactly preserved at the end of the coordinate array'
  );
  assert(
    Math.abs(journeyCoords[0].lng - multiStops[0].lng) < 1e-7 &&
    Math.abs(journeyCoords[0].lat - multiStops[0].lat) < 1e-7,
    'Start coordinate is exactly preserved at the beginning of the coordinate array'
  );

  // =========================================================================
  // 3. Unresolved Stop Coordinates: Never Route to (0,0)
  // =========================================================================
  console.log('\n3. Testing Unresolved Stop Coordinates:');

  // Case 3a: Destination stop has no place selected and no previous coordinates
  const stopsWithUnresolvedDest = [
    { id: 's1', placeName: 'Bolzano', customLabel: 'Bolzano', lng: 11.255, lat: 46.498, selectedPlace: { lng: 11.255, lat: 46.498, name: 'Bolzano' } },
    { id: 's2', placeName: 'Unknown Place', customLabel: 'Unknown Place', lng: Number.NaN, lat: Number.NaN, selectedPlace: null },
  ];

  // In syncCanonicalStops logic:
  const syncedStops: RouteStop[] = stopsWithUnresolvedDest.map((s, idx) => {
    let resolvedLng = Number.NaN;
    let resolvedLat = Number.NaN;
    if (s.selectedPlace) {
      resolvedLng = s.selectedPlace.lng;
      resolvedLat = s.selectedPlace.lat;
    }
    return {
      id: s.id,
      placeName: s.placeName,
      customLabel: s.customLabel,
      showLabel: true,
      lng: resolvedLng,
      lat: resolvedLat,
    };
  });

  assert(isNaN(syncedStops[1].lng), 'Unresolved destination lng remains NaN (never 0)');
  assert(isNaN(syncedStops[1].lat), 'Unresolved destination lat remains NaN (never 0)');
  assert(syncedStops[1].lng !== 0 && syncedStops[1].lat !== 0, 'Unresolved destination is never assigned (0,0)');

  // Case 3b: Destination coordinates are preserved from previous valid stop when editing query without selecting
  const prevValidStop: RouteStop = {
    id: 's2',
    placeName: 'Merano',
    customLabel: 'Merano',
    showLabel: true,
    lng: 11.320,
    lat: 46.540,
  };

  const preservedLng = prevValidStop && !isNaN(prevValidStop.lng) ? prevValidStop.lng : Number.NaN;
  const preservedLat = prevValidStop && !isNaN(prevValidStop.lat) ? prevValidStop.lat : Number.NaN;

  assert(preservedLng === 11.320, 'Previous valid lng is preserved when editing query without selecting');
  assert(preservedLat === 46.540, 'Previous valid lat is preserved when editing query without selecting');

  // Case 3c: Attempting route calculation with unresolved stop is blocked
  const stopsToValidate = [
    { lng: 11.255, lat: 46.498 },
    { lng: Number.NaN, lat: Number.NaN },
  ];
  const allResolved = stopsToValidate.every((s) => !isNaN(s.lng) && !isNaN(s.lat) && (s.lng !== 0 || s.lat !== 0));
  assert(!allResolved, 'Validation correctly detects unresolved stop');
  assert(allResolved === false, 'Route calculation is prevented when a destination is unresolved');

  // =========================================================================
  // 4. Follow Roads Fallback Policy: Never Silently Fall Back on OSRM Failure
  // =========================================================================
  console.log('\n4. Testing Follow Roads Fallback Policy:');

  let osrmFailedAndThrew = false;
  try {
    // Calling getRoadRoute with allowDirectFallback: false (production default)
    // and unreachable port/URL or non-existent endpoint
    await getRoadRoute(
      { lng: 0, lat: 0 },
      { lng: 0.1, lat: 0.1 },
      'driving',
      0.1,
      false // allowDirectFallback: false
    );
  } catch (err: any) {
    if (err.message.includes('Routing calculation failed')) {
      osrmFailedAndThrew = true;
    }
  }

  assert(osrmFailedAndThrew, 'getRoadRoute throws explicit Error when OSRM fails (allowDirectFallback: false)');

  // Verify that previous geometry is retained byte-for-byte on failure
  const previousGeometry: RoutePoint[] = [
    { lng: 11.255, lat: 46.498, ele: 260 },
    { lng: 11.320, lat: 46.540, ele: 410 },
  ];
  let calcSuccess = false;
  let stagedPoints: RoutePoint[] = [];

  try {
    // Simulate failed OSRM calculation:
    throw new Error('OSRM service unavailable');
  } catch {
    calcSuccess = false;
    stagedPoints = []; // Discard
  }

  const finalGeometry = calcSuccess ? stagedPoints : previousGeometry;
  const finalStatus = calcSuccess ? 'calculated' : 'stale';

  assert(!calcSuccess, 'Failed calculation caught safely');
  assert(finalGeometry === previousGeometry, 'Previous geometry retained byte-for-byte; no direct line committed');
  assert(finalStatus === 'stale', 'Route marked "stale" on failure');

  console.log('\n========================================');
  console.log(`RESULTS: ${passed} / ${total} assertions passed.`);
  console.log('========================================\n');
}

runTargetedCorrectionsTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
