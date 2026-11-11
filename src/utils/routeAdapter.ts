import type {
  CanonicalRoute,
  Route,
  RoutePoint,
  RouteLeg,
} from '../types/index';

/**
 * Adapter that provides a legacy-compatible Route object derived directly from
 * the canonical MapProject.routes[0], ensuring MapViewer and other legacy UI
 * components receive accurate geometry and styling without maintaining duplicate state.
 */
export function getAdaptedCanonicalRoute(canonical?: CanonicalRoute): Route {
  if (!canonical) {
    return {
      id: 'route-default',
      name: 'Main Journey',
      color: '#ff4d2e',
      width: 8,
      style: 'solid',
      transportType: 'car',
      legs: [],
      points: [],
      stats: {
        distanceKm: 0,
        elevationGainM: 0,
        elevationLossM: 0,
      },
    };
  }

  // Build points array from calculatedGeometry (or synthesize from segments if geometry empty)
  let points: RoutePoint[] = canonical.calculatedGeometry || [];
  if (points.length === 0 && canonical.segments.length > 0) {
    points = canonical.segments.flatMap((s) => s.geometry || []);
  }

  // Synthesize legacy legs for 3D model rendering at segment boundaries
  let pointOffset = 0;
  const legs: RouteLeg[] = [];

  for (let i = 0; i < canonical.segments.length; i++) {
    const seg = canonical.segments[i];
    legs.push({
      id: seg.id,
      fromPointIndex: pointOffset,
      transportType: seg.transportType as any,
      use3dSymbol: seg.use3dSymbol ?? true,
      color: seg.color || canonical.color,
      lineStyle: seg.lineStyle || canonical.style,
    });
    pointOffset += (seg.geometry || []).length;
  }

  const primaryTransport = canonical.segments[0]?.transportType || 'car';

  return {
    id: canonical.id,
    name: canonical.name,
    color: canonical.color,
    width: canonical.width,
    style: canonical.style,
    transportType: primaryTransport as any,
    hideLine: canonical.hideLine,
    symbolScale: canonical.symbolScale,
    startOffsetSec: canonical.startOffsetSec,
    legs,
    points,
    stats: canonical.stats,
  };
}
