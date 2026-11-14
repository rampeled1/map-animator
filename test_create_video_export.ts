/**
 * test_create_video_export.ts
 *
 * Automated verification suite for the independent Create Video export pipeline:
 * 1. All three output dimensions (16:9 -> 1920x1080, 9:16 -> 1080x1920, 1:1 -> 1080x1080).
 * 2. Export always starting at 0% (onProgress(0) and onFrame(0)).
 * 3. Vehicle and route animation advancing during export (elapsedSec -> localProgress 0..1).
 * 4. Editor playback state remaining unchanged (no setCurrentTime / setIsPlaying / setActiveSceneIndex in export lifecycle).
 * 5. Editor camera remaining unchanged (isolated offscreen export MapViewer with isExport).
 * 6. Multi-scene export transitions via resolveExportSceneAtTime.
 * 7. Cancellation cleanup (stops rAF, tracks, MediaRecorder, invokes onCancel without download/onFinish).
 * 8. Failure cleanup (onFrame throw / recorder.onerror cleans up resources, invokes onError without onFinish).
 * 9. Starting a second export after completion, cancellation, or failure.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  getExportDimensions,
  computeExportDrawRect,
  resolveExportSceneAtTime,
  startCanvasRecording,
} from './src/utils/videoRecorder.ts';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ ${msg}`);
}

console.log('=== TEST SUITE: CREATE VIDEO INDEPENDENT EXPORT ===\n');

// ---------------------------------------------------------------------------
// 1. All three output dimensions & aspect-ratio draw rect
// ---------------------------------------------------------------------------
console.log('--- 1. Export Dimensions & Aspect-Ratio Draw Rect ---');
assert(
  JSON.stringify(getExportDimensions('16:9')) === JSON.stringify({ width: 1920, height: 1080 }),
  '16:9 resolves to 1920x1080'
);
assert(
  JSON.stringify(getExportDimensions('9:16')) === JSON.stringify({ width: 1080, height: 1920 }),
  '9:16 resolves to 1080x1920'
);
assert(
  JSON.stringify(getExportDimensions('1:1')) === JSON.stringify({ width: 1080, height: 1080 }),
  '1:1 resolves to 1080x1080'
);

const exactRect = computeExportDrawRect(1080, 1920, 1080, 1920);
assert(
  exactRect.sx === 0 && exactRect.sy === 0 && exactRect.sw === 1080 && exactRect.sh === 1920 &&
    exactRect.dw === 1080 && exactRect.dh === 1920,
  '1:1 pixel match when source canvas matches 9:16 export viewport'
);

const cropRect = computeExportDrawRect(1920, 1080, 1080, 1920);
assert(
  cropRect.sx > 0 && cropRect.sw < 1920 && cropRect.dw === 1080 && cropRect.dh === 1920,
  'Non-matching canvas crops without stretching/distortion'
);

// ---------------------------------------------------------------------------
// 2. Multi-scene export resolution
// ---------------------------------------------------------------------------
console.log('\n--- 2. Multi-Scene Export Timeline Resolution ---');
const scenes = [{ duration: 5 }, { duration: 10 }, { duration: 5 }];
const s0 = resolveExportSceneAtTime(scenes, 0, true, 2);
assert(s0.sceneIndex === 0 && s0.localTime === 0 && s0.localProgress === 0, 'Multi-scene export starts at scene 0, t=0, progress=0%');

const s0Mid = resolveExportSceneAtTime(scenes, 2.5, true, 0);
assert(s0Mid.sceneIndex === 0 && s0Mid.localTime === 2.5 && s0Mid.localProgress === 0.5, 'Scene 0 midpoint advances to 50%');

const s1Start = resolveExportSceneAtTime(scenes, 5, true, 0);
assert(s1Start.sceneIndex === 1 && s1Start.localTime === 0 && s1Start.localProgress === 0, 'Scene transition at 5s switches to scene 1 at localTime=0');

const s2End = resolveExportSceneAtTime(scenes, 20, true, 0);
assert(s2End.sceneIndex === 2 && s2End.localTime === 5 && s2End.localProgress === 1, 'Multi-scene export ends at scene 2, progress=100%');

const singleScene = resolveExportSceneAtTime(scenes, 3, false, 1);
assert(singleScene.sceneIndex === 1 && singleScene.localTime === 3 && Math.abs(singleScene.localProgress - 0.3) < 1e-6, 'Single-scene export uses selected fallbackSceneIndex');

// ---------------------------------------------------------------------------
// 3. Mock DOM + MediaRecorder runtime tests (0% start, animation, cancel, error, re-export)
// ---------------------------------------------------------------------------
console.log('\n--- 3. Runtime Export Lifecycle (Start 0%, Frame Advance, Cancel, Error, Re-export) ---');

function setupMockEnv() {
  const createdCanvases: any[] = [];
  const rafQueue = new Map<number, (now: number) => void>();
  let nextRafId = 1;
  let fakeNow = 1000;
  let downloads = 0;
  let stoppedTracks = 0;
  const activeRecorders: any[] = [];

  (globalThis as any).performance = {
    now: () => fakeNow,
  };
  (globalThis as any).requestAnimationFrame = (cb: (now: number) => void) => {
    const id = nextRafId++;
    rafQueue.set(id, cb);
    return id;
  };
  (globalThis as any).cancelAnimationFrame = (id: number) => {
    rafQueue.delete(id);
  };
  (globalThis as any).URL = {
    createObjectURL: () => 'blob:mock-url',
    revokeObjectURL: () => {},
  };
  (globalThis as any).document = {
    body: {
      appendChild: () => {},
      removeChild: () => {},
    },
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        const c: any = {
          width: 0,
          height: 0,
          getContext: () => ({
            clearRect: () => {},
            drawImage: () => {},
          }),
          captureStream: () => ({
            getTracks: () => [
              {
                stop: () => {
                  stoppedTracks += 1;
                },
              },
            ],
          }),
        };
        createdCanvases.push(c);
        return c;
      }
      if (tag === 'a') {
        return {
          href: '',
          download: '',
          click: () => {
            downloads += 1;
          },
        };
      }
      return {};
    },
  };

  class MockMediaRecorder {
    static isTypeSupported() {
      return true;
    }
    state = 'inactive';
    ondataavailable: ((e: any) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: ((e: any) => void) | null = null;
    constructor(_stream: any, _opts: any) {
      activeRecorders.push(this);
    }
    start() {
      this.state = 'recording';
    }
    stop() {
      if (this.state === 'inactive') return;
      this.state = 'inactive';
      this.ondataavailable?.({ data: { size: 128 } });
      this.onstop?.();
    }
    triggerError(msg: string) {
      this.state = 'inactive';
      this.onerror?.({ error: new Error(msg) });
    }
  }
  (globalThis as any).MediaRecorder = MockMediaRecorder;

  const mockMapContainer: any = {
    querySelector: (sel: string) => {
      if (sel === 'canvas') {
        return { width: 1080, height: 1920, clientWidth: 1080, clientHeight: 1920 };
      }
      return null;
    },
    querySelectorAll: () => [],
  };

  return {
    mockMapContainer,
    createdCanvases,
    rafQueue,
    activeRecorders,
    getDownloads: () => downloads,
    getStoppedTracks: () => stoppedTracks,
    advanceTimeAndTick: (deltaMs: number) => {
      fakeNow += deltaMs;
      const entries = Array.from(rafQueue.entries());
      rafQueue.clear();
      for (const [, cb] of entries) {
        cb(fakeNow);
      }
    },
  };
}

// Test A: Normal export for all 3 aspect ratios + 0% start + frame advance + second export
{
  const env = setupMockEnv();
  const frames: number[] = [];
  const progresses: number[] = [];
  let finished = 0;

  startCanvasRecording(env.mockMapContainer, 'Trip 1', {
    durationSec: 1.0,
    fps: 30,
    aspectRatio: '9:16',
    onFrame: (elapsed) => frames.push(elapsed),
    onProgress: (p) => progresses.push(p),
    onFinish: () => {
      finished += 1;
    },
  });

  assert(env.createdCanvases[0].width === 1080 && env.createdCanvases[0].height === 1920, 'Composite canvas created at 1080x1920 for 9:16');
  assert(progresses[0] === 0, 'Export immediately reports 0% progress');
  assert(frames[0] === 0, 'Export immediately drives frame at elapsedSec = 0');

  env.advanceTimeAndTick(500);
  assert(frames[frames.length - 1] > 0 && frames[frames.length - 1] < 1, 'Animation clock advances mid-export');
  env.advanceTimeAndTick(600);
  assert(finished === 1 && env.getDownloads() === 1, 'Export finishes and triggers download once');
  assert(env.rafQueue.size === 0 && env.getStoppedTracks() >= 1, 'Export cleans up rAF and stream tracks on finish');

  // Subsequent second export after first finishes
  let secondFinished = 0;
  startCanvasRecording(env.mockMapContainer, 'Trip 2', {
    durationSec: 0.5,
    fps: 30,
    aspectRatio: '1:1',
    onFinish: () => {
      secondFinished += 1;
    },
  });
  assert(env.createdCanvases[1].width === 1080 && env.createdCanvases[1].height === 1080, 'Second export creates 1080x1080 canvas for 1:1');
  env.advanceTimeAndTick(600);
  assert(secondFinished === 1, 'Second export completes cleanly after first export');
}

// Test B: Cancellation cleanup + re-export
{
  const env = setupMockEnv();
  let cancelled = 0;
  let finished = 0;
  const handle = startCanvasRecording(env.mockMapContainer, 'Cancel Trip', {
    durationSec: 5,
    fps: 30,
    aspectRatio: '16:9',
    onCancel: () => {
      cancelled += 1;
    },
    onFinish: () => {
      finished += 1;
    },
  });

  assert(env.createdCanvases[0].width === 1920 && env.createdCanvases[0].height === 1080, '16:9 composite canvas is 1920x1080');
  env.advanceTimeAndTick(250);
  handle.stop();
  assert(cancelled === 1 && finished === 0 && env.getDownloads() === 0, 'Cancellation triggers onCancel without onFinish or download');
  assert(env.rafQueue.size === 0 && env.getStoppedTracks() >= 1, 'Cancellation clears rAF and stops stream tracks');
}

// Test C: Failure cleanup (onFrame error + recorder.onerror)
{
  const env = setupMockEnv();
  let errors = 0;
  let finished = 0;
  startCanvasRecording(env.mockMapContainer, 'Fail Trip', {
    durationSec: 5,
    fps: 30,
    aspectRatio: '16:9',
    onFrame: (elapsed) => {
      if (elapsed > 0) throw new Error('Simulated frame render error');
    },
    onError: () => {
      errors += 1;
    },
    onFinish: () => {
      finished += 1;
    },
  });
  env.advanceTimeAndTick(100);
  assert(errors === 1 && finished === 0 && env.rafQueue.size === 0 && env.getStoppedTracks() >= 1, 'Frame error cleans up rAF/tracks and invokes onError without onFinish');

  const env2 = setupMockEnv();
  let recorderErrors = 0;
  startCanvasRecording(env2.mockMapContainer, 'Recorder Error Trip', {
    durationSec: 5,
    fps: 30,
    onError: () => {
      recorderErrors += 1;
    },
  });
  env2.activeRecorders[0].triggerError('Encoding error');
  assert(recorderErrors === 1 && env2.rafQueue.size === 0 && env2.getStoppedTracks() >= 1, 'MediaRecorder error cleans up rAF/tracks and invokes onError');
}

// ---------------------------------------------------------------------------
// 4. Architectural / Editor isolation verification
// ---------------------------------------------------------------------------
console.log('\n--- 4. Editor Isolation & Offscreen Export MapViewer Verification ---');
const editorSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/EditorPage.tsx'), 'utf-8');
const mapViewerSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/MapViewer.tsx'), 'utf-8');

const renderBlockStart = editorSrc.indexOf('const handleStartRender = () => {');
const renderBlockEnd = editorSrc.indexOf('const activeStepPanel = (');
const renderBlock = editorSrc.slice(renderBlockStart, renderBlockEnd);

assert(!renderBlock.includes('setCurrentTime('), 'Export handlers never call setCurrentTime()');
assert(!renderBlock.includes('setIsPlaying('), 'Export handlers never call setIsPlaying()');
assert(!renderBlock.includes('setActiveSceneIndex('), 'Export handlers never call setActiveSceneIndex()');
assert(editorSrc.includes('ref={exportMapViewerRef}') && editorSrc.includes('isExport'), 'EditorPage mounts isolated offscreen export MapViewer');
assert(mapViewerSrc.includes('isExport?: boolean') && mapViewerSrc.includes('onExportReady?: () => void'), 'MapViewer exposes isExport and onExportReady props');

console.log('\nALL CREATE VIDEO EXPORT TESTS PASSED!\n');
