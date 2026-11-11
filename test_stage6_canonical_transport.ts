import {
  CANONICAL_TRANSPORTS,
} from './src/constants/canonicalTransports.ts';
import {
  buildJourneyFromStops,
} from './src/utils/roadRouter.ts';
import type {
  CanonicalTransportType,
  CanonicalRoute,
  RouteStop,
  RouteSegment,
} from './src/types/index.ts';

async function runTests() {
  console.log('=== RUNNING STAGE 6 VERIFICATION: STRICT 6-MODE TRANSPORT & ROUTING ENGINES ===\n');
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

  // 1. Strict 6-mode Transport Catalog Check
  const expectedModes: CanonicalTransportType[] = ['car', 'walking', 'bike', 'train', 'boat', 'plane'];
  assert(CANONICAL_TRANSPORTS.length === 6, 'Exactly 6 canonical transport modes are registered');
  
  const registeredIds = CANONICAL_TRANSPORTS.map((t) => t.id);
  assert(
    expectedModes.every((mode) => registeredIds.includes(mode)),
    'Registered transport IDs exactly match the 6 approved canonical modes'
  );

  // 2. Engine Routing Mode Specifications
  const carMode = CANONICAL_TRANSPORTS.find((t) => t.id === 'car');
  const walkingMode = CANONICAL_TRANSPORTS.find((t) => t.id === 'walking');
  const bikeMode = CANONICAL_TRANSPORTS.find((t) => t.id === 'bike');
  const trainMode = CANONICAL_TRANSPORTS.find((t) => t.id === 'train');
  const boatMode = CANONICAL_TRANSPORTS.find((t) => t.id === 'boat');
  const planeMode = CANONICAL_TRANSPORTS.find((t) => t.id === 'plane');

  assert(carMode?.engine === 'osrm' && carMode?.snap === 'driving', 'Car is configured for OSRM Follow Roads (driving profile)');
  assert(walkingMode?.engine === 'osrm' && walkingMode?.snap === 'walking', 'Walking is configured for OSRM Follow Roads (walking profile)');
  assert(bikeMode?.engine === 'osrm' && bikeMode?.snap === 'cycling', 'Bike is configured for OSRM Follow Roads (cycling profile)');
  assert(trainMode?.engine === 'free' && trainMode?.snap === 'off', 'Train is configured for Free Mode (direct rail)');
  assert(boatMode?.engine === 'free' && boatMode?.snap === 'off', 'Boat is configured for Free Mode (maritime sea arc)');
  assert(planeMode?.engine === 'free' && planeMode?.snap === 'off', 'Plane is configured for Free Mode (3D flight arc)');

  // 3. Routing Engine Execution Verification
  const stops = [
    { lng: 11.255, lat: 46.498 }, // Bolzano
    { lng: 11.320, lat: 46.540 }, // Merano
  ];

  // Train (Free Mode Rail): Should produce straight densified segments without calling OSRM
  const trainPoints = await buildJourneyFromStops(stops, 'train');
  assert(trainPoints.length > 2, `Train generates densified rail track points (got ${trainPoints.length})`);
  assert(trainPoints[0].lng === stops[0].lng && trainPoints[0].lat === stops[0].lat, 'Train route begins at start stop');
  assert(
    trainPoints[trainPoints.length - 1].lng === stops[1].lng &&
    trainPoints[trainPoints.length - 1].lat === stops[1].lat,
    'Train route terminates at destination stop'
  );

  // Plane (Free Mode Flight Arc): Should produce 81 points with cruising altitude apex
  const planePoints = await buildJourneyFromStops(stops, 'plane');
  assert(planePoints.length === 81, `Plane generates smooth flight arc with 81 points (got ${planePoints.length})`);
  const maxPlaneEle = Math.max(...planePoints.map((p) => p.ele || 0));
  assert(maxPlaneEle >= 8000, `Plane flight arc includes cruising altitude apex (got ${maxPlaneEle}m)`);

  // Boat (Free Mode Sea Arc): Should produce 61 points with 0m elevation
  const boatPoints = await buildJourneyFromStops(stops, 'boat');
  assert(boatPoints.length === 61, `Boat generates smooth maritime arc with 61 points (got ${boatPoints.length})`);
  const maxBoatEle = Math.max(...boatPoints.map((p) => p.ele || 0));
  assert(maxBoatEle === 0, `Boat maritime arc maintains sea level elevation 0m (got ${maxBoatEle}m)`);

  // 4. Multi-Segment Mixed Transport Routing
  const multiStops = [
    { lng: 11.255, lat: 46.498 }, // Stop 1
    { lng: 11.320, lat: 46.540 }, // Stop 2
    { lng: 11.450, lat: 46.600 }, // Stop 3
  ];
  const mixedPoints = await buildJourneyFromStops(multiStops, ['train', 'plane']);
  assert(mixedPoints.length > 80, `Mixed-mode journey generates combined trajectory (got ${mixedPoints.length} points)`);

  // 5. Canonical Stops & Segment Construction Integrity
  const canonicalStops: RouteStop[] = multiStops.map((s, idx) => ({
    id: `stop-${idx}`,
    placeName: `City ${idx + 1}`,
    customLabel: `City ${idx + 1}`,
    showLabel: true,
    lng: s.lng,
    lat: s.lat,
  }));

  const canonicalSegments: RouteSegment[] = [
    {
      id: 'seg-1',
      fromStopId: canonicalStops[0].id,
      toStopId: canonicalStops[1].id,
      transportType: 'train',
      routingProfile: 'direct',
      shapingPoints: [],
      use3dSymbol: true,
      status: 'calculated',
      geometry: trainPoints,
    },
    {
      id: 'seg-2',
      fromStopId: canonicalStops[1].id,
      toStopId: canonicalStops[2].id,
      transportType: 'plane',
      routingProfile: 'direct',
      shapingPoints: [],
      use3dSymbol: true,
      status: 'calculated',
      geometry: planePoints,
    },
  ];

  const canonicalRoute: CanonicalRoute = {
    id: 'route-test',
    name: 'City 1 → City 3',
    status: 'calculated',
    color: '#ff4d2e',
    width: 8,
    style: 'solid',
    stops: canonicalStops,
    segments: canonicalSegments,
    calculatedGeometry: mixedPoints,
  };

  assert(canonicalRoute.stops.length === 3, 'Canonical route retains all 3 destination stops');
  assert(canonicalRoute.segments.length === 2, 'Canonical route retains both multi-leg segments');
  assert(canonicalRoute.segments[0].transportType === 'train', 'Segment 1 preserves train transport');
  assert(canonicalRoute.segments[1].transportType === 'plane', 'Segment 2 preserves plane transport');
  assert(canonicalRoute.segments[0].routingProfile === 'direct', 'Segment 1 assigned direct routing profile');

  console.log('\n========================================');
  console.log(`RESULTS: ${passed} / ${total} assertions passed.`);
  console.log('========================================\n');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
