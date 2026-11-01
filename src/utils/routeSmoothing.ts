import { RoutePoint } from '../types';

/**
 * Chaikin's algorithm for curve smoothing (Make it smooth in Route menu)
 */
export function chaikinSmooth(points: RoutePoint[], iterations: number = 2): RoutePoint[] {
  if (points.length <= 2) return points;

  let current = [...points];

  for (let it = 0; it < iterations; it++) {
    const smoothed: RoutePoint[] = [];
    smoothed.push(current[0]);

    for (let i = 0; i < current.length - 1; i++) {
      const p0 = current[i];
      const p1 = current[i + 1];

      // If either point is marked as a sharp corner, don't round across it
      if (p0.sharpCorner || p1.sharpCorner) {
        smoothed.push(p0);
        smoothed.push(p1);
        continue;
      }

      const q: RoutePoint = {
        lng: 0.75 * p0.lng + 0.25 * p1.lng,
        lat: 0.75 * p0.lat + 0.25 * p1.lat,
        ele: p0.ele !== undefined && p1.ele !== undefined ? 0.75 * p0.ele + 0.25 * p1.ele : p0.ele,
        time: p0.time !== undefined && p1.time !== undefined ? Math.round(0.75 * p0.time + 0.25 * p1.time) : p0.time,
      };

      const r: RoutePoint = {
        lng: 0.25 * p0.lng + 0.75 * p1.lng,
        lat: 0.25 * p0.lat + 0.75 * p1.lat,
        ele: p0.ele !== undefined && p1.ele !== undefined ? 0.25 * p0.ele + 0.75 * p1.ele : p1.ele,
        time: p0.time !== undefined && p1.time !== undefined ? Math.round(0.25 * p0.time + 0.75 * p1.time) : p1.time,
      };

      smoothed.push(q);
      smoothed.push(r);
    }

    smoothed.push(current[current.length - 1]);
    current = smoothed;
  }

  return current;
}
