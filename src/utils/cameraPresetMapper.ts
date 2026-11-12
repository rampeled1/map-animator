import type {
  CameraBlock,
  CameraModePreset,
  CameraSettings,
  RoutePoint,
} from '../types/index.ts';

export interface RouteBounds {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/**
 * Computes bounding box from route points
 */
export function computeRouteBounds(points: RoutePoint[]): RouteBounds | null {
  if (!points || points.length === 0) return null;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;
  let minLat = points[0].lat;
  let maxLat = points[0].lat;

  for (let i = 1; i < points.length; i++) {
    const pt = points[i];
    if (pt.lng < minLng) minLng = pt.lng;
    if (pt.lng > maxLng) maxLng = pt.lng;
    if (pt.lat < minLat) minLat = pt.lat;
    if (pt.lat > maxLat) maxLat = pt.lat;
  }

  return { minLng, minLat, maxLng, maxLat };
}

/**
 * Maps a CameraModePreset into a primary CameraBlock covering [0, duration].
 * Tripod and Orbit blocks remain preserved separately in the project timeline.
 */
export function mapPresetToCameraBlocks(
  preset: CameraModePreset,
  points: RoutePoint[],
  settings?: Partial<CameraSettings>
): CameraBlock[] {
  const centerPoint: [number, number] =
    points && points.length > 0
      ? [points[0].lng, points[0].lat]
      : [0, 0];

  const bounds = computeRouteBounds(points);
  const midPoint: [number, number] = bounds
    ? [(bounds.minLng + bounds.maxLng) / 2, (bounds.minLat + bounds.maxLat) / 2]
    : centerPoint;

  switch (preset) {
    case 'fly_along':
      return [
        {
          id: `cam-${Date.now()}-fly-along`,
          tRatio: 0,
          kind: 'follow',
          followOrient: 'heading', // direction_of_travel
          center: centerPoint,
          pitch: settings?.pitch ?? 50,
          zoom: settings?.zoom ?? 12,
          bearing: settings?.bearing ?? 0,
          easing: 'smooth',
        },
      ];

    case 'follow_north_up':
      return [
        {
          id: `cam-${Date.now()}-north-up`,
          tRatio: 0,
          kind: 'follow',
          followOrient: 'north', // same_direction_up
          center: centerPoint,
          pitch: settings?.pitch ?? 35,
          zoom: settings?.zoom ?? 14,
          bearing: 0,
          easing: 'smooth',
        },
      ];

    case 'whole_tour':
      return [
        {
          id: `cam-${Date.now()}-whole-tour`,
          tRatio: 0,
          kind: 'still',
          center: midPoint,
          pitch: settings?.pitch ?? 10,
          zoom: settings?.zoom ?? 10, // Dynamic fitBounds applied by MapViewer
          bearing: 0,
          easing: 'smooth',
        },
      ];

    default:
      return [
        {
          id: `cam-${Date.now()}-default`,
          tRatio: 0,
          kind: 'follow',
          followOrient: 'heading',
          center: centerPoint,
          pitch: 55,
          zoom: 15,
          bearing: 0,
        },
      ];
  }
}
