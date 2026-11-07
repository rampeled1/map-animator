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
 * Preserves all natural road curvature, turns, and roundabouts from the routing engine,
 * while ensuring that straight stretches have points at least every `maxStepM` (default 100m / 0.1 km).
 */
export function densifyRoadCoordinates(
  roadCoords: { lng: number; lat: number }[],
  maxStepM: number = 100
): RoutePoint[] {
  if (roadCoords.length <= 1) {
    return roadCoords.map((c) => ({ lng: c.lng, lat: c.lat }));
  }

  const result: RoutePoint[] = [];

  for (let i = 0; i < roadCoords.length - 1; i++) {
    const p1 = roadCoords[i];
    const p2 = roadCoords[i + 1];
    const segDistM = haversineDistanceM(p1, p2);

    if (segDistM <= maxStepM) {
      // Retain natural road curve vertex
      result.push({ lng: p2.lng, lat: p2.lat });
    } else {
      // Subdivide long straight stretch into points every ~maxStepM (0.1 km)
      const numSteps = Math.ceil(segDistM / maxStepM);
      for (let s = 1; s <= numSteps; s++) {
        const t = s / numSteps;
        result.push({
          lng: p1.lng + t * (p2.lng - p1.lng),
          lat: p1.lat + t * (p2.lat - p1.lat),
        });
      }
    }
  }

  return result;
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
 * Follows actual road curvature faithfully in car mode with intermediate points every 0.1 km.
 * Falls back to a 0.1km densified line if the service is unreachable or offline.
 */
export async function getRoadRoute(
  start: { lng: number; lat: number },
  end: { lng: number; lat: number },
  profile: SnapProfile = 'driving',
  intervalKm: number | 'auto' = 0.1
): Promise<RoutePoint[]> {
  const maxStepM = typeof intervalKm === 'number' ? intervalKm * 1000 : 100;

  if (profile === 'off') {
    return densifyRoadCoordinates([start, end], maxStepM);
  }

  const osrmProfile = PROFILE_ENDPOINTS[profile] || 'driving';
  const coords = `${start.lng.toFixed(6)},${start.lat.toFixed(6)};${end.lng.toFixed(6)},${end.lat.toFixed(6)}`;

  const mirrorUrls = [
    `https://router.project-osrm.org/route/v1/${osrmProfile}/${coords}?overview=full&geometries=geojson`,
    `https://routing.openstreetmap.de/routed-${osrmProfile === 'driving' ? 'car' : osrmProfile === 'bike' ? 'bike' : 'foot'}/route/v1/${osrmProfile}/${coords}?overview=full&geometries=geojson`,
  ];

  for (const url of mirrorUrls) {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timeout);

      if (res.ok) {
        const data: OSRMRouteResponse = await res.json();
        if (data.code === 'Ok' && data.routes && data.routes[0]?.geometry?.coordinates) {
          const roadCoords = data.routes[0].geometry.coordinates.map(([lng, lat]) => ({ lng, lat }));
          if (roadCoords.length > 1) {
            // Follow road curvature completely, densifying long straight segments every 0.1 km
            return densifyRoadCoordinates(roadCoords, maxStepM);
          }
        }
      }
    } catch {
      // Continue to next routing mirror
    }
  }

  // Fallback: accurately densify direct connection with points every 0.1 km (100m)
  return densifyRoadCoordinates([start, end], maxStepM);
}

export interface PlaceSuggestion {
  id: string;
  name: string;
  context: string;
  fullName: string;
  lng: number;
  lat: number;
}

const BUILTIN_PLACES: PlaceSuggestion[] = [
  { id: 'baku', name: 'Baku', context: 'Azerbaijan', fullName: 'Baku, Azerbaijan', lng: 49.8671, lat: 40.4093 },
  { id: 'laza', name: 'Laza', context: 'Qusar, Azerbaijan', fullName: 'Laza, Azerbaijan', lng: 48.1156, lat: 41.2969 },
  { id: 'gabala', name: 'Qabala', context: 'Azerbaijan', fullName: 'Qabala, Azerbaijan', lng: 47.87, lat: 40.9982 },
  { id: 'shaki', name: 'Sheki', context: 'Azerbaijan', fullName: 'Sheki, Azerbaijan', lng: 47.1706, lat: 41.1919 },
  { id: 'telaviv', name: 'Tel Aviv', context: 'Israel', fullName: 'Tel Aviv, Israel', lng: 34.7818, lat: 32.0853 },
  { id: 'jerusalem', name: 'Jerusalem', context: 'Israel', fullName: 'Jerusalem, Israel', lng: 35.2137, lat: 31.7683 },
  { id: 'eilat', name: 'Eilat', context: 'Israel', fullName: 'Eilat, Israel', lng: 34.9482, lat: 29.5581 },
  { id: 'paris', name: 'Paris', context: 'France', fullName: 'Paris, France', lng: 2.3522, lat: 48.8566 },
  { id: 'london', name: 'London', context: 'United Kingdom', fullName: 'London, United Kingdom', lng: -0.1276, lat: 51.5072 },
  { id: 'rome', name: 'Rome', context: 'Italy', fullName: 'Rome, Italy', lng: 12.4964, lat: 41.9028 },
  { id: 'berlin', name: 'Berlin', context: 'Germany', fullName: 'Berlin, Germany', lng: 13.405, lat: 52.52 },
  { id: 'newyork', name: 'New York', context: 'USA', fullName: 'New York, USA', lng: -74.006, lat: 40.7128 },
  { id: 'tokyo', name: 'Tokyo', context: 'Japan', fullName: 'Tokyo, Japan', lng: 139.6917, lat: 35.6895 },
];

/**
 * Searches place names with autocomplete via Photon API and instant built-in fallback.
 */
export async function searchPlaceSuggestions(
  query: string,
  signal?: AbortSignal
): Promise<PlaceSuggestion[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const localMatches = BUILTIN_PLACES.filter(
    (p) => p.fullName.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
  );

  try {
    const url = new URL('https://photon.komoot.io/api/');
    url.searchParams.set('q', query.trim());
    url.searchParams.set('limit', '6');
    url.searchParams.set('lang', 'en');
    const res = await fetch(url.toString(), { signal });
    if (res.ok) {
      const data = await res.json();
      const results: PlaceSuggestion[] = [...localMatches];
      const seen = new Set(localMatches.map((m) => m.fullName.toLowerCase()));

      for (const feat of data.features ?? []) {
        const p = feat.properties ?? {};
        const name = p.name || p.city || p.street;
        const coords = feat.geometry?.coordinates;
        if (!name || !Array.isArray(coords) || coords.length < 2) continue;
        const context = [p.city, p.state, p.country]
          .filter((v, i, arr) => v && v !== name && arr.indexOf(v) === i)
          .join(', ');
        const fullName = context ? `${name}, ${context}` : name;
        if (seen.has(fullName.toLowerCase())) continue;
        seen.add(fullName.toLowerCase());
        results.push({
          id: `${p.osm_type ?? 'p'}-${p.osm_id ?? results.length}`,
          name,
          context,
          fullName,
          lng: Number(coords[0]),
          lat: Number(coords[1]),
        });
      }
      return results.slice(0, 7);
    }
  } catch {
    // Fallback to local matches if offline
  }

  return localMatches;
}

/**
 * Builds a complete multi-stop route automatically based on selected transport mode.
 * Automatically picks road routing for Car/Walk/Bike or smooth curved flight arc for Plane.
 */
export async function buildJourneyFromStops(
  stops: { lng: number; lat: number }[],
  transportMode: string = 'car'
): Promise<RoutePoint[]> {
  if (stops.length === 0) return [];
  if (stops.length === 1) return [{ lng: stops[0].lng, lat: stops[0].lat }];

  const isAirOrSea = ['plane', 'sportsplane', 'floatplane', 'fighter', 'bomber', 'helicopter', 'drone', 'balloon', 'boat', 'sailboat', 'cruiseship', 'ferry'].includes(transportMode);

  let profile: SnapProfile = 'driving';
  if (['walking', 'running', 'hiker', 'winterhike'].includes(transportMode)) {
    profile = 'walking';
  } else if (['bicycle', 'mountainbike'].includes(transportMode)) {
    profile = 'cycling';
  } else if (isAirOrSea) {
    profile = 'off';
  }

  const allPoints: RoutePoint[] = [{ lng: stops[0].lng, lat: stops[0].lat }];

  for (let i = 0; i < stops.length - 1; i++) {
    const start = stops[i];
    const end = stops[i + 1];

    if (isAirOrSea) {
      // Create a smooth flight/maritime arc with 80 points
      const steps = 80;
      const dLng = end.lng - start.lng;
      const dLat = end.lat - start.lat;
      // Subtle perpendicular arc offset for visual appeal on flights
      const perpLng = -dLat * 0.12;
      const perpLat = dLng * 0.12;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const arc = Math.sin(t * Math.PI);
        allPoints.push({
          lng: start.lng + dLng * t + perpLng * arc,
          lat: start.lat + dLat * t + perpLat * arc,
          ele: Math.round(arc * 8500),
        });
      }
    } else {
      const legPoints = await getRoadRoute(start, end, profile, 0.1);
      allPoints.push(...legPoints);
    }
  }

  return allPoints;
}
