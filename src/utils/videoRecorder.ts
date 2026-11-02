/**
 * In-browser composite canvas video recording engine.
 * Combines the 3D MapLibre WebGL canvas AND the SVG route/sign/HUD overlays
 * into a single high-bitrate MP4/WebM video stream.
 */

export interface RenderOptions {
  durationSec: number;
  fps: number;
  onProgress?: (percent: number, text: string) => void;
  onFinish?: (blob: Blob, filename: string) => void;
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
  const width = mapCanvas.width || 1280;
  const height = mapCanvas.height || 720;

  // Offscreen composite canvas combining WebGL map + SVG overlays
  const compositeCanvas = document.createElement('canvas');
  compositeCanvas.width = width;
  compositeCanvas.height = height;
  const ctx = compositeCanvas.getContext('2d');

  let active = true;
  let latestOverlayImg: HTMLImageElement | null = null;
  let encodingSvg = false;

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

  let rafId = 0;
  const renderCompositeLoop = () => {
    if (!active) return;
    if (ctx) {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(mapCanvas, 0, 0, width, height);
      if (latestOverlayImg) {
        ctx.drawImage(latestOverlayImg, 0, 0, width, height);
      }
    }
    updateSvgSnapshot();
    rafId = requestAnimationFrame(renderCompositeLoop);
  };
  renderCompositeLoop();

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

  const startTime = Date.now();
  const totalMs = options.durationSec * 1000;

  const timer = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(100, Math.round((elapsed / totalMs) * 100));
    options.onProgress?.(progress, `Rendering frame (${progress}%)...`);

    if (elapsed >= totalMs) {
      clearInterval(timer);
      active = false;
      cancelAnimationFrame(rafId);
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    }
  }, 250);

  recorder.onstop = () => {
    clearInterval(timer);
    active = false;
    cancelAnimationFrame(rafId);
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

  recorder.start(100);

  return {
    stop: () => {
      clearInterval(timer);
      active = false;
      cancelAnimationFrame(rafId);
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    },
  };
}
