/**
 * routeProjection.ts
 *
 * Perspective-safe near-plane frustum projection for SVG routes (Option A).
 * Guarantees that points behind the camera eye plane (w <= 0.05) are clipped at the near plane
 * and split into independent subpaths with disjoint M commands, preventing inverted diagonal line artifacts.
 */

import maplibregl from 'maplibre-gl';

export interface OptionARouteProjection {
  d: string;
  startDotPos: [number, number] | null;
  tipPos: [number, number] | null;
  headAngle: number;
}

/**
 * Calculates the homogeneous clip-space w coordinate for a geographic point.
 * In MapLibre's camera projection:
 * - w > 0.05 indicates the point is strictly in front of the camera's near clipping plane.
 * - w <= 0.05 indicates the point is behind the camera eye plane or within the near clip singularity zone.
 */
export function getCameraClipW(
  mapInstance: maplibregl.Map,
  lng: number,
  lat: number,
  ele: number = 0
): number {
  const tr = (mapInstance as any).transform;
  if (!tr || !tr._pixelMatrix) return 1.0;
  const m = tr._pixelMatrix;
  const ws = tr.worldSize || 1;
  const mc = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], ele);
  const x = mc.x * ws;
  const y = mc.y * ws;
  const z = mc.z * ws;
  return m[3] * x + m[7] * y + m[11] * z + m[15];
}

/**
 * Computes perspective-safe near-plane frustum projection for SVG routes (Option A).
 */
export function computeOptionARouteProjection(
  map: maplibregl.Map,
  currentPoints: { lng: number; lat: number; ele?: number }[],
  fallbackHeadingDeg: number = 0
): OptionARouteProjection {
  const W_NEAR_MIN = 0.05;
  const projectedSubpaths: [number, number][][] = [];
  let currentProjSegment: [number, number][] = [];
  let lastPx = -9999;
  let lastPy = -9999;

  if (currentPoints.length === 1) {
    const w0 = getCameraClipW(map, currentPoints[0].lng, currentPoints[0].lat, currentPoints[0].ele || 0);
    if (w0 > W_NEAR_MIN) {
      const p = map.project([currentPoints[0].lng, currentPoints[0].lat]);
      currentProjSegment.push([p.x, p.y]);
      projectedSubpaths.push(currentProjSegment);
    }
  } else if (currentPoints.length > 1) {
    for (let i = 0; i < currentPoints.length - 1; i++) {
      const p0 = currentPoints[i];
      const p1 = currentPoints[i + 1];
      const w0 = getCameraClipW(map, p0.lng, p0.lat, p0.ele || 0);
      const w1 = getCameraClipW(map, p1.lng, p1.lat, p1.ele || 0);

      if (w0 > W_NEAR_MIN && w1 > W_NEAR_MIN) {
        if (currentProjSegment.length === 0) {
          const pr0 = map.project([p0.lng, p0.lat]);
          currentProjSegment.push([pr0.x, pr0.y]);
          lastPx = pr0.x;
          lastPy = pr0.y;
        }
        const pr1 = map.project([p1.lng, p1.lat]);
        if (Math.abs(pr1.x - lastPx) >= 1.5 || Math.abs(pr1.y - lastPy) >= 1.5 || i === currentPoints.length - 2) {
          currentProjSegment.push([pr1.x, pr1.y]);
          lastPx = pr1.x;
          lastPy = pr1.y;
        }
      } else if (w0 <= W_NEAR_MIN && w1 > W_NEAR_MIN) {
        if (currentProjSegment.length > 0) {
          projectedSubpaths.push(currentProjSegment);
          currentProjSegment = [];
        }
        const t = Math.max(0, Math.min(1, (W_NEAR_MIN - w0) / (w1 - w0)));
        const clippedLng = p0.lng + t * (p1.lng - p0.lng);
        const clippedLat = p0.lat + t * (p1.lat - p0.lat);
        const cp = map.project([clippedLng, clippedLat]);
        const pr1 = map.project([p1.lng, p1.lat]);

        currentProjSegment.push([cp.x, cp.y]);
        currentProjSegment.push([pr1.x, pr1.y]);
        lastPx = pr1.x;
        lastPy = pr1.y;
      } else if (w0 > W_NEAR_MIN && w1 <= W_NEAR_MIN) {
        if (currentProjSegment.length === 0) {
          const pr0 = map.project([p0.lng, p0.lat]);
          currentProjSegment.push([pr0.x, pr0.y]);
        }
        const t = Math.max(0, Math.min(1, (W_NEAR_MIN - w0) / (w1 - w0)));
        const clippedLng = p0.lng + t * (p1.lng - p0.lng);
        const clippedLat = p0.lat + t * (p1.lat - p0.lat);
        const cp = map.project([clippedLng, clippedLat]);

        currentProjSegment.push([cp.x, cp.y]);
        projectedSubpaths.push(currentProjSegment);
        currentProjSegment = [];
        lastPx = -9999;
        lastPy = -9999;
      } else {
        if (currentProjSegment.length > 0) {
          projectedSubpaths.push(currentProjSegment);
          currentProjSegment = [];
          lastPx = -9999;
          lastPy = -9999;
        }
      }
    }

    if (currentProjSegment.length > 0) {
      projectedSubpaths.push(currentProjSegment);
    }
  }

  const d = projectedSubpaths
    .filter((sub) => sub.length >= 2)
    .map((sub) =>
      sub.map((p, idx) => `${idx ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('')
    )
    .join(' ');

  let headAngle = 0;
  let tipPos: [number, number] | null = null;
  if (projectedSubpaths.length > 0) {
    const lastSub = projectedSubpaths[projectedSubpaths.length - 1];
    if (lastSub.length >= 2) {
      const tip = lastSub[lastSub.length - 1];
      const prev = lastSub[lastSub.length - 2];
      headAngle = (Math.atan2(tip[1] - prev[1], tip[0] - prev[0]) * 180) / Math.PI;
      tipPos = tip;
    } else if (lastSub.length === 1) {
      tipPos = lastSub[0];
      headAngle = fallbackHeadingDeg - map.getBearing() - 90;
    }
  }

  const wStart =
    currentPoints.length > 0
      ? getCameraClipW(map, currentPoints[0].lng, currentPoints[0].lat, currentPoints[0].ele || 0)
      : 0;
  const startDotPos: [number, number] | null =
    wStart > W_NEAR_MIN && currentPoints.length > 0
      ? (() => {
          const sp = map.project([currentPoints[0].lng, currentPoints[0].lat]);
          return [sp.x, sp.y] as [number, number];
        })()
      : null;

  return { d, startDotPos, tipPos, headAngle };
}
