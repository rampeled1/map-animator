import type { RoutePoint } from '../types/index.ts';

export type SnapProfile = 'off' | 'driving' | 'cycling' | 'walking';

interface OSRMRouteResponse {
  code: string;
  routes?: Array<{
    geometry: {
      coordinates: [number, number][]; // [lng, lat]
    };
    distance: number; // in meters
    duration: number; // in seconds
  }>;
}

const PROFILE_ENDPOINTS: Record<Exclude<SnapProfile, 'off'>, string> = {
  driving: 'driving',
  cycling: 'bike',
  walking: 'foot',
};

function haversineDistanceM(
  p1: { lng: number; lat: number },
  p2: { lng: number; lat: number }
): number {
  const R = 6371e3;
  const phi1 = (p1.lat * Math.PI) / 180;
  const phi2 = (p2.lat * Math.PI) / 180;
  const dPhi = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLambda = ((p2.lng - p1.lng) * Math.PI) / 180;

  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Resamples coordinates along a polyline to place a point at every `intervalKm` (0.1 to 20 km),
 * interpolating between vertices and always including the destination point.
 */
export function resampleRouteByDistance(
  coords: { lng: number; lat: number }[],
  intervalKm: number
): RoutePoint[] {
  if (coords.length <= 1) return coords.map((c) => ({ lng: c.lng, lat: c.lat }));

  const stepM = Math.max(100, Math.min(20000, intervalKm * 1000)); // 0.1 km (100m) to 20 km (20,000m)
  const result: RoutePoint[] = [];

  let accumulatedM = 0;
  let nextTargetM = stepM;

  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const segDistM = haversineDistanceM(p1, p2);

    while (accumulatedM + segDistM >= nextTargetM) {
      const remainingM = nextTargetM - accumulatedM;
      const t = segDistM > 0 ? remainingM / segDistM : 0;
      const interpLng = p1.lng + (p2.lng - p1.lng) * t;
      const interpLat = p1.lat + (p2.lat - p1.lat) * t;
      result.push({ lng: interpLng, lat: interpLat });
      nextTargetM += stepM;
    }

    accumulatedM += segDistM;
  }

  // Always append the final target point if not already added closely
  const finalPt = coords[coords.length - 1];
  if (
    result.length === 0 ||
    haversineDistanceM(result[result.length - 1], finalPt) > 10
  ) {
    result.push({ lng: finalPt.lng, lat: finalPt.lat });
  }

  return result;
}

/**
 * Calculates a route between two points along roads or trails using the public OSRM service.
 * Supports auto point spacing (all road curvature points) or fixed interval (0.1 to 20 km).
 * Falls back to a direct straight line if the service is unreachable or errors.
 */
export async function getRoadRoute(
  start: { lng: number; lat: number },
  end: { lng: number; lat: number },
  profile: SnapProfile,
  intervalKm: number | 'auto' = 'auto'
): Promise<RoutePoint[]> {
  if (profile === 'off') {
    return [{ lng: end.lng, lat: end.lat }];
  }

  const osrmProfile = PROFILE_ENDPOINTS[profile] || 'driving';
  const coords = `${start.lng.toFixed(6)},${start.lat.toFixed(6)};${end.lng.toFixed(6)},${end.lat.toFixed(6)}`;
  const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${coords}?overview=full&geometries=geojson`;

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Routing HTTP error: ${res.status}`);
    }

    const data: OSRMRouteResponse = await res.json();
    if (data.code === 'Ok' && data.routes && data.routes[0]) {
      const roadCoords = data.routes[0].geometry.coordinates.map(([lng, lat]) => ({ lng, lat }));

      // Custom point interval: resample every 0.1 - 20 km
      if (typeof intervalKm === 'number' && intervalKm >= 0.1 && intervalKm <= 20) {
        return resampleRouteByDistance(roadCoords, intervalKm);
      }

      // 'auto' mode: retain all natural road curvature points
      const sliced = roadCoords.slice(1);
      if (sliced.length > 0) {
        return sliced;
      }
    }
  } catch (err) {
    console.warn('Road routing request failed, falling back to direct line:', err);
  }

  // Fallback to direct target point
  return [{ lng: end.lng, lat: end.lat }];
}
