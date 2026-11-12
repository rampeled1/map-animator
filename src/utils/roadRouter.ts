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

  // Prepend the initial road coordinate so the start of the road is never dropped
  const result: RoutePoint[] = [{ lng: roadCoords[0].lng, lat: roadCoords[0].lat }];

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
  intervalKm: number | 'auto' = 0.1,
  allowDirectFallback: boolean = false
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

  if (allowDirectFallback) {
    return densifyRoadCoordinates([start, end], maxStepM);
  }

  throw new Error(`Routing calculation failed for profile "${profile}": OSRM service returned no route or was unreachable.`);
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
  { id: 'gyd', name: 'Heydar Aliyev International Airport (GYD)', context: 'Baku, Azerbaijan', fullName: 'Heydar Aliyev International Airport (GYD), Baku, Azerbaijan', lng: 50.0491, lat: 40.4728 },
  { id: 'laza', name: 'Laza', context: 'Qusar, Azerbaijan', fullName: 'Laza, Azerbaijan', lng: 48.1156, lat: 41.2969 },
  { id: 'gabala', name: 'Qabala', context: 'Azerbaijan', fullName: 'Qabala, Azerbaijan', lng: 47.87, lat: 40.9982 },
  { id: 'shaki', name: 'Sheki', context: 'Azerbaijan', fullName: 'Sheki, Azerbaijan', lng: 47.1706, lat: 41.1919 },
  { id: 'telaviv', name: 'Tel Aviv', context: 'Israel', fullName: 'Tel Aviv, Israel', lng: 34.7818, lat: 32.0853 },
  { id: 'tlv', name: 'Ben Gurion Airport (TLV)', context: 'Tel Aviv, Israel', fullName: 'Ben Gurion Airport (TLV), Tel Aviv, Israel', lng: 34.8854, lat: 32.0055 },
  { id: 'jerusalem', name: 'Jerusalem', context: 'Israel', fullName: 'Jerusalem, Israel', lng: 35.2137, lat: 31.7683 },
  { id: 'eilat', name: 'Eilat', context: 'Israel', fullName: 'Eilat, Israel', lng: 34.9482, lat: 29.5581 },
  { id: 'paris', name: 'Paris', context: 'France', fullName: 'Paris, France', lng: 2.3522, lat: 48.8566 },
  { id: 'cdg', name: 'Charles de Gaulle Airport (CDG)', context: 'Paris, France', fullName: 'Charles de Gaulle Airport (CDG), Paris, France', lng: 2.5479, lat: 49.0097 },
  { id: 'london', name: 'London', context: 'United Kingdom', fullName: 'London, United Kingdom', lng: -0.1276, lat: 51.5072 },
  { id: 'lhr', name: 'Heathrow Airport (LHR)', context: 'London, United Kingdom', fullName: 'Heathrow Airport (LHR), London, United Kingdom', lng: -0.4543, lat: 51.47 },
  { id: 'rome', name: 'Rome', context: 'Italy', fullName: 'Rome, Italy', lng: 12.4964, lat: 41.9028 },
  { id: 'fco', name: 'Fiumicino Airport (FCO)', context: 'Rome, Italy', fullName: 'Fiumicino Airport (FCO), Rome, Italy', lng: 12.2389, lat: 41.8003 },
  { id: 'berlin', name: 'Berlin', context: 'Germany', fullName: 'Berlin, Germany', lng: 13.405, lat: 52.52 },
  { id: 'ber', name: 'Berlin Brandenburg Airport (BER)', context: 'Berlin, Germany', fullName: 'Berlin Brandenburg Airport (BER), Berlin, Germany', lng: 13.5017, lat: 52.3667 },
  { id: 'newyork', name: 'New York', context: 'USA', fullName: 'New York, USA', lng: -74.006, lat: 40.7128 },
  { id: 'jfk', name: 'John F. Kennedy International Airport (JFK)', context: 'New York, USA', fullName: 'John F. Kennedy International Airport (JFK), New York, USA', lng: -73.7781, lat: 40.6413 },
  { id: 'tokyo', name: 'Tokyo', context: 'Japan', fullName: 'Tokyo, Japan', lng: 139.6917, lat: 35.6895 },
  { id: 'hnd', name: 'Tokyo Haneda Airport (HND)', context: 'Tokyo, Japan', fullName: 'Tokyo Haneda Airport (HND), Tokyo, Japan', lng: 139.7798, lat: 35.5494 },
];

function formatPlaceTitle(str: string): string {
  if (!str) return '';
  return str
    .split(/(\s+|,|-)/)
    .map((word) => {
      if (/^[A-Z0-9]{2,4}$/.test(word)) return word; // preserve acronyms like GYD, JFK, TLV, UK
      if (word.length <= 1) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join('');
}

/**
 * Searches place names with autocomplete via multi-provider fallback:
 * 1. OpenStreetMap Nominatim (supports airports, GYD, JFK, LHR, landmarks, addresses)
 * 2. Photon API mirror
 * 3. Built-in fast offline lookup
 */
export async function searchPlaceSuggestions(
  query: string,
  signal?: AbortSignal
): Promise<PlaceSuggestion[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const qWords = q.split(/\s+/).filter(Boolean);
  const localMatches = BUILTIN_PLACES.filter((p) => {
    const targetStr = `${p.fullName} ${p.name} ${p.id} ${p.context} airport aeroport`.toLowerCase();
    return (
      p.fullName.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase() === q ||
      (qWords.length > 1 && qWords.every((w) => targetStr.includes(w)))
    );
  });

  // 1. Try OpenStreetMap Nominatim first (high reliability, recognizes IATA codes like GYD, JFK, LHR)
  try {
    const nomUrl = new URL('https://nominatim.openstreetmap.org/search');
    nomUrl.searchParams.set('q', query.trim());
    nomUrl.searchParams.set('format', 'json');
    nomUrl.searchParams.set('addressdetails', '1');
    nomUrl.searchParams.set('limit', '7');
    nomUrl.searchParams.set('accept-language', 'en');

    const res = await fetch(nomUrl.toString(), {
      signal,
      headers: { 'User-Agent': 'MapAnimator/1.0' },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const results: PlaceSuggestion[] = [...localMatches];
        const seen = new Set(localMatches.map((m) => m.fullName.toLowerCase()));

        for (const item of data) {
          const lat = parseFloat(item.lat);
          const lng = parseFloat(item.lon);
          if (isNaN(lat) || isNaN(lng)) continue;

          const addr = item.address || {};
          const rawMainName = item.name || item.display_name.split(',')[0].trim();
          const mainName = formatPlaceTitle(rawMainName);
          const contextParts = [
            addr.city || addr.town || addr.village || addr.municipality || addr.county,
            addr.state,
            addr.country,
          ].filter((v, i, a) => v && v !== rawMainName && a.indexOf(v) === i)
           .map((c) => formatPlaceTitle(c));
          const context = contextParts.join(', ');
          const fullName = context ? `${mainName}, ${context}` : mainName;

          if (seen.has(fullName.toLowerCase()) || seen.has(mainName.toLowerCase())) continue;
          seen.add(fullName.toLowerCase());
          seen.add(mainName.toLowerCase());

          results.push({
            id: `osm-${item.osm_type || 'p'}-${item.osm_id || results.length}`,
            name: mainName,
            context,
            fullName,
            lng,
            lat,
          });
        }
        if (results.length > 0) return results.slice(0, 7);
      }
    }
  } catch {
    // Continue to Photon or local
  }

  // 2. Secondary fallback: Photon Komoot API
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
        const rawName = p.name || p.city || p.street;
        const coords = feat.geometry?.coordinates;
        if (!rawName || !Array.isArray(coords) || coords.length < 2) continue;
        const name = formatPlaceTitle(rawName);
        const context = [p.city, p.state, p.country]
          .filter((v, i, arr) => v && v !== rawName && arr.indexOf(v) === i)
          .map((c) => formatPlaceTitle(c))
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
      if (results.length > 0) return results.slice(0, 7);
    }
  } catch {
    // Fallback to local matches if offline or blocked
  }

  return localMatches;
}

function appendPointDeduplicated(target: RoutePoint[], pt: RoutePoint) {
  if (target.length === 0) {
    target.push(pt);
    return;
  }
  const last = target[target.length - 1];
  // Skip duplicate consecutive coordinate (within 1e-7 degrees, ~1.1cm) at segment boundaries
  if (Math.abs(last.lng - pt.lng) < 1e-7 && Math.abs(last.lat - pt.lat) < 1e-7) {
    return;
  }
  target.push(pt);
}

/**
 * Result structure containing both the full concatenated route geometry
 * and isolated per-segment geometries for multi-stop journeys.
 */
export interface JourneyCalculationResult {
  points: RoutePoint[];
  segmentGeometries: RoutePoint[][];
}

/**
 * Builds a complete multi-stop route automatically based on selected transport mode,
 * returning both the complete journey points and isolated per-segment geometries.
 * Follow Roads (OSRM) applies exclusively to: 'car', 'walking', 'bike'.
 * Free Mode (Direct / Arc Geometry) applies to: 'train', 'boat', 'plane'.
 */
export async function buildJourneyWithSegments(
  stops: { lng: number; lat: number }[],
  transportMode: string | string[] = 'car'
): Promise<JourneyCalculationResult> {
  if (stops.length === 0) return { points: [], segmentGeometries: [] };
  if (stops.length === 1) {
    const single = [{ lng: stops[0].lng, lat: stops[0].lat }];
    return { points: single, segmentGeometries: [] };
  }

  const allPoints: RoutePoint[] = [];
  appendPointDeduplicated(allPoints, { lng: stops[0].lng, lat: stops[0].lat });
  const segmentGeometries: RoutePoint[][] = [];

  for (let i = 0; i < stops.length - 1; i++) {
    const start = stops[i];
    const end = stops[i + 1];
    const mode = (Array.isArray(transportMode) ? transportMode[i] || transportMode[0] : transportMode) || 'car';

    const isPlane = ['plane', 'sportsplane', 'floatplane', 'fighter', 'bomber', 'helicopter', 'drone', 'balloon', 'sailplane', 'paramotor', 'hangglider', 'paraglider'].includes(mode);
    const isBoat = ['boat', 'sailboat', 'cruiseship', 'ferry', 'tallship', 'trimaran', 'kayak', 'raft', 'surf'].includes(mode);
    const isTrain = ['train', 'steam_train', 'funicular'].includes(mode);

    let legPoints: RoutePoint[] = [];

    if (isPlane) {
      // Free Mode (Flight Arc): Direct geographic connection with 3D parabolic elevation apex
      // Note: Artificial 12% lateral perpendicular offset removed per B16 requirement C
      const steps = 80;
      const dLng = end.lng - start.lng;
      const dLat = end.lat - start.lat;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const arc = Math.sin(t * Math.PI);
        legPoints.push({
          lng: start.lng + dLng * t,
          lat: start.lat + dLat * t,
          ele: Math.round(arc * 8500),
        });
      }
    } else if (isBoat) {
      // Free Mode (Maritime Arc): smooth curvature across water with zero elevation
      const steps = 60;
      const dLng = end.lng - start.lng;
      const dLat = end.lat - start.lat;
      const perpLng = -dLat * 0.05;
      const perpLat = dLng * 0.05;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const arc = Math.sin(t * Math.PI);
        legPoints.push({
          lng: start.lng + dLng * t + perpLng * arc,
          lat: start.lat + dLat * t + perpLat * arc,
          ele: 0,
        });
      }
    } else if (isTrain) {
      // Free Mode (Train / Rail): direct linear geodesic track with 0.1 km densification (no road/highway snapping)
      legPoints = densifyRoadCoordinates([start, end], 100);
    } else {
      // Follow Roads (OSRM Engine): car, walking, bike
      let profile: SnapProfile = 'driving';
      if (['walking', 'running', 'hiker', 'winterhike', 'swimming'].includes(mode)) {
        profile = 'walking';
      } else if (['bike', 'bicycle', 'mountainbike'].includes(mode)) {
        profile = 'cycling';
      } else {
        profile = 'driving';
      }

      legPoints = await getRoadRoute(start, end, profile, 0.1, false);
    }

    // Build isolated segment geometry for segment i
    const segPts: RoutePoint[] = [{ lng: start.lng, lat: start.lat, ele: isPlane ? 0 : (start as any).ele || 0 }];
    for (const pt of legPoints) {
      appendPointDeduplicated(allPoints, pt);
      appendPointDeduplicated(segPts, pt);
    }
    // Ensure segment cleanly terminates at end stop
    appendPointDeduplicated(segPts, { lng: end.lng, lat: end.lat, ele: isPlane ? 0 : (end as any).ele || 0 });
    segmentGeometries.push(segPts);
  }

  // Ensure destination coordinate is always preserved exactly at the end
  const destStop = stops[stops.length - 1];
  appendPointDeduplicated(allPoints, { lng: destStop.lng, lat: destStop.lat, ele: 0 });

  return { points: allPoints, segmentGeometries };
}

/**
 * Builds a complete multi-stop route automatically based on selected transport mode.
 * Preserves backwards compatibility for callers expecting Promise<RoutePoint[]>.
 */
export async function buildJourneyFromStops(
  stops: { lng: number; lat: number }[],
  transportMode: string | string[] = 'car'
): Promise<RoutePoint[]> {
  const result = await buildJourneyWithSegments(stops, transportMode);
  return result.points;
}
