/**
 * In-browser composite canvas video recording engine.
 * Combines the 3D MapLibre WebGL canvas AND the SVG route/sign/HUD overlays
 * into a single high-bitrate MP4/WebM video stream.
 */

import type { AspectRatioOption, Scene } from '../types/index.ts';

export interface RenderOptions {
  durationSec: number;
  fps: number;
  aspectRatio?: AspectRatioOption;
  onFrame?: (elapsedSec: number, dtSec: number, rafTime: number) => void;
  onProgress?: (percent: number, text: string) => void;
  onFinish?: (blob: Blob, filename: string) => void;
  onCancel?: () => void;
  onError?: (error: Error) => void;
}

export interface ExportDrawRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

export function getExportDimensions(aspectRatio?: AspectRatioOption): { width: number; height: number } {
  switch (aspectRatio) {
    case '9:16':
      return { width: 1080, height: 1920 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '16:9':
    default:
      return { width: 1920, height: 1080 };
  }
}

export function computeExportDrawRect(
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number
): ExportDrawRect {
  if (srcW <= 0 || srcH <= 0) {
    return { sx: 0, sy: 0, sw: targetW, sh: targetH, dx: 0, dy: 0, dw: targetW, dh: targetH };
  }
  const targetAspect = targetW / targetH;
  const srcAspect = srcW / srcH;

  if (Math.abs(srcAspect - targetAspect) < 1e-4) {
    return { sx: 0, sy: 0, sw: srcW, sh: srcH, dx: 0, dy: 0, dw: targetW, dh: targetH };
  }

  if (srcAspect > targetAspect) {
    const sw = srcH * targetAspect;
    const sx = (srcW - sw) / 2;
    return { sx, sy: 0, sw, sh: srcH, dx: 0, dy: 0, dw: targetW, dh: targetH };
  }

  const sh = srcW / targetAspect;
  const sy = (srcH - sh) / 2;
  return { sx: 0, sy, sw: srcW, sh, dx: 0, dy: 0, dw: targetW, dh: targetH };
}

export function resolveExportSceneAtTime(
  scenes: Pick<Scene, 'duration'>[],
  elapsedSec: number,
  renderAllScenes: boolean,
  fallbackSceneIndex: number
): { sceneIndex: number; localTime: number; sceneDuration: number; localProgress: number } {
  if (!scenes || scenes.length === 0) {
    return { sceneIndex: 0, localTime: 0, sceneDuration: 15, localProgress: 0 };
  }

  if (!renderAllScenes || scenes.length === 1) {
    const idx = Math.max(0, Math.min(scenes.length - 1, fallbackSceneIndex));
    const sceneDuration = Math.max(0.001, scenes[idx]?.duration || 15);
    const localTime = Math.max(0, Math.min(sceneDuration, elapsedSec));
    const localProgress = Math.max(0, Math.min(1, localTime / sceneDuration));
    return { sceneIndex: idx, localTime, sceneDuration, localProgress };
  }

  let accumulated = 0;
  for (let i = 0; i < scenes.length; i++) {
    const dur = Math.max(0.001, scenes[i]?.duration || 15);
    if (elapsedSec < accumulated + dur || i === scenes.length - 1) {
      const localTime = Math.max(0, Math.min(dur, elapsedSec - accumulated));
      const localProgress = Math.max(0, Math.min(1, localTime / dur));
      return { sceneIndex: i, localTime, sceneDuration: dur, localProgress };
    }
    accumulated += dur;
  }

  const lastIdx = scenes.length - 1;
  const lastDur = Math.max(0.001, scenes[lastIdx]?.duration || 15);
  return { sceneIndex: lastIdx, localTime: lastDur, sceneDuration: lastDur, localProgress: 1 };
}

export function startCanvasRecording(
  mapContainer: HTMLElement,
  projectName: string,
  options: RenderOptions
): { stop: () => void } {
  const mapCanvas = mapContainer.querySelector('canvas') as HTMLCanvasElement | null;
  if (!mapCanvas) {
    throw new Error('No map canvas available for rendering.');
  }

  const fps = options.fps || 30;
  const durationSec = Math.max(0.1, options.durationSec || 1);
  const { width, height } = getExportDimensions(options.aspectRatio);

  // Offscreen composite canvas combining WebGL map + SVG overlays
  const compositeCanvas = document.createElement('canvas');
  compositeCanvas.width = width;
  compositeCanvas.height = height;
  const ctx = compositeCanvas.getContext('2d');

  let active = true;
  let cancelled = false;
  let errored = false;
  let cleanedUp = false;
  let latestOverlayImg: HTMLImageElement | null = null;
  let encodingSvg = false;
  let rafId = 0;

  const updateSvgSnapshot = () => {
    if (!active || encodingSvg) return;
    const svgs = Array.from(mapContainer.querySelectorAll('svg.overlay')) as SVGSVGElement[];
    if (svgs.length === 0) return;

    encodingSvg = true;
    try {
      const mergedSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const clientW = mapCanvas.clientWidth || width;
      const clientH = mapCanvas.clientHeight || height;
      mergedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      mergedSvg.setAttribute('width', String(width));
      mergedSvg.setAttribute('height', String(height));
      mergedSvg.setAttribute('viewBox', `0 0 ${clientW} ${clientH}`);

      for (const svg of svgs) {
        const clone = svg.cloneNode(true) as SVGSVGElement;
        // Strip editor-only framing chrome & anchor handles from final exported video
        clone
          .querySelectorAll('.dim, .frame-outline, .frame-label, .anchor')
          .forEach((el) => el.remove());
        while (clone.firstChild) {
          mergedSvg.appendChild(clone.firstChild);
        }
      }

      const xml = new XMLSerializer().serializeToString(mergedSvg);
      const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
      const img = new Image();
      img.onload = () => {
        latestOverlayImg = img;
        encodingSvg = false;
      };
      img.onerror = () => {
        encodingSvg = false;
      };
      img.src = svgUrl;
    } catch {
      encodingSvg = false;
    }
  };

  const stream = compositeCanvas.captureStream(fps);

  let mimeType = 'video/mp4;codecs=avc1';
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm;codecs=vp9';
  }
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm';
  }

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 12_000_000, // 12 Mbps for sharp HD/4K quality
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    active = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    try {
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      // Ignore track stop errors during teardown
    }
  };

  recorder.onerror = (e: any) => {
    errored = true;
    cleanup();
    const err =
      e?.error instanceof Error
        ? e.error
        : new Error(e?.message || 'Video recording failed.');
    options.onError?.(err);
  };

  recorder.onstop = () => {
    cleanup();
    if (errored) return;
    if (cancelled) {
      options.onCancel?.();
      return;
    }

    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(chunks, { type: mimeType });
    const filename = `${projectName.toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'map-animation'}.${ext}`;

    // Trigger instant browser download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    options.onFinish?.(blob, filename);
  };

  // Report 0% immediately and drive frame 0 before starting MediaRecorder
  options.onProgress?.(0, 'Rendering frame (0%)...');
  const startPerf = performance.now();
  let lastPerf = startPerf;
  let lastReportedProgress = 0;
  let lastProgressReportTime = startPerf;
  const totalMs = durationSec * 1000;

  try {
    options.onFrame?.(0, 0, startPerf);
  } catch (err: any) {
    errored = true;
    cleanup();
    options.onError?.(err instanceof Error ? err : new Error(String(err)));
    return { stop: () => cleanup() };
  }

  updateSvgSnapshot();
  recorder.start(100);

  const renderCompositeLoop = (now: number) => {
    if (!active) return;

    const elapsedMs = Math.max(0, now - startPerf);
    const elapsedSec = Math.min(durationSec, elapsedMs / 1000);
    const dtSec = Math.max(0, (now - lastPerf) / 1000);
    lastPerf = now;

    try {
      options.onFrame?.(elapsedSec, dtSec, now);
    } catch (err: any) {
      errored = true;
      cleanup();
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          // Ignore stop errors after failure
        }
      }
      options.onError?.(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    if (ctx) {
      ctx.clearRect(0, 0, width, height);
      const rect = computeExportDrawRect(mapCanvas.width, mapCanvas.height, width, height);
      ctx.drawImage(
        mapCanvas,
        rect.sx,
        rect.sy,
        rect.sw,
        rect.sh,
        rect.dx,
        rect.dy,
        rect.dw,
        rect.dh
      );
      if (latestOverlayImg) {
        const imgW = latestOverlayImg.naturalWidth || latestOverlayImg.width || width;
        const imgH = latestOverlayImg.naturalHeight || latestOverlayImg.height || height;
        const overlayRect = computeExportDrawRect(imgW, imgH, width, height);
        ctx.drawImage(
          latestOverlayImg,
          overlayRect.sx,
          overlayRect.sy,
          overlayRect.sw,
          overlayRect.sh,
          overlayRect.dx,
          overlayRect.dy,
          overlayRect.dw,
          overlayRect.dh
        );
      }
    }

    updateSvgSnapshot();

    const progress = Math.min(100, Math.round((elapsedMs / totalMs) * 100));
    if (progress !== lastReportedProgress && (now - lastProgressReportTime >= 100 || progress === 100)) {
      lastReportedProgress = progress;
      lastProgressReportTime = now;
      options.onProgress?.(progress, `Rendering frame (${progress}%)...`);
    }

    if (elapsedMs >= totalMs) {
      active = false;
      rafId = 0;
      if (recorder.state !== 'inactive') {
        recorder.stop();
      } else {
        cleanup();
      }
      return;
    }

    rafId = requestAnimationFrame(renderCompositeLoop);
  };

  rafId = requestAnimationFrame(renderCompositeLoop);

  return {
    stop: () => {
      if (cancelled || cleanedUp) return;
      cancelled = true;
      cleanup();
      if (recorder.state !== 'inactive') {
        recorder.stop();
      } else {
        options.onCancel?.();
      }
    },
  };
}
