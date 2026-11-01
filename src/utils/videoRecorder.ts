/**
 * In-browser canvas video recording engine.
 * Records the animated map canvas directly to an MP4/WebM video file with progress updates.
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
  const canvas = mapContainer.querySelector('canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    throw new Error('No map canvas available for rendering.');
  }

  const fps = options.fps || 30;
  const stream = canvas.captureStream(fps);

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
      recorder.stop();
    }
  }, 250);

  recorder.onstop = () => {
    clearInterval(timer);
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
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    },
  };
}
