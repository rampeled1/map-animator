import type { RoutePoint } from '../types/index.ts';

/**
 * Geodesic distance in meters between two lat/lng points (Haversine formula)
 */
export function haversineMeters(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinLng *
      sinLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface SnakePathSample {
  tipPoint: RoutePoint;
  headingDeg: number;
  drawnPoints: RoutePoint[];
  segmentIndex: number;
}

/**
 * Calculates continuous sub-pixel / sub-segment path drawing and vehicle tip kinematics.
 * Moves continuously and smoothly like a snake rather than jumping between discrete waypoints.
 */
export function getSmoothSnakePath(
  rawPoints: RoutePoint[],
  progress: number
): SnakePathSample | null {
  if (!rawPoints || rawPoints.length === 0) return null;
  const pClamped = Math.max(0, Math.min(1, progress));

  if (rawPoints.length === 1 || pClamped <= 0) {
    const first = rawPoints[0];
    let initialHeading = 0;
    if (rawPoints.length >= 2) {
      const dLng = rawPoints[1].lng - first.lng;
      const dLat = rawPoints[1].lat - first.lat;
      initialHeading = ((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360;
    }
    return {
      tipPoint: { ...first },
      headingDeg: initialHeading,
      drawnPoints: [{ ...first }],
      segmentIndex: 0,
    };
  }

  // Pre-calculate cumulative geodesic distances
  const cumDists: number[] = [0];
  for (let i = 0; i < rawPoints.length - 1; i++) {
    const d = haversineMeters(rawPoints[i], rawPoints[i + 1]);
    cumDists.push(cumDists[i] + Math.max(d, 0.001));
  }
  const totalDist = cumDists[cumDists.length - 1];

  if (pClamped >= 1) {
    const last = rawPoints[rawPoints.length - 1];
    const prev = rawPoints[Math.max(0, rawPoints.length - 2)];
    const dLng = last.lng - prev.lng;
    const dLat = last.lat - prev.lat;
    const finalHeading = ((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360;
    return {
      tipPoint: { ...last },
      headingDeg: finalHeading,
      drawnPoints: rawPoints.map((pt) => ({ ...pt })),
      segmentIndex: rawPoints.length - 2,
    };
  }

  // Target distance along trajectory
  const targetDist = pClamped * totalDist;
  let segIdx = 0;
  while (segIdx < cumDists.length - 2 && cumDists[segIdx + 1] < targetDist) {
    segIdx++;
  }

  const segStartDist = cumDists[segIdx];
  const segEndDist = cumDists[segIdx + 1];
  const segLen = segEndDist - segStartDist;
  const u = segLen > 0 ? (targetDist - segStartDist) / segLen : 0;

  const p0 = rawPoints[segIdx];
  const p1 = rawPoints[segIdx + 1];

  // Continuous linear interpolation within segment
  const tipLng = p0.lng + u * (p1.lng - p0.lng);
  const tipLat = p0.lat + u * (p1.lat - p0.lat);
  const tipEle =
    p0.ele !== undefined && p1.ele !== undefined
      ? p0.ele + u * (p1.ele - p0.ele)
      : p0.ele;

  const tipPoint: RoutePoint = {
    lng: tipLng,
    lat: tipLat,
    ele: tipEle,
  };

  // Compute smooth heading angle at current progress
  // Blend with surrounding direction to prevent abrupt snapping around corners
  const segHeading = ((Math.atan2(p1.lng - p0.lng, p1.lat - p0.lat) * 180) / Math.PI + 360) % 360;
  let smoothHeading = segHeading;

  // If nearing the end of this segment and the next corner is not sharp, smoothly transition heading
  if (!p1.sharpCorner && segIdx < rawPoints.length - 2 && u > 0.75) {
    const p2 = rawPoints[segIdx + 2];
    const nextHeading = ((Math.atan2(p2.lng - p1.lng, p2.lat - p1.lat) * 180) / Math.PI + 360) % 360;
    // Calculate shortest angular difference
    let diff = (nextHeading - segHeading + 540) % 360 - 180;
    const blendFactor = (u - 0.75) / 0.25; // 0 to 1 over last 25% of segment
    smoothHeading = (segHeading + diff * blendFactor + 360) % 360;
  }

  // Points drawn up to current tip
  const drawnPoints: RoutePoint[] = [
    ...rawPoints.slice(0, segIdx + 1).map((pt) => ({ ...pt })),
    tipPoint,
  ];

  return {
    tipPoint,
    headingDeg: smoothHeading,
    drawnPoints,
    segmentIndex: segIdx,
  };
}

/**
 * Convenient helper to fetch vehicle coordinate tip at normalized progress t in [0, 1]
 */
export function getPositionAtProgress(
  points: RoutePoint[],
  progress: number
): RoutePoint | null {
  const sample = getSmoothSnakePath(points, progress);
  return sample ? sample.tipPoint : null;
}

