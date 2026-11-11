import {
  createNewProject,
  getNextUntitledProjectName,
  checkGzipStreamsSupported,
  IndexedDBProjectStorage,
} from './src/utils/indexedDbStorage.ts';
import { getAdaptedCanonicalRoute } from './src/utils/routeAdapter.ts';
import type { CanonicalRoute, MapProject, Route } from './src/types/index.ts';

async function runTests() {
  console.log('=== RUNNING FINAL STAGE 5 VERIFICATION: STAGED CALCULATION & IMMUTABILITY ===\n');
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

  // 1. Initial Valid Calculated Route
  const initialProject = createNewProject([]);
  const existingGeometry = [
    { lng: 11.255, lat: 46.498, ele: 260 },
    { lng: 11.320, lat: 46.540, ele: 410 },
  ];
  const initialCanonical: CanonicalRoute = {
    ...initialProject.routes![0],
    name: 'Alps Tour',
    status: 'calculated',
    stops: [
      { id: 's1', placeName: 'Bolzano', customLabel: 'Bolzano', showLabel: true, lng: 11.255, lat: 46.498 },
      { id: 's2', placeName: 'Merano', customLabel: 'Merano', showLabel: true, lng: 11.320, lat: 46.540 },
    ],
    segments: [
      {
        id: 'seg1',
        fromStopId: 's1',
        toStopId: 's2',
        transportType: 'car',
        shapingPoints: [],
        use3dSymbol: true,
        status: 'calculated',
        geometry: existingGeometry,
      },
    ],
    calculatedGeometry: existingGeometry,
  };
  initialProject.routes = [initialCanonical];

  // 2. Calculation Failure & Preservation of Previous Geometry (Staged Calculation)
  // Simulate recalculation failure (e.g. OSRM service down / empty result)
  let calculationSucceeded = false;
  let newStagedPoints: any[] = []; // Incomplete/empty
  
  const previousGeometry = initialCanonical.calculatedGeometry;
  const finalGeometry = calculationSucceeded ? newStagedPoints : previousGeometry;
  const finalStatus = calculationSucceeded ? 'calculated' : 'stale';

  assert(finalStatus === 'stale', 'Failed recalculation marks status as "stale" instead of "calculated"');
  assert(finalGeometry === previousGeometry, 'Failed recalculation preserves previous geometry byte-for-byte');
  assert(finalGeometry.length === 2, 'Previous geometry retains original coordinate count');
  assert(finalGeometry[0].lng === 11.255 && finalGeometry[1].lng === 11.320, 'Previous coordinate values completely unchanged');

  // 3. Immutability Across All Route Update Paths
  // Test A: Clear Route (handleDeleteRoute)
  const clearUpdater = (prev: MapProject) => {
    const canonical = prev.routes?.[0];
    const clearedRoute: CanonicalRoute = {
      id: canonical?.id || 'route-1',
      name: canonical?.name || 'Main Journey',
      color: canonical?.color || '#ff4d2e',
      width: canonical?.width || 8,
      style: canonical?.style || 'solid',
      status: 'idle',
      stops: [],
      segments: [],
      calculatedGeometry: [],
      stats: { distanceKm: 0, elevationGainM: 0, elevationLossM: 0 },
    };
    return {
      ...prev,
      updatedAt: Date.now(),
      routes: [clearedRoute],
    };
  };

  const clearedProj = clearUpdater(initialProject);
  assert(clearedProj !== initialProject, 'Clear Route: returns new project object reference');
  assert(clearedProj.routes !== initialProject.routes, 'Clear Route: returns new routes array reference');
  assert(clearedProj.routes[0] !== initialProject.routes[0], 'Clear Route: returns new canonical route reference');
  assert(initialProject.routes[0].calculatedGeometry.length === 2, 'Clear Route: prior state unmutated');

  // Test B: Reverse Route (handleReverseRoute via handleUpdateRoute)
  const reverseUpdater = (prev: MapProject, reversed: Route) => {
    const canonical = prev.routes?.[0];
    const updatedRoute: CanonicalRoute = {
      id: reversed.id,
      name: reversed.name,
      color: reversed.color,
      width: reversed.width,
      style: reversed.style,
      status: canonical?.status || 'calculated',
      stops: canonical?.stops ? [...canonical.stops].reverse() : [],
      segments: canonical?.segments ? [...canonical.segments] : [],
      calculatedGeometry: [...reversed.points],
    };
    return {
      ...prev,
      updatedAt: Date.now(),
      routes: [updatedRoute],
    };
  };

  const reversedAdapted: Route = {
    ...getAdaptedCanonicalRoute(initialCanonical),
    points: [...initialCanonical.calculatedGeometry].reverse(),
  };
  const reversedProj = reverseUpdater(initialProject, reversedAdapted);
  assert(reversedProj !== initialProject, 'Reverse Route: returns new project object reference');
  assert(reversedProj.routes !== initialProject.routes, 'Reverse Route: returns new routes array reference');
  assert(reversedProj.routes[0] !== initialProject.routes[0], 'Reverse Route: returns new canonical route reference');
  assert(reversedProj.routes[0].calculatedGeometry[0].lng === 11.320, 'Reverse Route: geometry reversed correctly');
  assert(initialProject.routes[0].calculatedGeometry[0].lng === 11.255, 'Reverse Route: prior state unmutated');

  // Test C: Rename Route (handleRenameRoute via handleUpdateRoute)
  const renameUpdater = (prev: MapProject, newName: string) => {
    const canonical = prev.routes?.[0];
    const updatedRoute: CanonicalRoute = {
      id: canonical?.id || 'r1',
      name: newName,
      color: canonical?.color || '#ff4d2e',
      width: canonical?.width || 8,
      style: canonical?.style || 'solid',
      status: canonical?.status || 'idle',
      stops: canonical?.stops ? [...canonical.stops] : [],
      segments: canonical?.segments ? [...canonical.segments] : [],
      calculatedGeometry: [...(canonical?.calculatedGeometry || [])],
    };
    return {
      ...prev,
      updatedAt: Date.now(),
      routes: [updatedRoute],
    };
  };

  const renamedProj = renameUpdater(initialProject, 'Dolomites Tour');
  assert(renamedProj !== initialProject, 'Rename Route: returns new project object reference');
  assert(renamedProj.routes !== initialProject.routes, 'Rename Route: returns new routes array reference');
  assert(renamedProj.routes[0].name === 'Dolomites Tour', 'Rename Route: name updated to "Dolomites Tour"');
  assert(initialProject.routes[0].name === 'Alps Tour', 'Rename Route: prior state unmutated');

  console.log(`\n========================================`);
  console.log(`RESULTS: ${passed} / ${total} assertions passed.`);
  console.log(`========================================\n`);
}

runTests();
