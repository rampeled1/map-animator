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
    const rawPoints = canonical.segments.flatMap((s) => s.geometry || []);
    points = [];
    for (const pt of rawPoints) {
      if (points.length === 0) {
        points.push(pt);
      } else {
        const last = points[points.length - 1];
        if (Math.abs(last.lng - pt.lng) > 1e-7 || Math.abs(last.lat - pt.lat) > 1e-7) {
          points.push(pt);
        }
      }
    }
  }

  // Synthesize legacy legs for 3D model rendering at segment boundaries
  let pointOffset = 0;
  const legs: RouteLeg[] = [];

  for (let i = 0; i < canonical.segments.length; i++) {
    const seg = canonical.segments[i];
    let segTransport = seg.transportType;
    // Requirement D: If segment status is stale and geometry is incompatible (e.g. road geometry under Air mode),
    // do not present the old road-following geometry as the newly selected Air route.
    if (seg.status === 'stale') {
      const isAir = ['plane', 'sportsplane', 'floatplane', 'fighter', 'bomber', 'helicopter', 'drone', 'balloon', 'sailplane', 'paramotor', 'hangglider', 'paraglider'].includes(segTransport);
      const segPoints = seg.geometry && seg.geometry.length > 0 ? seg.geometry : points;
      const hasAirEle = segPoints.some((p) => (p.ele || 0) > 0);
      if (isAir && !hasAirEle && segPoints.length > 2) {
        segTransport = 'car';
      }
    }

    legs.push({
      id: seg.id,
      fromPointIndex: pointOffset,
      transportType: segTransport as any,
      use3dSymbol: seg.use3dSymbol ?? true,
      color: seg.color || canonical.color,
      lineStyle: seg.lineStyle || canonical.style,
    });
    const segLen = (seg.geometry || []).length;
    pointOffset += Math.max(0, segLen > 1 ? segLen - 1 : segLen);
  }

  let primaryTransport = canonical.segments[0]?.transportType || 'car';
  if (canonical.status === 'stale' || canonical.segments[0]?.status === 'stale') {
    const isAir = ['plane', 'sportsplane', 'floatplane', 'fighter', 'bomber', 'helicopter', 'drone', 'balloon', 'sailplane', 'paramotor', 'hangglider', 'paraglider'].includes(primaryTransport);
    const hasAirEle = points.some((p) => (p.ele || 0) > 0);
    if (isAir && !hasAirEle && points.length > 2) {
      primaryTransport = 'car';
    }
  }

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
