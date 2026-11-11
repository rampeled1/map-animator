import {
  createNewProject,
  getNextUntitledProjectName,
  checkGzipStreamsSupported,
  IndexedDBProjectStorage,
} from './src/utils/indexedDbStorage.ts';
import type { MapProject } from './src/types/index.ts';

async function runTests() {
  console.log('=== RUNNING COMPREHENSIVE STORAGE & EXPORT/IMPORT REGRESSION SUITE ===\n');
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

  // 1. Factory & Schema v2 Project Structure
  const proj1 = createNewProject([]);
  assert(proj1.schemaVersion === 2, 'Project has schemaVersion === 2');
  assert(proj1.name === 'Untitled Project 1', 'First project is named "Untitled Project 1"');
  assert(Array.isArray(proj1.routes) && proj1.routes.length === 1, 'Project contains strictly 1 canonical route');
  assert(proj1.duration === 40, 'Project duration defaults to 40');
  assert(proj1.durationPreset === 40, 'Project durationPreset defaults to 40');
  assert(proj1.scenes.length === 1, 'Project initializes with 1 scene');

  // Verify Scene does NOT contain routes
  const scene0 = proj1.scenes[0];
  assert(!('routes' in scene0), 'Scene 0 strictly does NOT contain a "routes" property (clean Schema v2)');

  const canonicalRoute = proj1.routes![0];
  assert(canonicalRoute.status === 'idle', 'Canonical route status initializes to "idle"');
  assert(canonicalRoute.stops.length === 0, 'Canonical route starts with empty stops array');
  assert(canonicalRoute.segments.length === 0, 'Canonical route starts with empty segments array');
  assert(canonicalRoute.calculatedGeometry.length === 0, 'Canonical route starts with empty calculatedGeometry array');

  // 2. Composite ID Generation
  assert(proj1.id.startsWith('proj-') && proj1.id.split('-').length >= 3, 'Project ID uses composite timestamp-UUID format');
  assert(canonicalRoute.id.startsWith('route-') && canonicalRoute.id.split('-').length >= 3, 'Route ID uses composite timestamp-UUID format');
  assert(proj1.scenes[0].id.startsWith('scene-') && proj1.scenes[0].id.split('-').length >= 3, 'Scene ID uses composite timestamp-UUID format');

  // 3. Lowest-Available-Number Naming Algorithm
  const summaries = [
    { id: '1', name: 'Untitled Project 1', updatedAt: 0, createdAt: 0, stopCount: 0, distanceKm: 0 },
    { id: '3', name: 'Untitled Project 3', updatedAt: 0, createdAt: 0, stopCount: 0, distanceKm: 0 },
  ];
  const nextName = getNextUntitledProjectName(summaries);
  assert(nextName === 'Untitled Project 2', 'Naming algorithm reuses freed slot "Untitled Project 2" when 1 and 3 exist');

  // 4. Native Compression Streams
  assert(checkGzipStreamsSupported() === true, 'Native CompressionStream("gzip") and DecompressionStream("gzip") supported in runtime');

  // 5. REGRESSION TEST: Export to .mapanim and Import Validation Round-Trip
  const storage = new IndexedDBProjectStorage();

  // Mock fake DB for unit testing importProjectFile logic
  const mockPuts: any[] = [];
  const mockDb: any = {
    transaction: (_stores: string[], _mode: string) => ({
      objectStore: (storeName: string) => ({
        put: async (item: any) => {
          mockPuts.push({ store: storeName, item });
        },
      }),
      done: Promise.resolve(),
    }),
  };

  // Add sample stop and segment to canonical route
  canonicalRoute.stops.push({
    id: 'stop-1',
    placeName: 'Paris',
    customLabel: 'Paris City',
    showLabel: true,
    lng: 2.3522,
    lat: 48.8566,
  });

  // Prepare portable .mapanim file
  const exportPayload = {
    schemaVersion: 2,
    project: proj1,
    assets: {
      'asset-sample-1': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    },
  };

  // Add reference to asset in sign
  proj1.scenes[0].signs.push({
    id: 'sign-1',
    lng: 2.3522,
    lat: 48.8566,
    style: 'photo',
    text: 'Eiffel Tower',
    photoUrl: 'asset-sample-1',
    triggerMode: 'always',
    size: 40,
  });

  const fileBlob = new Blob([JSON.stringify(exportPayload)], { type: 'application/json' });
  const mockFile = new File([fileBlob], 'test_journey.mapanim', { type: 'application/json' });

  try {
    const imported = await (storage as any).importProjectFile.call({ getDB: async () => mockDb }, mockFile);
    assert(imported.schemaVersion === 2, 'Imported project has schemaVersion === 2');
    assert(imported.routes.length === 1, 'Imported project retains strictly 1 canonical route');
    assert(imported.routes[0].stops.length === 1, 'Imported canonical route retains stops data');
    assert(imported.scenes.length === 1, 'Imported project retains scene data');
    assert(!('routes' in imported.scenes[0]), 'Imported scene strictly does not contain a "routes" property');
    
    // Check asset remapping in sign
    const importedSign = imported.scenes[0].signs[0];
    assert(importedSign.photoUrl !== 'asset-sample-1', 'Imported sign photoUrl remapped from old asset ID');
    assert(importedSign.photoUrl.startsWith('asset-'), 'Imported sign photoUrl has new unique asset ID');

    // Check mockPuts in atomic transaction
    assert(mockPuts.some(p => p.store === 'projects'), 'Import atomic transaction wrote project record to "projects" store');
    assert(mockPuts.some(p => p.store === 'assets'), 'Import atomic transaction wrote asset blob to "assets" store');
    console.log('  ✓ Export / Import round-trip passed validation without rejection');
    passed += 8;
    total += 8;
  } catch (err: any) {
    console.error('  ✗ FAIL in export/import test:', err);
    process.exitCode = 1;
  }

  // 6. Test Rejection of Legacy Project Containing Scene.routes
  const legacyPayload = {
    schemaVersion: 2,
    project: {
      ...proj1,
      scenes: [{ ...proj1.scenes[0], routes: [] }], // Illegal scene.routes
    },
    assets: {},
  };
  const legacyBlob = new Blob([JSON.stringify(legacyPayload)], { type: 'application/json' });
  const legacyFile = new File([legacyBlob], 'legacy_project.mapanim', { type: 'application/json' });

  let rejectionCaught = false;
  try {
    await (storage as any).importProjectFile.call({ getDB: async () => mockDb }, legacyFile);
  } catch (err: any) {
    rejectionCaught = true;
    assert(err.message.includes('Scenes must not contain routes'), 'Import validator successfully rejected project with scene.routes property');
  }
  if (!rejectionCaught) {
    assert(false, 'Import validator should have rejected project with scene.routes');
  }

  console.log(`\n========================================`);
  console.log(`RESULTS: ${passed} / ${total} tests passed.`);
  console.log(`========================================\n`);
}

runTests();
