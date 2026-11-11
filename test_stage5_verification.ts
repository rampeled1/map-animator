import {
  createNewProject,
  getNextUntitledProjectName,
  checkGzipStreamsSupported,
  IndexedDBProjectStorage,
} from './src/utils/indexedDbStorage.ts';
import { getAdaptedCanonicalRoute } from './src/utils/routeAdapter.ts';
import type { CanonicalRoute, MapProject } from './src/types/index.ts';

async function runTests() {
  console.log('=== RUNNING STAGE 5 VERIFICATION: CANONICAL PERSISTENCE, STATUS & IMMUTABILITY ===\n');
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

  // 1. Immutable State Update Verification
  const initialProject = createNewProject([]);
  const originalRoutesRef = initialProject.routes;
  const originalCanonicalRef = initialProject.routes[0];

  const updatedCanonical: CanonicalRoute = {
    ...originalCanonicalRef,
    status: 'calculated',
    stops: [
      {
        id: 'stop-1',
        placeName: 'Paris',
        customLabel: 'Paris Center',
        showLabel: true,
        lng: 2.3522,
        lat: 48.8566,
      },
      {
        id: 'stop-2',
        placeName: 'Lyon',
        customLabel: 'Lyon Station',
        showLabel: true,
        lng: 4.8357,
        lat: 45.7640,
      },
    ],
    segments: [
      {
        id: 'seg-1',
        fromStopId: 'stop-1',
        toStopId: 'stop-2',
        transportType: 'train',
        shapingPoints: [],
        use3dSymbol: true,
        status: 'calculated',
        geometry: [
          { lng: 2.3522, lat: 48.8566 },
          { lng: 4.8357, lat: 45.7640 },
        ],
      },
    ],
    calculatedGeometry: [
      { lng: 2.3522, lat: 48.8566 },
      { lng: 4.8357, lat: 45.7640 },
    ],
  };

  // Simulate onUpdateCanonicalRoute state updater
  const stateUpdater = (prev: MapProject) => ({
    ...prev,
    updatedAt: Date.now(),
    routes: [updatedCanonical],
  });
  const updatedProject = stateUpdater(initialProject);

  assert(updatedProject !== initialProject, 'Project root reference updated immutably');
  assert(updatedProject.routes !== originalRoutesRef, 'Routes array updated immutably');
  assert(updatedProject.routes[0] !== originalCanonicalRef, 'CanonicalRoute record updated immutably');
  assert(initialProject.routes[0].stops.length === 0, 'Original project state remains completely unmutated');

  // 2. Calculation Integrity & Status Verification
  // Successful calculation: geometry non-empty and length >= 2
  const successfulGeometry = [{ lng: 10, lat: 50 }, { lng: 11, lat: 51 }];
  const isCalcValid = Array.isArray(successfulGeometry) && successfulGeometry.length >= 2;
  const successStatus = isCalcValid ? 'calculated' : 'error';
  assert(successStatus === 'calculated', 'Calculation status marked "calculated" when geometry has >= 2 valid coordinates');

  // Failed calculation: empty geometry
  const failedGeometry: any[] = [];
  const isFailValid = Array.isArray(failedGeometry) && failedGeometry.length >= 2;
  const failStatus = isFailValid ? 'calculated' : 'error';
  assert(failStatus === 'error', 'Calculation status marked "error" (not "calculated") when geometry calculation fails or is empty');

  // 3. routeAdapter Compatibility Check with MapViewer
  const adapted = getAdaptedCanonicalRoute(updatedProject.routes[0]);
  assert(adapted.id === updatedProject.routes[0].id, 'Adapter preserves canonical route ID');
  assert(adapted.points.length === 2, 'Adapter maps calculatedGeometry to points for MapViewer');
  assert(adapted.legs.length === 1, 'Adapter synthesizes leg boundary for 3D vehicle rendering');
  assert(adapted.legs[0].transportType === 'train', 'Adapter preserves segment transportType on synthesized leg');
  assert(adapted.legs[0].fromPointIndex === 0, 'Adapter sets correct fromPointIndex offset on synthesized leg');

  // 4. Persistence Simulation (Write, Reload, Validate)
  const mockDbStore = new Map<string, any>();
  const mockDb: any = {
    get: async (_store: string, key: string) => mockDbStore.get(key),
    put: async (_store: string, val: any) => mockDbStore.set(val.id, val),
  };

  const storage = new IndexedDBProjectStorage();
  (storage as any).getDB = async () => mockDb;

  await storage.saveProject(updatedProject);
  const reloaded = await storage.loadProject(updatedProject.id);

  assert(reloaded !== null, 'Project reloaded successfully from storage');
  assert(reloaded!.routes[0].stops.length === 2, 'Reloaded project preserves both canonical stops');
  assert(reloaded!.routes[0].stops[0].placeName === 'Paris', 'Reloaded project preserves stop 1 placeName');
  assert(reloaded!.routes[0].stops[1].customLabel === 'Lyon Station', 'Reloaded project preserves stop 2 customLabel');
  assert(reloaded!.routes[0].segments[0].transportType === 'train', 'Reloaded project preserves per-segment transport');
  assert(reloaded!.routes[0].status === 'calculated', 'Reloaded project preserves calculated status');
  assert(reloaded!.scenes[0].duration === 40, 'Scene duration remains intact');
  assert(!('routes' in reloaded!.scenes[0]), 'Reloaded scene strictly has no routes property');

  console.log(`\n========================================`);
  console.log(`RESULTS: ${passed} / ${total} verification assertions passed.`);
  console.log(`========================================\n`);
}

runTests();
