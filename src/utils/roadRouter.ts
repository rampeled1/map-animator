import { RoutePoint } from '../types';

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

/**
 * Calculates a route between two points along roads or trails using the public OSRM service.
 * Falls back to a direct straight line if the service is unreachable or errors.
 */
export async function getRoadRoute(
  start: { lng: number; lat: number },
  end: { lng: number; lat: number },
  profile: SnapProfile
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
      const roadCoords = data.routes[0].geometry.coordinates;
      // Skip the first coordinate as it matches the previous point
      const sliced = roadCoords.slice(1);
      if (sliced.length > 0) {
        return sliced.map(([lng, lat]) => ({ lng, lat }));
      }
    }
  } catch (err) {\n    console.warn('Road routing request failed, falling back to direct line:', err);\n  }

  // Fallback to direct target point
  return [{ lng: end.lng, lat: end.lat }];
}
