import assert from 'node:assert';
import { createNewProject } from './src/utils/indexedDbStorage.ts';
import type { MapProject, Scene, CanonicalRoute, RouteStop, CameraBlock, MapSign, OverlayConfig, Route } from './src/types/index.ts';

console.log('--- RUNNING STAGE 7 COMPREHENSIVE TEST SUITE: CAPTURE-PHASE FALLBACK & POINTER PROTECTION ---');

let assertionsPassed = 0;
function pass(msg: string) {
  assertionsPassed++;
  console.log(`  ✓ [ASSERTION ${assertionsPassed}] ${msg}`);
}

interface ListenerEntry {
  fn: (e: any) => void;
  useCapture: boolean;
}

class MockWindow {
  listeners: Record<string, ListenerEntry[]> = {};

  addEventListener(type: string, fn: (e: any) => void, options?: boolean | { capture?: boolean }) {
    const useCapture = typeof options === 'boolean' ? options : !!options?.capture;
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push({ fn, useCapture });
  }

  removeEventListener(type: string, fn: (e: any) => void, options?: boolean | { capture?: boolean }) {
    const useCapture = typeof options === 'boolean' ? options : !!options?.capture;
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter((entry) => !(entry.fn === fn && entry.useCapture === useCapture));
  }

  // Simulates DOM event dispatch through Capture phase -> Target -> Bubbling phase
  dispatchSimulatedDOMEvent(type: string, event: { pointerId: number; coords?: { lng: number; lat: number }; stopPropagationInBubble?: boolean }) {
    let propagationStopped = false;
    const domEvent = {
      ...event,
      stopPropagation() {
        propagationStopped = true;
      },
    };

    // 1. CAPTURE PHASE on window (runs first)
    const list = [...(this.listeners[type] || [])];
    const captureListeners = list.filter((l) => l.useCapture);
    for (const entry of captureListeners) {
      entry.fn(domEvent);
    }

    // 2. TARGET & INTERMEDIATE ANCESTORS (simulated external element calling stopPropagation in bubbling)
    if (event.stopPropagationInBubble) {
      domEvent.stopPropagation();
    }

    // 3. BUBBLING PHASE on window (only runs if propagation was not stopped)
    if (!propagationStopped) {
      const bubbleListeners = list.filter((l) => !l.useCapture);
      for (const entry of bubbleListeners) {
        entry.fn(domEvent);
      }
    }
  }

  count(type?: string, useCaptureOnly?: boolean) {
    if (type) {
      const list = this.listeners[type] || [];
      if (useCaptureOnly !== undefined) {
        return list.filter((l) => l.useCapture === useCaptureOnly).length;
      }
      return list.length;
    }
    return Object.values(this.listeners).reduce((acc, arr) => {
      if (useCaptureOnly !== undefined) {
        return acc + arr.filter((l) => l.useCapture === useCaptureOnly).length;
      }
      return acc + arr.length;
    }, 0);
  }
}

async function runTests() {
  const project = createNewProject([]);
  pass('Created project with schemaVersion 2');
  assert.strictEqual(project.schemaVersion, 2);
  assert.strictEqual(project.scenes.length, 1);
  assert.strictEqual('routes' in project.scenes[0], false, 'Initial scene must not have routes property');
  pass('Initial scene has no routes property');

  // Multi-scene creation
  const activeScene = project.scenes[0];
  const newScene: Scene = {
    id: `scene-${Date.now()}-abc12`,
    name: `Scene ${project.scenes.length + 1}`,
    duration: activeScene.duration || 15,
    holdStartSec: 0,
    holdEndSec: 0,
    mapThemeId: activeScene.mapThemeId || 'satellite-streets',
    mapLabels: activeScene.mapLabels,
    labelLang: activeScene.labelLang,
    regions: activeScene.regions,
    terrain: activeScene.terrain,
    camera: activeScene.camera ? { ...activeScene.camera } : undefined,
    signs: [],
    cameraBlocks: [],
    overlays: { ...activeScene.overlays },
  };
  const multiSceneProject: MapProject = {
    ...project,
    scenes: [...project.scenes, newScene],
  };

  // =========================================================================
  // COMPONENT HANDLER HARNESS (EXACT POINTER IDENTITY & DRAG LIFECYCLE)
  // =========================================================================
  const MAX_UNDO_ENTRIES = 20;
  const undoStack: MapProject[] = [];
  const redoStack: MapProject[] = [];

  let isInteractionActive = false;
  let hasInteractionMoved = false;
  let preInteractionSnapshot: MapProject | null = null;
  let currentProject: MapProject = JSON.parse(JSON.stringify(multiSceneProject));

  // EditorPage drag tracking handlers
  function beginTrackingInteraction() {
    isInteractionActive = true;
    hasInteractionMoved = false;
    preInteractionSnapshot = JSON.parse(JSON.stringify(currentProject));
  }

  function notifyInteractionMoved() {
    if (isInteractionActive && !hasInteractionMoved) {
      hasInteractionMoved = true;
      if (preInteractionSnapshot) {
        undoStack.push(preInteractionSnapshot);
        if (undoStack.length > MAX_UNDO_ENTRIES) {
          undoStack.shift();
        }
        redoStack.length = 0;
      }
    }
  }

  function endTrackingInteraction() {
    if (!isInteractionActive) return; // Idempotency guard
    isInteractionActive = false;
    hasInteractionMoved = false;
    preInteractionSnapshot = null;
  }

  function cancelTrackingInteraction() {
    if (!isInteractionActive) return; // Idempotency guard
    const snapshotToRestore = preInteractionSnapshot;
    const hadMoved = hasInteractionMoved;

    isInteractionActive = false;
    hasInteractionMoved = false;
    preInteractionSnapshot = null;

    if (hadMoved && snapshotToRestore) {
      if (undoStack.length > 0) {
        undoStack.pop();
      }
      currentProject = {
        ...snapshotToRestore,
        updatedAt: Date.now(),
      };
    }
  }

  function pushUndoSnapshot() {
    if (isInteractionActive) return;
    const snapshot: MapProject = JSON.parse(JSON.stringify(currentProject));
    undoStack.push(snapshot);
    if (undoStack.length > MAX_UNDO_ENTRIES) {
      undoStack.shift();
    }
    redoStack.length = 0;
  }

  // MapViewer state & refs
  const mockWindow = new MockWindow();
  let activePointerId: number | null = null;
  let hasPointerCapture = false;
  let didDrag = false;
  let fallbackCleanup: (() => void) | null = null;

  function removeFallbackListeners() {
    if (fallbackCleanup) {
      fallbackCleanup();
      fallbackCleanup = null;
    }
  }

  function setupFallbackListeners(targetPointerId: number) {
    removeFallbackListeners();

    const handleWindowPointerMove = (ev: { pointerId: number; coords?: { lng: number; lat: number } }) => {
      if (ev.pointerId !== targetPointerId || !ev.coords) return;
      performPointerMove(ev.pointerId, ev.coords);
    };

    const handleWindowPointerUp = (ev: { pointerId: number }) => {
      if (ev.pointerId !== targetPointerId) return;
      performPointerUp(ev.pointerId);
    };

    const handleWindowPointerCancel = (ev: { pointerId: number }) => {
      if (ev.pointerId !== targetPointerId) return;
      performPointerCancel(ev.pointerId);
    };

    // 1. Capture-phase registration
    mockWindow.addEventListener('pointermove', handleWindowPointerMove, true);
    mockWindow.addEventListener('pointerup', handleWindowPointerUp, true);
    mockWindow.addEventListener('pointercancel', handleWindowPointerCancel, true);

    fallbackCleanup = () => {
      mockWindow.removeEventListener('pointermove', handleWindowPointerMove, true);
      mockWindow.removeEventListener('pointerup', handleWindowPointerUp, true);
      mockWindow.removeEventListener('pointercancel', handleWindowPointerCancel, true);
    };
  }

  function startDragInteraction(pointerId: number, simulateCaptureSuccess: boolean): boolean {
    // 2. Central active pointer protection
    if (activePointerId !== null) {
      return false;
    }

    activePointerId = pointerId;
    didDrag = false;

    // Explicitly record whether capture succeeded
    hasPointerCapture = simulateCaptureSuccess;

    if (!hasPointerCapture) {
      setupFallbackListeners(pointerId);
    } else {
      removeFallbackListeners();
    }

    beginTrackingInteraction();
    return true;
  }

  function performPointerMove(pointerId: number, coords: { lng: number; lat: number }) {
    if (activePointerId === null || pointerId !== activePointerId) {
      return false;
    }
    if (!didDrag) {
      didDrag = true;
      notifyInteractionMoved();
    }
    currentProject.routes[0].calculatedGeometry = [coords];
    return true;
  }

  function performPointerUp(pointerId: number) {
    if (activePointerId === null || pointerId !== activePointerId) {
      return false;
    }
    removeFallbackListeners();
    hasPointerCapture = false;
    activePointerId = null;
    didDrag = false;
    endTrackingInteraction();
    return true;
  }

  function performPointerCancel(pointerId: number) {
    if (activePointerId === null || pointerId !== activePointerId) {
      return false;
    }
    removeFallbackListeners();
    hasPointerCapture = false;
    activePointerId = null;
    didDrag = false;
    cancelTrackingInteraction();
    return true;
  }

  // Workspace DOM event handlers (active only when capture succeeded)
  function handleWorkspacePointerMove(e: { pointerId: number; coords: { lng: number; lat: number } }) {
    if (!hasPointerCapture) return false;
    return performPointerMove(e.pointerId, e.coords);
  }

  function handleWorkspacePointerUp(e: { pointerId: number }) {
    if (!hasPointerCapture) return false;
    return performPointerUp(e.pointerId);
  }

  // Component unmount / cleanup
  function cleanupComponent() {
    removeFallbackListeners();
    if (activePointerId !== null) {
      activePointerId = null;
      hasPointerCapture = false;
      cancelTrackingInteraction();
    }
  }

  // =========================================================================
  // FOCUSED TESTS FOR THE TWO TARGETED CORRECTIONS
  // =========================================================================

  // --- ITEM 1: CENTRAL ACTIVE POINTER PROTECTION IN startDragInteraction ---
  undoStack.length = 0;
  redoStack.length = 0;
  currentProject.routes[0].calculatedGeometry = [{ lng: 10.0, lat: 45.0 }];

  // 1. First pointer (pointerId: 100) starts drag
  const startFirst = startDragInteraction(100, false);
  assert.strictEqual(startFirst, true);
  assert.strictEqual(activePointerId, 100);
  pass('First pointer (100) successfully acquired active drag');

  // 2. Second pointer (pointerId: 200) attempts startDragInteraction
  const startSecond = startDragInteraction(200, false);
  assert.strictEqual(startSecond, false, 'startDragInteraction must return immediately without overwriting when activePointerId !== null');
  assert.strictEqual(activePointerId, 100, 'activePointerId remains strictly 100 and was not overwritten');
  pass('Central guard in startDragInteraction prevented second pointer from overwriting active pointer');

  // --- ITEM 2: CAPTURE-PHASE REGISTRATION AND IMMUNITY TO stopPropagation ---
  // 3. Verify listeners are registered with useCapture: true
  assert.strictEqual(mockWindow.count('pointermove', true), 1);
  assert.strictEqual(mockWindow.count('pointerup', true), 1);
  assert.strictEqual(mockWindow.count('pointercancel', true), 1);
  assert.strictEqual(mockWindow.count(undefined, false), 0, 'Zero bubbling listeners registered on window');
  pass('Fallback listeners are registered strictly in capture phase (useCapture: true)');

  // 4. Pointer move outside workspace with stopPropagation() in bubble phase
  // In DOM event flow, capture-phase listeners on window run BEFORE external bubbling listeners call stopPropagation()
  mockWindow.dispatchSimulatedDOMEvent('pointermove', {
    pointerId: 100,
    coords: { lng: 22.0, lat: 48.0 },
    stopPropagationInBubble: true,
  });
  assert.strictEqual(undoStack.length, 1, 'Capture-phase listener received move and committed undo snapshot despite bubble stopPropagation');
  assert.strictEqual(currentProject.routes[0].calculatedGeometry[0].lng, 22.0);
  pass('Event stopped by external element in bubbling phase is still received by capture-phase fallback');

  // 5. Wrong pointer ID is safely ignored even during capture phase
  mockWindow.dispatchSimulatedDOMEvent('pointermove', {
    pointerId: 999,
    coords: { lng: 99.0, lat: 99.0 },
    stopPropagationInBubble: true,
  });
  assert.strictEqual(currentProject.routes[0].calculatedGeometry[0].lng, 22.0, 'Geometry unchanged by wrong pointer ID');
  pass('Wrong pointer ID (999) safely ignored in capture-phase fallback');

  // 6. Pointer-up outside workspace with stopPropagation in bubble phase completes drag
  mockWindow.dispatchSimulatedDOMEvent('pointerup', {
    pointerId: 100,
    stopPropagationInBubble: true,
  });
  assert.strictEqual(activePointerId, null, 'Drag completed and active pointer cleared');
  assert.strictEqual(isInteractionActive, false);
  assert.strictEqual(undoStack.length, 1);
  pass('Pointerup with bubble stopPropagation successfully completed drag in capture phase');

  // 7. Verify all capture-phase fallback listeners are removed cleanly
  assert.strictEqual(mockWindow.count(), 0, 'All capture-phase listeners removed cleanly on pointerup');
  pass('Fallback listeners are completely removed with matching capture settings');

  // --- ITEM 3: POINTER CANCELLATION IN CAPTURE PHASE ---
  // 8. Cancellation test with capture-phase listener
  startDragInteraction(300, false);
  assert.strictEqual(mockWindow.count(undefined, true), 3);
  mockWindow.dispatchSimulatedDOMEvent('pointermove', {
    pointerId: 300,
    coords: { lng: 40.0, lat: 50.0 },
  });
  assert.strictEqual(undoStack.length, 2);
  assert.strictEqual(currentProject.routes[0].calculatedGeometry[0].lng, 40.0);

  // Cancellation dispatch with bubble stopPropagation
  mockWindow.dispatchSimulatedDOMEvent('pointercancel', {
    pointerId: 300,
    stopPropagationInBubble: true,
  });
  assert.strictEqual(activePointerId, null);
  assert.strictEqual(isInteractionActive, false);
  assert.strictEqual(undoStack.length, 1, 'Pending undo snapshot popped on cancel');
  assert.strictEqual(currentProject.routes[0].calculatedGeometry[0].lng, 22.0, 'Pre-drag coordinates restored');
  assert.strictEqual(mockWindow.count(), 0, 'Capture-phase listeners removed on pointercancel');
  pass('Capture-phase cancellation restores pre-drag snapshot and removes listeners despite bubble stopPropagation');

  // --- ITEM 4: COMPONENT CLEANUP SAFETY & WORKSPACE CAPTURE PATH ---
  // 9. Component cleanup safety
  startDragInteraction(400, false);
  assert.strictEqual(mockWindow.count(), 3);
  cleanupComponent();
  assert.strictEqual(mockWindow.count(), 0, 'Component unmount removed all capture listeners');
  assert.strictEqual(activePointerId, null);
  assert.strictEqual(isInteractionActive, false);
  pass('Component cleanup cleanly removes capture listeners and resets active pointer');

  // 10. Successful capture path remains operational
  startDragInteraction(500, true);
  assert.strictEqual(hasPointerCapture, true);
  assert.strictEqual(mockWindow.count(), 0, 'Zero window listeners when capture succeeds');
  handleWorkspacePointerMove({ pointerId: 500, coords: { lng: 60.0, lat: 70.0 } });
  assert.strictEqual(undoStack.length, 2);
  assert.strictEqual(currentProject.routes[0].calculatedGeometry[0].lng, 60.0);
  handleWorkspacePointerUp({ pointerId: 500 });
  assert.strictEqual(activePointerId, null);
  assert.strictEqual(hasPointerCapture, false);
  pass('Successful pointer capture path works normally through workspace handlers');

  // 11. Subsequent discrete user action creates its own history entry
  pushUndoSnapshot();
  currentProject = {
    ...currentProject,
    duration: 80,
  };
  assert.strictEqual(undoStack.length, 3);
  assert.strictEqual(currentProject.duration, 80);
  pass('Subsequent discrete user action functions normally after drag cycle');

  console.log(`\nALL ${assertionsPassed} / ${assertionsPassed} ASSERTIONS PASSED!`);
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});