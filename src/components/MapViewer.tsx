import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { Route, MapSign, CameraBlock, StepId, OverlayConfig, TransportType, CameraModePreset, AspectRatioOption, DestinationPreview, CanonicalRoute } from '../types';
import { buildMapStyle } from '../utils/mapStyleBuilder';
import { calculateTrackStats } from '../utils/gpxParser';
import { ThreeMapLayer } from '../utils/threeMapLayer';
import { ModelKind3D } from '../utils/vehicle3DManager';
import { getSmoothSnakePath } from '../utils/snakePathInterpolation';
import { computeRouteBounds } from '../utils/cameraPresetMapper';
import { WaypointOptionsModal } from './WaypointOptionsModal';

function mapTransportTo3DModel(transport?: TransportType): ModelKind3D {
  if (!transport) return 'tank';
  if (['tank', 'trooper', 'battleship', 'carrier', 'submarine'].includes(transport)) return 'tank';
  if (['armytruck', 'semitruck', 'pickup', 'minibus', 'bus'].includes(transport)) return 'armored';
  if (['fighter', 'bomber', 'plane', 'sportsplane', 'floatplane', 'sailplane'].includes(transport))
    return 'fighter';
  if (['drone', 'helicopter', 'paramotor', 'balloon', 'paraglider'].includes(transport))
    return 'drone';
  return 'car';
}

interface MapViewerProps {
  themeId: string;
  mapLabels?: boolean;
  labelLang?: string;
  regions?: boolean;
  terrain?: boolean;
  aspect?: '16:9' | '9:16' | '1:1' | '4:5' | '4:3' | '21:9';
  aspectRatio?: AspectRatioOption;
  size?: 480 | 720 | 1080 | 1440 | 2160;
  routes: Route[];
  currentStep?: StepId;
  activeRouteId?: string;
  signs?: MapSign[];
  cameraBlock?: CameraBlock;
  cameraBlocks?: CameraBlock[];
  currentTime?: number;
  duration?: number;
  overlays?: OverlayConfig;
  cameraMode?: 'follow' | 'still' | 'orbit' | 'tripod';
  cameraPreset?: CameraModePreset;
  followOrient?: 'north' | 'heading';
  rotateOffset?: number;
  followZoom?: number;
  tilt?: number;
  lookAhead?: number;
  distanceKm?: number;
  heightKm?: number;
  orbitDirection?: 'clockwise' | 'anticlockwise';
  includeMapCredit?: boolean;
  isPlaying?: boolean;
  fitRouteRequested?: Route | null;
  destinationPreview?: DestinationPreview | null;
  isQuickPreviewActive?: boolean;
  quickPreviewProgress?: number;
  quickPreviewRemainingDistance?: string;
  canonicalRoute?: CanonicalRoute;
  onUpdateCanonicalRoute?: (route: CanonicalRoute) => void;
  onUpdateOverlays?: (overlays: OverlayConfig) => void;
  onUpdateRoute?: (route: Route) => void;
  onAddPoint?: (point: { lng: number; lat: number }) => void;
  onAddSign?: (sign: MapSign) => void;
  onUpdateSign?: (sign: MapSign) => void;
  onMapCameraChange?: (cam: {
    zoom: number;
    pitch: number;
    bearing: number;
    center: [number, number];
  }) => void;
  onStartInteraction?: () => void;
  onMoveInteraction?: () => void;
  onEndInteraction?: () => void;
  onCancelInteraction?: () => void;
}

interface SearchPlace {
  id: string;
  name: string;
  context: string;
  kind: 'country' | 'region' | 'city' | 'town' | 'peak' | 'water' | 'park' | 'street' | 'place';
  center: [number, number];
  bounds?: [number, number, number, number];
}

const PLACE_ZOOM: Record<SearchPlace['kind'], number> = {
  country: 5,
  region: 7,
  city: 11,
  town: 13,
  peak: 12,
  water: 10,
  park: 11,
  street: 15,
  place: 14,
};

const PLACE_ICONS: Record<SearchPlace['kind'], string> = {
  country: 'M4 21V4h11l1 2h4v9h-7l-1-2H6v8z',
  region: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z',
  city: 'M3 21V9l6-4v4l6-4v16zM17 21V11h4v10z',
  town: 'M4 21v-9l8-6 8 6v9h-6v-6h-4v6z',
  peak: 'M2 20l7-12 4 6 3-4 6 10z',
  water:
    'M2 15c3 0 3-2 5-2s2 2 5 2 3-2 5-2 2 2 5 2v3c-3 0-3-2-5-2s-2 2-5 2-3-2-5-2-2 2-5 2z',
  park: 'M12 2l6 9h-4l5 7H5l5-7H6zM11 18h2v4h-2z',
  street: 'M9 2h2v20H9zM13 2h2v20h-2zM4 2h2v20H4zM18 2h2v20h-2z',
  place:
    'M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7zm0 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
};

function classifyPlaceKind(props: any): SearchPlace['kind'] {
  const val = props.osm_value ?? '';
  if (props.type === 'country' || val === 'country') return 'country';
  if (
    props.type === 'state' ||
    val === 'state' ||
    val === 'region' ||
    val === 'province' ||
    props.type === 'county'
  )
    return 'region';
  if (val === 'city') return 'city';
  if (['town', 'village', 'hamlet', 'suburb', 'neighbourhood', 'locality'].includes(val))
    return 'town';
  if (['peak', 'volcano', 'mountain_range', 'ridge', 'hill', 'saddle'].includes(val))
    return 'peak';
  if (
    props.osm_key === 'waterway' ||
    ['water', 'lake', 'bay', 'strait', 'sea', 'river', 'coastline'].includes(val)
  )
    return 'water';
  if (
    props.osm_key === 'leisure' ||
    props.osm_key === 'boundary' ||
    val === 'national_park' ||
    val === 'nature_reserve'
  )
    return 'park';
  if (props.osm_key === 'highway' || props.type === 'street') return 'street';
  return 'place';
}

async function searchPhotonPlaces(
  query: string,
  center: [number, number] | null,
  signal: AbortSignal
): Promise<SearchPlace[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  // 1. Try OpenStreetMap Nominatim first (high reliability, recognizes airport IATA codes like GYD, JFK, LHR)
  try {
    const nomUrl = new URL('https://nominatim.openstreetmap.org/search');
    nomUrl.searchParams.set('q', trimmed);
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
        const results: SearchPlace[] = [];
        const seen = new Set<string>();

        for (const item of data) {
          const lat = parseFloat(item.lat);
          const lng = parseFloat(item.lon);
          if (isNaN(lat) || isNaN(lng)) continue;

          const addr = item.address || {};
          const name = item.name || item.display_name.split(',')[0].trim();
          const contextParts = [
            addr.city || addr.town || addr.village || addr.municipality || addr.county,
            addr.state,
            addr.country,
          ].filter((v, i, a) => v && v !== name && a.indexOf(v) === i);
          const context = contextParts.join(', ');
          const key = `${name}|${context}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const bbox = item.boundingbox;
          const bounds: [number, number, number, number] | undefined =
            Array.isArray(bbox) && bbox.length === 4
              ? [parseFloat(bbox[2]), parseFloat(bbox[0]), parseFloat(bbox[3]), parseFloat(bbox[1])]
              : undefined;

          results.push({
            id: `osm-${item.osm_type || 'p'}-${item.osm_id || name}`,
            name,
            context,
            kind: item.type === 'aerodrome' || item.class === 'aeroway' ? 'place' : classifyPlaceKind(item),
            center: [lng, lat],
            bounds,
          });
        }
        if (results.length > 0) return results.slice(0, 7);
      }
    }
  } catch {
    // Continue to Photon
  }

  // 2. Secondary fallback: Photon Komoot API
  try {
    const url = new URL('https://photon.komoot.io/api/');
    url.searchParams.set('q', trimmed);
    url.searchParams.set('limit', '7');
    url.searchParams.set('lang', 'en');
    if (center) {
      url.searchParams.set('lon', center[0].toFixed(3));
      url.searchParams.set('lat', center[1].toFixed(3));
    }
    const res = await fetch(url, { signal });
    if (res.ok) {
      const data = await res.json();
      const seen = new Set<string>();
      const results: SearchPlace[] = [];
      for (const feat of data.features ?? []) {
        const p = feat.properties ?? {};
        const name =
          p.name ?? (p.street ? [p.street, p.housenumber].filter(Boolean).join(' ') : undefined);
        if (!name) continue;
        const context = [p.city, p.state, p.country]
          .filter((v, i, arr) => v && v !== name && arr.indexOf(v) === i)
          .join(', ');
        const key = `${name}|${context}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const ext = p.extent;
        results.push({
          id: `${p.osm_type ?? ''}${p.osm_id ?? name}`,
          name,
          context,
          kind: classifyPlaceKind(p),
          center: feat.geometry.coordinates,
          bounds: ext ? [ext[0], ext[3], ext[2], ext[1]] : undefined,
        });
      }
      return results;
    }
  } catch {
    // Handled below
  }

  return [];
}

function getAspectRatioDims(aspect: string, size: number): [number, number] {
  const [aw, ah] = aspect.split(':').map(Number);
  if (aw >= ah) {
    return [Math.round((size * aw) / ah), size];
  }
  return [size, Math.round((size * ah) / aw)];
}

function computeFrameRect(viewW: number, viewH: number, aspectW: number, aspectH: number) {
  const availW = Math.max(viewW - 40, 0);
  const availH = Math.max(viewH - 40, 0);
  const ratio = aspectW / aspectH;
  let w = availW;
  let h = w / ratio;
  if (h > availH) {
    h = availH;
    w = h * ratio;
  }
  return {
    x: (viewW - w) / 2,
    y: (viewH - h) / 2,
    width: w,
    height: h,
  };
}

function renderVehicleShape(type: string | undefined, color: string, scale: number) {
  const s = Math.max(0.6, scale);
  switch (type) {
    case 'raft':
      // Raft with paddlers (Oct 27 changelog)
      return (
        <g transform={`scale(${s})`}>
          <rect x="-14" y="-8" width="28" height="16" rx="8" fill={color} stroke="#ffffff" strokeWidth="1.5" />
          <line x1="-12" y1="0" x2="12" y2="0" stroke="#ffffff" strokeWidth="1" strokeDasharray="2 2" />
          <circle cx="-8" cy="-5" r="2" fill="#ffffff" />
          <circle cx="0" cy="-5" r="2" fill="#ffffff" />
          <circle cx="8" cy="-5" r="2" fill="#ffffff" />
          <circle cx="-8" cy="5" r="2" fill="#ffffff" />
          <circle cx="0" cy="5" r="2" fill="#ffffff" />
          <circle cx="8" cy="5" r="2" fill="#ffffff" />
          <circle cx="-11" cy="0" r="2" fill="#ffd600" />
        </g>
      );
    case 'surf':
      // Surfer on board with wave spray (Oct 22 changelog)
      return (
        <g transform={`scale(${s})`}>
          <path d="M-14 -3 Q-18 -8 -22 -6 M-14 3 Q-18 8 -22 6" stroke="#90caf9" strokeWidth="1.5" fill="none" />
          <ellipse cx="0" cy="0" rx="14" ry="4.5" fill={color} stroke="#ffffff" strokeWidth="1.5" />
          <circle cx="2" cy="0" r="2.8" fill="#ffffff" />
          <line x1="-2" y1="-3" x2="6" y2="3" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
        </g>
      );
    case 'tank':
      // Battle tank (Oct 21 changelog)
      return (
        <g transform={`scale(${s})`}>
          <rect x="-11" y="-8" width="22" height="16" rx="2" fill="#374151" stroke="#ffffff" strokeWidth="1.2" />
          <rect x="-8" y="-5.5" width="16" height="11" rx="2" fill={color} />
          <line x1="0" y1="0" x2="16" y2="0" stroke="#111827" strokeWidth="3" strokeLinecap="round" />
          <circle cx="0" cy="0" r="4" fill="#1f2937" stroke="#ffffff" strokeWidth="1" />
        </g>
      );
    case 'fighter':
      // Fighter jet (Oct 21 changelog)
      return (
        <g transform={`scale(${s})`}>
          <path d="M16 0 L-4 -12 L-2 -3 L-12 -6 L-10 0 L-12 6 L-2 3 L-4 12 Z" fill={color} stroke="#ffffff" strokeWidth="1.4" strokeLinejoin="round" />
          <polygon points="-12,0 -16,-2 -15,0 -16,2" fill="#f59e0b" />
        </g>
      );
    case 'bomber':
      // WWII bomber (Oct 21 changelog)
      return (
        <g transform={`scale(${s})`}>
          <path d="M14 0 L-2 -18 L-4 -4 L-14 -8 L-12 0 L-14 8 L-4 4 L-2 18 Z" fill={color} stroke="#ffffff" strokeWidth="1.5" />
          <circle cx="2" cy="-8" r="2" fill="#1f2937" />
          <circle cx="2" cy="8" r="2" fill="#1f2937" />
        </g>
      );
    case 'chairlift':
    case 'cablecar':
    case 'funicular':
      // Chairlift / Cable car (Oct 17 & 19 changelog)
      return (
        <g transform={`scale(${s})`}>
          <line x1="-12" y1="0" x2="12" y2="0" stroke="#9ca3af" strokeWidth="1.5" />
          <rect x="-6" y="-6" width="12" height="12" rx="2.5" fill={color} stroke="#ffffff" strokeWidth="1.2" />
          <circle cx="-2" cy="-1" r="1.5" fill="#ffffff" />
          <circle cx="2" cy="-1" r="1.5" fill="#ffffff" />
        </g>
      );
    case 'bicycle':
    case 'mountainbike':
      return (
        <g transform={`scale(${s})`}>
          <line x1="-9" y1="0" x2="9" y2="0" stroke="#111827" strokeWidth="2" />
          <line x1="6" y1="-5" x2="6" y2="5" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
          <ellipse cx="0" cy="0" rx="3.5" ry="2.5" fill={color} stroke="#ffffff" strokeWidth="1" />
        </g>
      );
    case 'walking':
    case 'hiker':
    case 'winterhike':
    case 'running':
      return (
        <g transform={`scale(${s})`}>
          <circle cx="4" cy="0" r="3.2" fill="#ffffff" stroke="#111827" strokeWidth="1" />
          <rect x="-6" y="-4" width="8" height="8" rx="2" fill={color} stroke="#ffffff" strokeWidth="1.2" />
          {type === 'winterhike' && (
            <path d="M-8 -6 L-8 6 M4 -6 L4 6" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" />
          )}
        </g>
      );
    case 'boat':
    case 'sailboat':
    case 'catamaran':
    case 'battleship':
    case 'carrier':
    case 'submarine':
      return (
        <g transform={`scale(${s})`}>
          <path d="M14 0 C10 -6, -8 -6, -12 -4 L-12 4 C-8 6, 10 6, 14 0 Z" fill={color} stroke="#ffffff" strokeWidth="1.5" />
          <circle cx="0" cy="0" r="2.5" fill="#ffffff" />
        </g>
      );
    case 'plane':
    case 'sportsplane':
    case 'floatplane':
    case 'sailplane':
      return (
        <g transform={`scale(${s})`}>
          <path d="M15 0 L-2 -15 L-4 -4 L-12 -6 L-11 0 L-12 6 L-4 4 L-2 15 Z" fill={color} stroke="#ffffff" strokeWidth="1.4" />
        </g>
      );
    default:
      return (
        <g transform={`scale(${s})`}>
          <path
            d="M 12 0 L -8 -7 L -4 0 L -8 7 Z"
            fill={color}
            stroke="#ffffff"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </g>
      );
  }
}

export const MapViewer: React.FC<MapViewerProps> = ({
  themeId,
  mapLabels = true,
  labelLang,
  regions = false,
  terrain = false,
  aspect = '16:9',
  aspectRatio,
  size = 1080,
  routes,
  signs,
  currentStep = 'route',
  currentTime,
  duration,
  overlays,
  cameraMode,
  cameraPreset,
  followOrient = 'north',
  rotateOffset = 0,
  followZoom = 8,
  tilt = 0,
  lookAhead = 0.15,
  distanceKm = 2.3,
  heightKm = 2.9,
  orbitDirection = 'clockwise',
  cameraBlocks = [],
  includeMapCredit = true,
  isPlaying,
  fitRouteRequested,
  destinationPreview,
  isQuickPreviewActive,
  quickPreviewProgress,
  quickPreviewRemainingDistance,
  canonicalRoute,
  onUpdateCanonicalRoute,
  onUpdateOverlays,
  onUpdateRoute,
  onAddPoint,
  onAddSign,
  onUpdateSign,
  onMapCameraChange,
  onStartInteraction,
  onMoveInteraction,
  onEndInteraction,
  onCancelInteraction,
}) => {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const threeMapLayerRef = useRef<ThreeMapLayer | null>(null);
  const onMapCameraChangeRef = useRef(onMapCameraChange);
  onMapCameraChangeRef.current = onMapCameraChange;
  const routesRef = useRef(routes);
  routesRef.current = routes;
  const progressRef = useRef(0);
  const onAddPointRef = useRef(onAddPoint);
  onAddPointRef.current = onAddPoint;
  const onUpdateRouteRef = useRef(onUpdateRoute);
  onUpdateRouteRef.current = onUpdateRoute;
  const onAddSignRef = useRef(onAddSign);
  onAddSignRef.current = onAddSign;
  const onUpdateSignRef = useRef(onUpdateSign);
  onUpdateSignRef.current = onUpdateSign;
  const signsRef = useRef(signs);
  signsRef.current = signs;
  const canonicalRouteRef = useRef(canonicalRoute);
  canonicalRouteRef.current = canonicalRoute;
  const onUpdateCanonicalRouteRef = useRef(onUpdateCanonicalRoute);
  onUpdateCanonicalRouteRef.current = onUpdateCanonicalRoute;
  const onUpdateOverlaysRef = useRef(onUpdateOverlays);
  onUpdateOverlaysRef.current = onUpdateOverlays;
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;
  const lastWholeTourKeyRef = useRef<string>('');
  const onCancelInteractionRef = useRef(onCancelInteraction);
  onCancelInteractionRef.current = onCancelInteraction;
  const currentStepRef = useRef<StepId>(currentStep);
  currentStepRef.current = currentStep;

  const [viewSize, setViewSize] = useState({ w: 0, h: 0 });
  const [, setRenderTick] = useState(0);
  const [draggingPoint, setDraggingPoint] = useState<{ routeId: string; index: number } | null>(null);
  const [draggingStopId, setDraggingStopId] = useState<string | null>(null);
  const [draggingTitle, setDraggingTitle] = useState(false);
  const [draggingSignId, setDraggingSignId] = useState<string | null>(null);
  const [editingWaypoint, setEditingWaypoint] = useState<{ routeId: string; index: number } | null>(null);
  const didDragRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const hasPointerCaptureRef = useRef<boolean>(false);
  const fallbackCleanupRef = useRef<(() => void) | null>(null);

  // Component unmount / cleanup safety: remove fallback listeners and cancel dangling interactions
  useEffect(() => {
    return () => {
      if (fallbackCleanupRef.current) {
        fallbackCleanupRef.current();
        fallbackCleanupRef.current = null;
      }
      if (activePointerIdRef.current !== null) {
        activePointerIdRef.current = null;
        hasPointerCaptureRef.current = false;
        onCancelInteractionRef.current?.();
      }
    };
  }, []);

  // Fit bounds when explicitly requested (Show route in Route step menu)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitRouteRequested || fitRouteRequested.points.length === 0) return;
    let minLng = Infinity,
      minLat = Infinity,
      maxLng = -Infinity,
      maxLat = -Infinity;
    for (const p of fitRouteRequested.points) {
      if (p.lng < minLng) minLng = p.lng;
      if (p.lat < minLat) minLat = p.lat;
      if (p.lng > maxLng) maxLng = p.lng;
      if (p.lat > maxLat) maxLat = p.lat;
    }
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 80, maxZoom: 15, duration: 800 }
    );
  }, [fitRouteRequested]);

  // Click handler for route waypoints to open accessible WaypointOptionsModal
  const handlePointClick = (routeId: string, ptIndex: number) => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    const route = routes.find((r) => r.id === routeId);
    if (!route) return;
    setEditingWaypoint({ routeId, index: ptIndex });
  };

  const handlePointDoubleClick = (routeId: string, ptIndex: number) => {
    const route = routes.find((r) => r.id === routeId);
    if (!route) return;
    const pt = route.points[ptIndex];
    const updatedPts = [...route.points];
    updatedPts[ptIndex] = { ...pt, sharpCorner: !pt.sharpCorner };
    onUpdateRouteRef.current?.({ ...route, points: updatedPts });
  };

  // Photon Place Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchPlace[]>([]);
  const [activeResultIdx, setActiveResultIdx] = useState(0);
  const [searchStatus, setSearchStatus] = useState<'idle' | 'busy' | 'none' | 'error'>('idle');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = workspaceRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setViewSize({
        w: entry.contentRect.width,
        h: entry.contentRect.height,
      });
      requestAnimationFrame(() => {
        mapRef.current?.resize();
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Initialize MapLibre instance
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      maxPitch: 80,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0b0c0e' } }],
      },
      center: [15, 50],
      zoom: 3.5,
      bearing: 0,
      pitch: 0,
      attributionControl: { compact: true },
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    let rafId = 0;
    const triggerSync = () => {
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          setRenderTick((n) => n + 1);
        });
      }
    };
    map.on('move', triggerSync);
    map.on('resize', triggerSync);

    map.on('click', (e) => {
      if (didDragRef.current) {
        didDragRef.current = false;
        return;
      }
      if (currentStepRef.current === 'route' && onAddPointRef.current) {
        onAddPointRef.current({ lng: e.lngLat.lng, lat: e.lngLat.lat });
      } else if (currentStepRef.current === 'signs' && onAddSignRef.current) {
        onAddSignRef.current({
          id: `sign-${Date.now()}`,
          lng: e.lngLat.lng,
          lat: e.lngLat.lat,
          text: 'Waypoint',
          style: 'pin',
          triggerMode: 'onPassed',
          pauseSec: 1.5,
          size: 1,
        });
      }
    });

    const ensureThreeLayer = () => {
      if (!threeMapLayerRef.current) {
        threeMapLayerRef.current = new ThreeMapLayer({
          modelKind: mapTransportTo3DModel(routesRef.current[0]?.transportType),
          colorHex: routesRef.current[0]?.color || '#ff4d2e',
        });
      }
      if (!map.getLayer(threeMapLayerRef.current.id)) {
        try {
          map.addLayer(threeMapLayerRef.current);
        } catch (e) {
          console.warn('Failed to add ThreeMapLayer:', e);
        }
      }
      if (routesRef.current[0]?.points?.length) {
        threeMapLayerRef.current.setRoute(routesRef.current[0].points, routesRef.current[0].color);
        threeMapLayerRef.current.setProgress(progressRef.current);
      }
    };

    map.on('style.load', ensureThreeLayer);

    const handleCameraUserChange = () => {
      if (currentStepRef.current === 'camera' && onMapCameraChangeRef.current) {
        onMapCameraChangeRef.current({
          zoom: Math.round(map.getZoom() * 10) / 10,
          pitch: Math.round(map.getPitch()),
          bearing: Math.round(map.getBearing()),
          center: [map.getCenter().lng, map.getCenter().lat],
        });
      }
    };
    map.on('zoomend', handleCameraUserChange);
    map.on('pitchend', handleCameraUserChange);
    map.on('rotateend', handleCameraUserChange);

    mapRef.current = map;

    return () => {
      cancelAnimationFrame(rafId);
      if (threeMapLayerRef.current) {
        try {
          if (map.getLayer(threeMapLayerRef.current.id)) {
            map.removeLayer(threeMapLayerRef.current.id);
          }
        } catch (_) {}
        threeMapLayerRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Synchronize ThreeMapLayer with route geometry and animation progress
  useEffect(() => {
    const progress =
      isQuickPreviewActive && quickPreviewProgress !== undefined
        ? Math.min(1, Math.max(0, quickPreviewProgress))
        : (duration && duration > 0 && currentTime !== undefined
          ? Math.min(1, Math.max(0, currentTime / duration))
          : 1);
    progressRef.current = progress;

    if (threeMapLayerRef.current && routes[0]?.points?.length) {
      const activeKind = mapTransportTo3DModel(routes[0].transportType);
      threeMapLayerRef.current.setModelKind(activeKind);
      threeMapLayerRef.current.setRoute(routes[0].points, routes[0].color || '#ff4d2e');
      threeMapLayerRef.current.setProgress(progress);
      mapRef.current?.triggerRepaint();
    }
  }, [routes, currentTime, duration, isQuickPreviewActive, quickPreviewProgress]);

  // Quick Preview camera lock and one-time fitBounds
  const prevQuickPreviewActiveRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (isQuickPreviewActive) {
      map.dragPan.disable();
      map.scrollZoom.disable();
      map.boxZoom.disable();
      map.dragRotate.disable();
      map.keyboard.disable();
      map.doubleClickZoom.disable();
      map.touchZoomRotate.disable();

      if (!prevQuickPreviewActiveRef.current && routes[0]?.points?.length >= 2) {
        const bounds = computeRouteBounds(routes[0].points);
        if (bounds) {
          map.fitBounds(
            [
              [bounds.minLng, bounds.minLat],
              [bounds.maxLng, bounds.maxLat],
            ],
            { padding: 80, duration: 800 }
          );
        }
      }
    } else {
      map.dragPan.enable();
      map.scrollZoom.enable();
      map.boxZoom.enable();
      map.dragRotate.enable();
      map.keyboard.enable();
      map.doubleClickZoom.enable();
      map.touchZoomRotate.enable();
    }
    prevQuickPreviewActiveRef.current = !!isQuickPreviewActive;
  }, [isQuickPreviewActive, routes]);

  // Sync camera tilt (pitch) and bearing immediately when adjusted in the Camera step
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      pitch: tilt,
      bearing: followOrient === 'north' ? rotateOffset : map.getBearing(),
      duration: 200,
    });
  }, [tilt, rotateOffset, followOrient]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || currentStep !== 'camera' || cameraMode !== 'follow') return;
    map.easeTo({
      zoom: followZoom,
      duration: 200,
    });
  }, [followZoom, currentStep, cameraMode]);

  // Dynamically build and apply the exact map style JSON whenever theme or map options change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;

    buildMapStyle({
      mapStyle: themeId,
      mapLabels,
      terrain,
      regions,
      labelLang,
    })
      .then((styleJson) => {
        if (!cancelled && mapRef.current) {
          mapRef.current.setStyle(styleJson, { diff: false });
        }
      })
      .catch((err) => console.error('Failed to build map style:', err));

    return () => {
      cancelled = true;
    };
  }, [themeId, mapLabels, terrain, regions, labelLang]);

  // Fit map when a GPX route with many points is imported
  const prevPointsCountRef = useRef(0);
  useEffect(() => {
    const map = mapRef.current;
    const allPts = routes.flatMap((r) => r.points);
    if (map && allPts.length > 5 && prevPointsCountRef.current <= 5) {
      let minLng = Infinity,
        minLat = Infinity,
        maxLng = -Infinity,
        maxLat = -Infinity;
      for (const p of allPts) {
        if (p.lng < minLng) minLng = p.lng;
        if (p.lat < minLat) minLat = p.lat;
        if (p.lng > maxLng) maxLng = p.lng;
        if (p.lat > maxLat) maxLat = p.lat;
      }
      map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        { padding: 80, maxZoom: 15, duration: 800 }
      );
    }
    prevPointsCountRef.current = allPts.length;
  }, [routes]);

  // Smoothly pan & fly to destination preview whenever the user enters a destination
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !destinationPreview) return;
    map.flyTo({
      center: [destinationPreview.lng, destinationPreview.lat],
      zoom: Math.max(map.getZoom(), 11),
      duration: 1200,
      essential: true,
    });
  }, [destinationPreview]);

  // Camera tracking during animation playback & scrubbing (follow, still, tripod, orbit, + cameraBlocks)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routes[0]?.points?.length) return;
    const progress =
      duration && duration > 0 && currentTime !== undefined
        ? Math.min(1, Math.max(0, currentTime / duration))
        : 1;

    if (isQuickPreviewActive) return;
    // In route step, don't let video camera take over the user's view
    if (currentStep === 'route') return;
    if (!isPlaying && currentStep === 'signs') return;

    // Check if a timeline cameraBlock overrides the mode at this playhead ratio
    const sortedBlocks = cameraBlocks.slice().sort((a, b) => a.tRatio - b.tRatio);
    const activeBlock = sortedBlocks.filter((cb) => cb.tRatio <= progress).pop();
    const effectiveMode = activeBlock ? activeBlock.kind : cameraMode || 'follow';
    const effectivePitch = activeBlock ? activeBlock.pitch : tilt;
    const effectiveZoom = activeBlock ? activeBlock.zoom : followZoom;
    const effectiveRotate = activeBlock?.rotateOffset ?? rotateOffset;
    const effectiveFollowOrient = activeBlock?.followOrient ?? followOrient;
    const effectiveDistKm = activeBlock?.distanceKm ?? distanceKm ?? 2.3;
    const effectiveHeightKm = activeBlock?.heightKm ?? heightKm ?? 2.9;
    const effectiveOrbitDir = activeBlock?.orbitDirection ?? orbitDirection ?? 'clockwise';

    const pts = routes[0].points;

    if (effectiveMode === 'still') {
      if (cameraPreset === 'whole_tour' && pts.length > 0) {
        const tourKey = `${pts.length}-${pts[0]?.lng.toFixed(4)}-${pts[pts.length - 1]?.lng.toFixed(4)}`;
        if (lastWholeTourKeyRef.current !== tourKey) {
          lastWholeTourKeyRef.current = tourKey;
          const bounds = computeRouteBounds(pts);
          if (bounds) {
            map.fitBounds(
              [
                [bounds.minLng, bounds.minLat],
                [bounds.maxLng, bounds.maxLat],
              ],
              {
                padding: { top: 60, bottom: 60, left: 60, right: 60 },
                pitch: effectivePitch !== undefined ? effectivePitch : 10,
                bearing: 0,
                duration: 800,
              }
            );
          }
        }
        return;
      }

      if (activeBlock) {
        map.easeTo({
          center: activeBlock.center,
          zoom: activeBlock.zoom,
          pitch: activeBlock.pitch,
          bearing: activeBlock.bearing,
          duration: isPlaying ? 120 : 0,
        });
      }
      return;
    }

    const snakeSample = getSmoothSnakePath(pts, progress);
    if (!snakeSample) return;

    const kinematics = threeMapLayerRef.current?.getKinematics(progress);
    const vehicleLngLat: [number, number] = kinematics
      ? [kinematics.worldPoint[0], kinematics.worldPoint[1]]
      : [snakeSample.tipPoint.lng, snakeSample.tipPoint.lat];

    const travelBearing = kinematics ? kinematics.headingDeg : snakeSample.headingDeg;

    if (effectiveMode === 'follow') {
      let bearing = effectiveRotate;
      if (effectiveFollowOrient === 'heading') {
        bearing = travelBearing + effectiveRotate;
      }

      // Smooth look-ahead along direction of travel
      let centerPos: [number, number] = vehicleLngLat;
      if (lookAhead && lookAhead > 0) {
        const lookT = Math.min(1, progress + lookAhead * 0.05);
        const lookKine = threeMapLayerRef.current?.getKinematics(lookT);
        if (lookKine) {
          centerPos = [
            vehicleLngLat[0] + (lookKine.worldPoint[0] - vehicleLngLat[0]) * 0.6,
            vehicleLngLat[1] + (lookKine.worldPoint[1] - vehicleLngLat[1]) * 0.6,
          ];
        }
      }

      if (isPlaying) {
        map.jumpTo({
          center: centerPos,
          zoom: effectiveZoom,
          pitch: effectivePitch,
          bearing,
        });
      } else {
        map.easeTo({
          center: centerPos,
          zoom: effectiveZoom,
          pitch: effectivePitch,
          bearing,
          duration: 100,
        });
      }
    } else if (effectiveMode === 'tripod') {
      // Tripod stands in one spot and turns to watch the vehicle go by
      const standOrigin: [number, number] = activeBlock
        ? activeBlock.center
        : [pts[0].lng, pts[0].lat];
      const dLng = vehicleLngLat[0] - standOrigin[0];
      const dLat = vehicleLngLat[1] - standOrigin[1];
      const swivelBearing = (Math.atan2(dLng, dLat) * 180) / Math.PI;

      // Pitch angle calculated from height and distance
      const radPitch = Math.atan2(effectiveDistKm, effectiveHeightKm);
      const computedPitch = Math.min(80, Math.max(10, Math.round((radPitch * 180) / Math.PI)));

      map.easeTo({
        center: [
          standOrigin[0] + dLng * 0.35,
          standOrigin[1] + dLat * 0.35,
        ],
        zoom: effectiveZoom,
        pitch: computedPitch,
        bearing: swivelBearing,
        duration: isPlaying ? 100 : 0,
      });
    } else if (effectiveMode === 'orbit') {
      // Circles the vehicle once over the length of this camera block
      let blockProgress = progress;
      if (activeBlock) {
        const activeIdx = sortedBlocks.indexOf(activeBlock);
        const nextBlock = sortedBlocks[activeIdx + 1];
        const startT = activeBlock.tRatio;
        const endT = nextBlock ? nextBlock.tRatio : 1;
        blockProgress = endT > startT ? (progress - startT) / (endT - startT) : 0;
      }
      const dirMult = effectiveOrbitDir === 'anticlockwise' ? -1 : 1;
      const orbitBearing = ((blockProgress * 360 * dirMult) % 360) + (activeBlock?.bearing || 0);

      map.easeTo({
        center: vehicleLngLat,
        zoom: effectiveZoom,
        pitch: effectivePitch,
        bearing: orbitBearing,
        duration: isPlaying ? 100 : 0,
      });
    }
  }, [
    currentTime,
    duration,
    cameraMode,
    followOrient,
    followZoom,
    tilt,
    lookAhead,
    distanceKm,
    heightKm,
    orbitDirection,
    cameraBlocks,
    isPlaying,
    routes,
    rotateOffset,
    currentStep,
    cameraPreset,
  ]);

  // Trigger map resize when aspect ratio changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [aspect, aspectRatio]);

  // Photon Place Search keyboard shortcut `/` and click outside
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        e.key !== '/' ||
        e.metaKey ||
        e.ctrlKey ||
        target?.closest('input, textarea, select, [contenteditable="true"]')
      )
        return;
      e.preventDefault();
      setSearchOpen(true);
      requestAnimationFrame(() => searchInputRef.current?.focus());
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!searchBoxRef.current?.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen || searchQuery.trim().length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setSearchStatus('busy');
      const c = mapRef.current?.getCenter();
      searchPhotonPlaces(searchQuery, c ? [c.lng, c.lat] : null, ctrl.signal)
        .then((res) => {
          setSearchResults(res);
          setActiveResultIdx(0);
          setSearchStatus(res.length ? 'idle' : 'none');
        })
        .catch((err) => {
          if (err.name !== 'AbortError') setSearchStatus('error');
        });
    }, 280);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [searchQuery, searchOpen]);

  const [resW, resH] = getAspectRatioDims(aspect, size);
  const frame = computeFrameRect(viewSize.w, viewSize.h, resW, resH);
  const scale = Math.min(frame.width, frame.height) / 1080 || 1;

  const handleSelectPlace = (place: SearchPlace) => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    const map = mapRef.current;
    if (!map) return;

    const padding = {
      top: frame.y + 40,
      left: frame.x + 40,
      right: Math.max(40, viewSize.w - frame.x - frame.width + 40),
      bottom: Math.max(40, viewSize.h - frame.y - frame.height + 40),
    };
    const camOpts = {
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      duration: 1400,
    };

    if (place.bounds && place.bounds[0] !== place.bounds[2]) {
      const [w, s, e, n] = place.bounds;
      map.fitBounds(
        [
          [w, s],
          [e, n],
        ],
        { ...camOpts, padding, maxZoom: Math.max(PLACE_ZOOM[place.kind], 13) }
      );
    } else {
      const offset: [number, number] = [
        frame.x + frame.width / 2 - viewSize.w / 2,
        frame.y + frame.height / 2 - viewSize.h / 2,
      ];
      map.flyTo({
        ...camOpts,
        center: place.center,
        zoom: PLACE_ZOOM[place.kind],
        offset,
      });
    }

    const pinEl = document.createElement('div');
    pinEl.className = 'place-pin';
    pinEl.innerHTML = `<svg width="30" height="40" viewBox="0 0 30 40" aria-hidden="true"><ellipse cx="15" cy="38" rx="6" ry="2" fill="rgba(0,0,0,0.3)"/><path d="M15 1C7.3 1 1.5 6.8 1.5 14.2 1.5 24 15 37 15 37S28.5 24 28.5 14.2C28.5 6.8 22.7 1 15 1z" fill="#ffffff" stroke="#1b1f24" stroke-width="2"/><circle cx="15" cy="14" r="5" fill="#1b1f24"/></svg>`;
    const marker = new maplibregl.Marker({ element: pinEl, anchor: 'bottom' })
      .setLngLat(place.center)
      .addTo(map);
    setTimeout(() => pinEl.classList.add('leaving'), 4200);
    setTimeout(() => marker.remove(), 5000);
  };

  const map = mapRef.current;
  const hasQuery = searchQuery.trim().length >= 2;
  const visibleResults = hasQuery ? searchResults : [];
  const visibleStatus = hasQuery ? searchStatus : 'idle';

  const removeFallbackListeners = () => {
    if (fallbackCleanupRef.current) {
      fallbackCleanupRef.current();
      fallbackCleanupRef.current = null;
    }
  };

  const setupFallbackListeners = (targetPointerId: number) => {
    removeFallbackListeners();

    const handleWindowPointerMove = (ev: PointerEvent) => {
      if (ev.pointerId !== targetPointerId) return;
      performPointerMoveRef.current?.(ev.pointerId, ev.clientX, ev.clientY);
    };

    const handleWindowPointerUp = (ev: PointerEvent) => {
      if (ev.pointerId !== targetPointerId) return;
      performPointerUpRef.current?.(ev.pointerId);
    };

    const handleWindowPointerCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== targetPointerId) return;
      performPointerCancelRef.current?.(ev.pointerId);
    };

    window.addEventListener('pointermove', handleWindowPointerMove, true);
    window.addEventListener('pointerup', handleWindowPointerUp, true);
    window.addEventListener('pointercancel', handleWindowPointerCancel, true);

    fallbackCleanupRef.current = () => {
      window.removeEventListener('pointermove', handleWindowPointerMove, true);
      window.removeEventListener('pointerup', handleWindowPointerUp, true);
      window.removeEventListener('pointercancel', handleWindowPointerCancel, true);
    };
  };

  const startDragInteraction = (pointerId: number) => {
    // Centrally protect active pointer: do not overwrite an existing active pointer
    if (activePointerIdRef.current !== null) return;

    activePointerIdRef.current = pointerId;
    didDragRef.current = false;

    let captured = false;
    try {
      if (workspaceRef.current) {
        workspaceRef.current.setPointerCapture(pointerId);
        captured = workspaceRef.current.hasPointerCapture(pointerId);
      }
    } catch {
      captured = false;
    }
    hasPointerCaptureRef.current = captured;

    if (!captured) {
      setupFallbackListeners(pointerId);
    } else {
      removeFallbackListeners();
    }

    onStartInteraction?.();
    map?.dragPan.disable();
  };

  const performPointerMove = (pointerId: number, clientX: number, clientY: number) => {
    if (!map || !workspaceRef.current) return;
    if (!draggingPoint && !draggingSignId && !draggingStopId && !draggingTitle) return;

    // Verify pointer identity matches the active drag
    if (activePointerIdRef.current === null || pointerId !== activePointerIdRef.current) {
      return;
    }

    if (!didDragRef.current) {
      didDragRef.current = true;
      onMoveInteraction?.();
    }

    const rect = workspaceRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const lngLat = map.unproject([x, y]);

    if (draggingPoint) {
      const route = routesRef.current.find((r) => r.id === draggingPoint.routeId);
      if (!route) return;
      const updatedPts = [...route.points];
      updatedPts[draggingPoint.index] = {
        ...updatedPts[draggingPoint.index],
        lng: lngLat.lng,
        lat: lngLat.lat,
      };
      onUpdateRouteRef.current?.({
        ...route,
        points: updatedPts,
      });
    } else if (draggingStopId && canonicalRouteRef.current?.stops) {
      const cr = canonicalRouteRef.current;
      const updatedStops = cr.stops.map((s) => {
        if (s.id === draggingStopId) {
          return {
            ...s,
            lng: lngLat.lng,
            lat: lngLat.lat,
          };
        }
        return s;
      });
      onUpdateCanonicalRouteRef.current?.({
        ...cr,
        status: 'stale',
        stops: updatedStops,
      });
    } else if (draggingTitle && overlaysRef.current) {
      onUpdateOverlaysRef.current?.({
        ...overlaysRef.current,
        titleX: Math.round(x),
        titleY: Math.round(y),
      });
    } else if (draggingSignId && signsRef.current) {
      const sign = signsRef.current.find((s) => s.id === draggingSignId);
      if (!sign) return;
      onUpdateSignRef.current?.({
        ...sign,
        lng: lngLat.lng,
        lat: lngLat.lat,
      });
    }
  };

  const performPointerUp = (pointerId: number) => {
    // Only process if this pointer matches the active drag
    if (activePointerIdRef.current === null || pointerId !== activePointerIdRef.current) {
      return;
    }

    removeFallbackListeners();

    try {
      if (workspaceRef.current?.hasPointerCapture(pointerId)) {
        workspaceRef.current.releasePointerCapture(pointerId);
      }
    } catch {}

    hasPointerCaptureRef.current = false;
    activePointerIdRef.current = null;

    const wasDragging =
      draggingPoint !== null ||
      draggingSignId !== null ||
      draggingStopId !== null ||
      draggingTitle;
    const hadMoved = didDragRef.current;
    if (draggingPoint) {
      const route = routesRef.current.find((r) => r.id === draggingPoint.routeId);
      if (route && hadMoved) {
        onUpdateRouteRef.current?.({
          ...route,
          stats: calculateTrackStats(route.points),
        });
      }
      setDraggingPoint(null);
      map?.dragPan.enable();
    }
    if (draggingStopId) {
      setDraggingStopId(null);
      map?.dragPan.enable();
    }
    if (draggingTitle) {
      setDraggingTitle(false);
      map?.dragPan.enable();
    }
    if (draggingSignId) {
      setDraggingSignId(null);
      map?.dragPan.enable();
    }
    didDragRef.current = false;
    if (wasDragging) {
      onEndInteraction?.();
    }
  };

  const performPointerCancel = (pointerId: number) => {
    // Only process if this pointer matches the active drag
    if (activePointerIdRef.current === null || pointerId !== activePointerIdRef.current) {
      return;
    }

    removeFallbackListeners();

    try {
      if (workspaceRef.current?.hasPointerCapture(pointerId)) {
        workspaceRef.current.releasePointerCapture(pointerId);
      }
    } catch {}

    hasPointerCaptureRef.current = false;
    activePointerIdRef.current = null;

    const wasDragging = draggingPoint !== null || draggingSignId !== null;
    if (draggingPoint) {
      setDraggingPoint(null);
      map?.dragPan.enable();
    }
    if (draggingSignId) {
      setDraggingSignId(null);
      map?.dragPan.enable();
    }
    didDragRef.current = false;
    if (wasDragging) {
      onCancelInteraction?.();
    }
  };

  const performPointerMoveRef = useRef(performPointerMove);
  performPointerMoveRef.current = performPointerMove;
  const performPointerUpRef = useRef(performPointerUp);
  performPointerUpRef.current = performPointerUp;
  const performPointerCancelRef = useRef(performPointerCancel);
  performPointerCancelRef.current = performPointerCancel;

  const handleWorkspacePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!hasPointerCaptureRef.current) return;
    performPointerMove(e.pointerId, e.clientX, e.clientY);
  };

  const handleWorkspacePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!hasPointerCaptureRef.current) return;
    performPointerUp(e.pointerId);
  };

  const handleWorkspacePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!hasPointerCaptureRef.current) return;
    performPointerCancel(e.pointerId);
  };

  // Click on route line to insert a point in between (Help Step 1)
  const handleRouteLineClick = (e: React.MouseEvent<SVGPathElement>, route: Route) => {
    if (currentStep !== 'route' || !map || !workspaceRef.current || route.points.length < 2) return;
    e.stopPropagation();
    const rect = workspaceRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const lngLat = map.unproject([clickX, clickY]);

    // Find closest segment [i, i+1] in screen space
    let bestSegIdx = 0;
    let bestDistSq = Infinity;
    for (let i = 0; i < route.points.length - 1; i++) {
      const a = map.project([route.points[i].lng, route.points[i].lat]);
      const b = map.project([route.points[i + 1].lng, route.points[i + 1].lat]);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((clickX - a.x) * dx + (clickY - a.y) * dy) / lenSq));
      const projX = a.x + t * dx;
      const projY = a.y + t * dy;
      const distSq = (clickX - projX) ** 2 + (clickY - projY) ** 2;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestSegIdx = i;
      }
    }

    const prevEle = route.points[bestSegIdx].ele;
    const nextEle = route.points[bestSegIdx + 1].ele;
    const interpEle =
      prevEle !== undefined && nextEle !== undefined ? Math.round((prevEle + nextEle) / 2) : prevEle;

    const updatedPts = [
      ...route.points.slice(0, bestSegIdx + 1),
      { lng: lngLat.lng, lat: lngLat.lat, ele: interpEle },
      ...route.points.slice(bestSegIdx + 1),
    ];
    onUpdateRouteRef.current?.({
      ...route,
      points: updatedPts,
      stats: calculateTrackStats(updatedPts),
    });
  };

  return (
    <div
      ref={workspaceRef}
      className={`workspace${currentStep === 'route' ? ' is-drawing' : ''}`}
      style={{ width: '100%', height: '100%' }}
      onPointerMove={handleWorkspacePointerMove}
      onPointerUp={handleWorkspacePointerUp}
      onPointerCancel={handleWorkspacePointerCancel}
      onLostPointerCapture={handleWorkspacePointerCancel}
    >
      <div ref={mapContainerRef} className="map" translate="no" />

      {/* 16:9 · 1920×1080 resolution pill at top center (matching all 4 snapshots) */}
      <div className="absolute top-2.5 left-1/2 -translate-x-1/2 bg-[#16191ecc] text-[#8f96a0] text-[11px] font-mono font-medium px-3 py-1 rounded-full border border-[var(--border)] shadow-md pointer-events-none z-10 backdrop-blur-sm select-none">
        {aspect} · {resW}×{resH}
      </div>

      {/* Route SVG Overlay */}
      {viewSize.w > 0 && map && (
        <svg
          className="overlay notranslate"
          width={viewSize.w}
          height={viewSize.h}
          aria-hidden="true"
        >
          {routes.map((route) => {
            if (route.points.length === 0) return null;
            const rawProgress =
              duration && duration > 0 && currentTime !== undefined
                ? Math.min(1, Math.max(0, currentTime / duration))
                : 1;
            const offsetRatio =
              duration && duration > 0 && route.startOffsetSec
                ? Math.min(0.9, Math.max(0, route.startOffsetSec / duration))
                : 0;
            const progress =
              isQuickPreviewActive && quickPreviewProgress !== undefined
                ? Math.min(1, Math.max(0, quickPreviewProgress))
                : rawProgress <= offsetRatio
                ? 0
                : Math.min(1, (rawProgress - offsetRatio) / (1 - offsetRatio));

            const snakeSample = getSmoothSnakePath(route.points, progress);
            if (!snakeSample) return null;

            const currentPoints = snakeSample.drawnPoints;
            const tipPtIdx = snakeSample.segmentIndex;

            // Resolve active leg transport & color at current tip index
            const sortedLegs = (route.legs || [])
              .slice()
              .sort((a, b) => a.fromPointIndex - b.fromPointIndex);
            const activeLeg = sortedLegs.filter((l) => l.fromPointIndex <= tipPtIdx).pop();
            const activeTransport = activeLeg ? activeLeg.transportType : route.transportType;
            const activeColor = activeLeg?.color || route.color || '#ff4d2e';

            const projected = currentPoints.map((pt) => {
              const p = map.project([pt.lng, pt.lat]);
              return [p.x, p.y] as [number, number];
            });
            const strokeW = Math.max(
              3,
              ((route.width !== undefined && route.width <= 4) ? route.width : 3.5) * scale
            );
            const dashArray =
              route.style === 'dashed'
                ? `${strokeW * 1.8} ${strokeW * 1.9}`
                : route.style === 'dotted'
                ? `0.1 ${strokeW * 2}`
                : undefined;
            const d =
              projected.length >= 2
                ? projected
                    .map((p, idx) => `${idx ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
                    .join('')
                : '';

            // Compute arrow heading at the tip of the line
            let headAngle = 0;
            let tipPos: [number, number] | null = null;
            if (projected.length >= 2) {
              const tip = projected[projected.length - 1];
              const prev = projected[projected.length - 2];
              headAngle = (Math.atan2(tip[1] - prev[1], tip[0] - prev[0]) * 180) / Math.PI;
              tipPos = tip;
            } else if (projected.length === 1) {
              tipPos = projected[0];
              headAngle = (snakeSample.headingDeg - map.getBearing() - 90);
            }

            return (
              <g key={route.id}>
                {/* Draw Route Line unless hideLine is enabled (Oct 8 changelog) */}
                {d && !route.hideLine && (
                  <>
                    <path
                      d={d}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth={strokeW + 2 * scale}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={dashArray}
                      opacity={0.9}
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke={activeColor}
                      strokeWidth={strokeW}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={dashArray}
                      style={{
                        pointerEvents: currentStep === 'route' ? 'stroke' : 'none',
                        cursor: currentStep === 'route' ? 'copy' : 'default',
                      }}
                      onClick={(e) => handleRouteLineClick(e, route)}
                    />
                  </>
                )}
                {/* Start Dot */}
                <circle
                  cx={projected[0][0]}
                  cy={projected[0][1]}
                  r={Math.max(4, strokeW * 0.9)}
                  fill="#fff"
                  stroke={route.color || '#ff4d2e'}
                  strokeWidth={Math.max(2, strokeW * 0.45)}
                />
                {/* Animated Vehicle / Symbol at Tip with SymbolScale & Multi-Leg transport */}
                {tipPos && (
                  <g transform={`translate(${tipPos[0]}, ${tipPos[1]}) rotate(${headAngle})`}>
                    {renderVehicleShape(
                      activeTransport,
                      activeColor,
                      (route.symbolScale || 1.0) * scale
                    )}
                  </g>
                )}
              </g>
            );
          })}

          {/* Signs, Photos & Waypoints (Oct 8 & 29 changelog) */}
          {signs &&
            (() => {
              const progressRatio =
                duration && duration > 0 && currentTime !== undefined
                  ? Math.min(1, Math.max(0, currentTime / duration))
                  : 1;
              const mainPts = routes[0]?.points || [];
              const currIdx = Math.min(
                mainPts.length - 1,
                Math.max(0, Math.floor(mainPts.length * progressRatio))
              );

              // Filter visible signs by triggerMode ('always' | 'onPassed' | 'whilePassing')
              const visibleSigns = signs.filter((sign) => {
                // While editing in the Signs step and not playing, show all signs so user can see/drag them
                if (currentStep === 'signs' && !isPlaying) return true;
                if (sign.triggerMode === 'always' || mainPts.length === 0) return true;

                // Find nearest point index on main route
                let closestIdx = 0;
                let minDistSq = Infinity;
                for (let i = 0; i < mainPts.length; i++) {
                  const dSq =
                    (mainPts[i].lng - sign.lng) ** 2 + (mainPts[i].lat - sign.lat) ** 2;
                  if (dSq < minDistSq) {
                    minDistSq = dSq;
                    closestIdx = i;
                  }
                }
                if (sign.triggerMode === 'onPassed') {
                  return currIdx >= closestIdx;
                }
                if (sign.triggerMode === 'whilePassing') {
                  const windowPts = Math.max(2, Math.ceil(mainPts.length * 0.1));
                  return Math.abs(currIdx - closestIdx) <= windowPts;
                }
                return true;
              });

              const activePhotos = visibleSigns.filter((s) => s.style === 'photo' && s.photoUrl);
              return visibleSigns.map((sign) => {
                const p = map.project([sign.lng, sign.lat]);
                const signDragProps =
                  currentStep === 'signs'
                    ? {
                        style: { pointerEvents: 'all' as const, cursor: 'grab' },
                        onPointerDown: (e: React.PointerEvent) => {
                          e.stopPropagation();
                          if (activePointerIdRef.current !== null) {
                            return;
                          }
                          setDraggingSignId(sign.id);
                          startDragInteraction(e.pointerId);
                        },
                      }
                    : {};

                // Side-by-side photo layout on leader strings (Oct 29 changelog)
                if (sign.style === 'photo' && sign.photoUrl) {
                  const photoIdx = activePhotos.findIndex((s) => s.id === sign.id);
                  const totalPhotos = activePhotos.length;
                  const offsetX =
                    totalPhotos > 1 ? (photoIdx - (totalPhotos - 1) / 2) * 85 * scale : 0;
                  const cardY = -65 * scale;

                  return (
                    <g key={sign.id} transform={`translate(${p.x}, ${p.y})`} {...signDragProps}>
                      <ellipse cx={0} cy={0} rx={4 * scale} ry={2 * scale} fill="rgba(0,0,0,0.4)" />
                      {/* Leader string from ground spot to photo card */}
                      <path
                        d={`M 0 0 C 0 ${-20 * scale}, ${offsetX} ${-30 * scale}, ${offsetX} ${cardY}`}
                        stroke="#ffffff"
                        strokeWidth="1.8"
                        strokeDasharray="3 3"
                        fill="none"
                      />
                      <circle cx={0} cy={0} r={3} fill="#ffffff" stroke="#1b1f24" strokeWidth="1" />
                      {/* Photo card thumbnail */}
                      <g transform={`translate(${offsetX}, ${cardY})`}>
                        <rect
                          x={-28 * scale}
                          y={-28 * scale}
                          width={56 * scale}
                          height={56 * scale}
                          rx={8 * scale}
                          fill="#ffffff"
                          stroke="#1b1f24"
                          strokeWidth="2"
                        />
                        <image
                          href={sign.photoUrl}
                          x={-25 * scale}
                          y={-25 * scale}
                          width={50 * scale}
                          height={50 * scale}
                          preserveAspectRatio="xMidYMid slice"
                          clipPath="inset(0 round 6px)"
                        />
                      </g>
                    </g>
                  );
                }

                // Preset Signs: Camp, Start, Finish, Hotel, Pin (Oct 8 changelog)
                return (
                  <g key={sign.id} transform={`translate(${p.x}, ${p.y})`} {...signDragProps}>
                    <ellipse cx={0} cy={0} rx={5 * scale} ry={2 * scale} fill="rgba(0,0,0,0.3)" />

                    {sign.style === 'camp' ? (
                      <g transform={`scale(${scale}) translate(0, -16)`}>
                        <circle cx={0} cy={0} r={13} fill="#10b981" stroke="#ffffff" strokeWidth="1.8" />
                        <polygon points="0,-7 -7,5 7,5" fill="#ffffff" />
                      </g>
                    ) : sign.style === 'start' ? (
                      <g transform={`scale(${scale}) translate(0, -16)`}>
                        <circle cx={0} cy={0} r={13} fill="#3b82f6" stroke="#ffffff" strokeWidth="1.8" />
                        <path d="M-5,6 V-6 L4,-2 L-5,2" fill="#ffffff" />
                      </g>
                    ) : sign.style === 'finish' ? (
                      <g transform={`scale(${scale}) translate(0, -16)`}>
                        <circle cx={0} cy={0} r={13} fill="#f59e0b" stroke="#ffffff" strokeWidth="1.8" />
                        <path d="M-5,6 V-6 H3 V0 H-5" fill="#ffffff" />
                      </g>
                    ) : sign.style === 'hotel' ? (
                      <g transform={`scale(${scale}) translate(0, -16)`}>
                        <circle cx={0} cy={0} r={13} fill="#8b5cf6" stroke="#ffffff" strokeWidth="1.8" />
                        <path d="M-6,3 H6 V6 H-6 Z M-5,-2 H-1 V3 H-5 Z" fill="#ffffff" />
                      </g>
                    ) : (
                      <>
                        <path
                          d="M0 -22 C-6.5 -22 -11 -17 -11 -11 C-11 -3 0 0 0 0 C0 0 11 -3 11 -11 C11 -17 6.5 -22 0 -22 Z"
                          fill="#ffffff"
                          stroke="#1b1f24"
                          strokeWidth="1.8"
                        />
                        <circle cx={0} cy={-11} r={3.8} fill="#ff4d2e" />
                      </>
                    )}

                    {sign.text && (
                      <text
                        x={0}
                        y={-28 * scale}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize={Math.max(10, 11 * scale)}
                        fontWeight="bold"
                        stroke="#000000"
                        strokeWidth="3"
                        paintOrder="stroke"
                        className="pointer-events-none select-none font-sans"
                      >
                        {sign.text}
                      </text>
                    )}
                  </g>
                );
              });
            })()}
        </svg>
      )}

      {/* Video Frame Overlay, HUD Dashboard, & Anchor Points */}
      {viewSize.w > 0 && (
        <svg className="overlay" width={viewSize.w} height={viewSize.h} aria-hidden="true">
          <path
            className="dim"
            fillRule="evenodd"
            d={`M0 0H${viewSize.w}V${viewSize.h}H0Z M${frame.x} ${frame.y}V${
              frame.y + frame.height
            }H${frame.x + frame.width}V${frame.y}Z`}
          />
          <rect
            x={frame.x}
            y={frame.y}
            width={frame.width}
            height={frame.height}
            className="frame-outline"
          />
          <text className="frame-label" x={frame.x} y={frame.y - 8}>
            {aspect} · {resW}×{resH}
          </text>

          {/* Overlays HUD: Trip Title & Subtitle (Draggable Map Object) */}
          {overlays?.title && (
            <g
              data-testid="draggable-title-hud"
              transform={`translate(${overlays.titleX ?? frame.x + 24}, ${overlays.titleY ?? frame.y + 36})`}
              style={{
                pointerEvents: currentStep === 'overlays' || !isPlaying ? 'all' : 'none',
                cursor: currentStep === 'overlays' || !isPlaying ? 'grab' : 'default',
              }}
              onPointerDown={(e) => {
                if (currentStep !== 'overlays' && isPlaying) return;
                e.stopPropagation();
                if (activePointerIdRef.current !== null) return;
                setDraggingTitle(true);
                startDragInteraction(e.pointerId);
              }}
            >
              {/* Subtle dashed selection boundary when editing overlays */}
              {currentStep === 'overlays' && (
                <rect
                  x="-8"
                  y="-26"
                  width={Math.max(120, overlays.title.length * 15 * scale + 24)}
                  height={overlays.subtitle ? 56 * scale : 36 * scale}
                  rx="6"
                  fill="rgba(20, 184, 166, 0.08)"
                  stroke="rgba(20, 184, 166, 0.45)"
                  strokeWidth="1.2"
                  strokeDasharray="4 3"
                />
              )}
              <text
                fill="#ffffff"
                fontSize={Math.max(16, 22 * scale)}
                fontWeight="800"
                stroke="#000000"
                strokeWidth="4"
                paintOrder="stroke"
                fontFamily="sans-serif"
              >
                {overlays.title}
              </text>
              {overlays.subtitle && (
                <text
                  y={22 * scale}
                  fill="#ffffff"
                  fontSize={Math.max(12, 14 * scale)}
                  fontWeight="600"
                  opacity={0.85}
                  stroke="#000000"
                  strokeWidth="3"
                  paintOrder="stroke"
                  fontFamily="sans-serif"
                >
                  {overlays.subtitle}
                </text>
              )}
            </g>
          )}

          {/* Overlays HUD: Live Animated Elevation Profile Chart */}
          {overlays?.showElevationProfile &&
            (() => {
              const pts = routes[0]?.points || [];
              const elePts = pts.filter((p) => p.ele !== undefined && Number.isFinite(p.ele));
              if (elePts.length < 2) return null;

              const progressRatio =
                duration && duration > 0 && currentTime !== undefined
                  ? Math.min(1, Math.max(0, currentTime / duration))
                  : 1;
              const chartW = 240 * scale;
              const chartH = 44 * scale;
              const minE = Math.min(...elePts.map((p) => p.ele!));
              const maxE = Math.max(...elePts.map((p) => p.ele!));
              const spanE = Math.max(10, maxE - minE);

              const polyPoints = elePts
                .map((p, idx) => {
                  const x = (idx / (elePts.length - 1)) * chartW;
                  const y = chartH - ((p.ele! - minE) / spanE) * (chartH - 8) - 4;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                })
                .join(' ');
              const areaPoints = `0,${chartH} ${polyPoints} ${chartW},${chartH}`;
              const cursorX = progressRatio * chartW;

              return (
                <g transform={`translate(${frame.x + 24}, ${frame.y + frame.height - 96 * scale})`}>
                  <rect
                    x="-8"
                    y="-8"
                    width={chartW + 16}
                    height={chartH + 16}
                    rx="6"
                    fill="rgba(15, 20, 25, 0.72)"
                    stroke="rgba(255, 255, 255, 0.14)"
                  />
                  <polygon points={areaPoints} fill={routes[0]?.color || '#ff4d2e'} opacity={0.28} />
                  <polyline
                    points={polyPoints}
                    fill="none"
                    stroke={routes[0]?.color || '#ff4d2e'}
                    strokeWidth="2"
                  />
                  <line
                    x1={cursorX}
                    y1={0}
                    x2={cursorX}
                    y2={chartH}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                </g>
              );
            })()}

          {/* Overlays HUD: Distance, Speed, Altitude, Climb & Descent Telemetry (Oct 18 & 21 changelog) */}
          {(overlays?.showDistance ||
            overlays?.showAltitude ||
            overlays?.showSpeed ||
            overlays?.showClimbDescent) &&
            (() => {
              const progressRatio =
                duration && duration > 0 && currentTime !== undefined
                  ? Math.min(1, Math.max(0, currentTime / duration))
                  : 1;
              const pts = routes[0]?.points || [];
              const snake = getSmoothSnakePath(pts, progressRatio);
              const currIdx = snake ? snake.segmentIndex : 0;
              const currentPt = snake ? snake.tipPoint : pts[currIdx];
              const currentEle =
                currentPt?.ele !== undefined ? Math.round(currentPt.ele) : undefined;

              let currentGain = 0;
              let currentLoss = 0;
              for (let i = 1; i <= currIdx; i++) {
                const prevE = pts[i - 1].ele;
                const curE = pts[i].ele;
                if (prevE !== undefined && curE !== undefined) {
                  const diff = curE - prevE;
                  if (diff > 0) currentGain += diff;
                  else currentLoss += Math.abs(diff);
                }
              }

              // Unit conversion (metric / imperial / nautical)
              const unit = overlays?.unit || 'metric';
              const distMult = unit === 'imperial' ? 0.621371 : unit === 'nautical' ? 0.539957 : 1;
              const distUnit = unit === 'imperial' ? 'mi' : unit === 'nautical' ? 'nm' : 'km';
              const eleMult = unit === 'imperial' || unit === 'nautical' ? 3.28084 : 1;
              const eleUnit = unit === 'imperial' || unit === 'nautical' ? 'ft' : 'm';
              const speedUnit = unit === 'imperial' ? 'mph' : unit === 'nautical' ? 'kn' : 'km/h';

              const distVal = routes[0]?.stats?.distanceKm
                ? (routes[0].stats.distanceKm * progressRatio * distMult).toFixed(1)
                : '0.0';
              const eleVal =
                currentEle !== undefined ? `${Math.round(currentEle * eleMult)}${eleUnit}` : `-- ${eleUnit}`;
              const gainVal = Math.round(currentGain * eleMult);
              const lossVal = Math.round(currentLoss * eleMult);
              const speedVal = routes[0]?.stats?.avgSpeedKmh
                ? `${(routes[0].stats.avgSpeedKmh * distMult).toFixed(1)} ${speedUnit}`
                : `-- ${speedUnit}`;

              // Theme styling
              const hudTheme = overlays?.theme || 'dark';
              const bgFill =
                hudTheme === 'light'
                  ? 'rgba(255, 255, 255, 0.88)'
                  : hudTheme === 'vintage'
                  ? 'rgba(244, 232, 206, 0.9)'
                  : hudTheme === 'bold'
                  ? 'rgba(255, 77, 46, 0.9)'
                  : hudTheme === 'outdoor'
                  ? 'rgba(24, 48, 36, 0.85)'
                  : hudTheme === 'minimal'
                  ? 'rgba(0, 0, 0, 0.45)'
                  : 'rgba(15, 20, 25, 0.8)';
              const textFill =
                hudTheme === 'light' || hudTheme === 'vintage' ? '#1b1f24' : '#ffffff';

              return (
                <g transform={`translate(${frame.x + 24}, ${frame.y + frame.height - 30})`}>
                  <rect
                    x="-8"
                    y="-24"
                    width={310 * scale}
                    height={36 * scale}
                    rx="6"
                    fill={bgFill}
                    stroke="rgba(255, 255, 255, 0.15)"
                  />
                  <text
                    y="0"
                    fill={textFill}
                    fontSize={Math.max(11, 13 * scale)}
                    fontWeight="700"
                    fontFamily="monospace"
                  >
                    {overlays.showDistance && `${distVal} ${distUnit}`}
                    {overlays.showAltitude && ` · ${eleVal}`}
                    {overlays.showClimbDescent
                      ? ` · ▲+${gainVal}${eleUnit} ▼-${lossVal}${eleUnit}`
                      : ''}
                    {overlays.showSpeed && ` · ${speedVal}`}
                  </text>
                </g>
              );
            })()}

          {/* Overlays HUD: Compass Rose */}
          {overlays?.showCompass && map && (
            <g transform={`translate(${frame.x + frame.width - 44}, ${frame.y + 44})`}>
              <circle
                cx="0"
                cy="0"
                r={22 * scale}
                fill="rgba(15, 20, 25, 0.7)"
                stroke="#ffffff"
                strokeWidth="1.5"
              />
              <g transform={`rotate(${-map.getBearing()})`}>
                <polygon points="0,-16 5,0 -5,0" fill="#ff4d2e" />
                <polygon points="0,16 5,0 -5,0" fill="#ffffff" />
                <circle cx="0" cy="0" r="2" fill="#000000" />
              </g>
            </g>
          )}

          {/* Map Credit Watermark (Oct 30 changelog: can be left out of video) */}
          {includeMapCredit !== false && (
            <text
              x={frame.x + frame.width - 12}
              y={frame.y + frame.height - 10}
              textAnchor="end"
              fill="rgba(255, 255, 255, 0.65)"
              fontSize={Math.max(9, 10 * scale)}
              fontFamily="sans-serif"
            >
              © OpenStreetMap contributors · MapLibre
            </text>
          )}

          {/* Route Handles & Canonical Journey Stop Markers in Route Step */}
          {!isQuickPreviewActive && currentStep === 'route' && map && (() => {
            const validCanonicalStops = (canonicalRoute?.stops || []).filter(
              (s) => !isNaN(s.lng) && !isNaN(s.lat) && (s.lng !== 0 || s.lat !== 0)
            );

            // If canonical journey stops exist, render clean interactive stop pins (B02, B06, B09)
            if (validCanonicalStops.length > 0) {
              return validCanonicalStops.map((stop, idx) => {
                const p = map.project([stop.lng, stop.lat]);
                const isStart = idx === 0;
                const isDest = idx === validCanonicalStops.length - 1;
                const pinColor = isStart ? '#10b981' : isDest ? '#f97316' : '#0284c7';
                const stopLabel = stop.customLabel || stop.placeName || (isStart ? 'Start' : isDest ? 'Destination' : `Stop ${idx + 1}`);

                return (
                  <g
                    key={stop.id}
                    data-testid={`canonical-stop-${stop.id}`}
                    transform={`translate(${p.x}, ${p.y})`}
                    style={{ pointerEvents: 'all', cursor: 'grab' }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (activePointerIdRef.current !== null) return;
                      setDraggingStopId(stop.id);
                      startDragInteraction(e.pointerId);
                    }}
                  >
                    {/* Ground drop shadow */}
                    <ellipse cx={0} cy={0} rx={10 * scale} ry={4 * scale} fill="rgba(0,0,0,0.35)" />
                    {/* Pin shape */}
                    <path
                      d="M0 0 C -3 -8, -14 -16, -14 -26 C -14 -35, -8 -41, 0 -41 C 8 -41, 14 -35, 14 -26 C 14 -16, 3 -8, 0 0 Z"
                      fill={pinColor}
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                    <circle cx={0} cy={-26 * scale} r={4.5 * scale} fill="#ffffff" />
                    {/* Stop name pill badge */}
                    {stopLabel && (
                      <g transform={`translate(0, ${-48 * scale})`}>
                        <rect
                          x={-((stopLabel.length * 6.5 + 16) / 2)}
                          y={-11}
                          width={stopLabel.length * 6.5 + 16}
                          height={20}
                          rx={10}
                          fill="#0f172ae6"
                          stroke={pinColor}
                          strokeWidth="1.2"
                        />
                        <text
                          x={0}
                          y={3}
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize={10.5}
                          fontWeight="700"
                          fontFamily="sans-serif"
                        >
                          {stopLabel}
                        </text>
                      </g>
                    )}
                  </g>
                );
              });
            }

            // Fallback for manual or GPX imported routes without canonical stops:
            // Render only start, end, and explicit pauses/sharp corners (never hundreds of internal points) (B06)
            return routes.flatMap((route) =>
              route.points
                .map((pt, idx) => ({ pt, idx }))
                .filter(
                  ({ pt, idx }) =>
                    idx === 0 ||
                    idx === route.points.length - 1 ||
                    (pt.pauseSec && pt.pauseSec > 0) ||
                    pt.sharpCorner
                )
                .map(({ pt, idx }) => {
                  const p = map.project([pt.lng, pt.lat]);
                  const isPaused = pt.pauseSec && pt.pauseSec > 0;
                  return (
                    <g
                      key={`${route.id}-pt-${idx}`}
                      style={{ pointerEvents: 'all', cursor: 'grab' }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        if (activePointerIdRef.current !== null) return;
                        setDraggingPoint({ routeId: route.id, index: idx });
                        startDragInteraction(e.pointerId);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePointClick(route.id, idx);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handlePointDoubleClick(route.id, idx);
                      }}
                      className="cursor-pointer"
                    >
                      <circle cx={p.x} cy={p.y} r={pt.sharpCorner ? 5.5 : 6.5} className="anchor" />
                      {isPaused && (
                        <g transform={`translate(${p.x + 9}, ${p.y - 9})`}>
                          <rect x="-7" y="-7" width="14" height="14" rx="3" fill="#ff4d2e" stroke="#ffffff" strokeWidth="1" />
                          <rect x="-4" y="-4" width="2.5" height="8" rx="0.5" fill="#ffffff" />
                          <rect x="1.5" y="-4" width="2.5" height="8" rx="0.5" fill="#ffffff" />
                        </g>
                      )}
                    </g>
                  );
                })
            );
          })()}

          {/* Destination Pin Marker on Map when entered prior to route generation */}
          {!isQuickPreviewActive &&
            destinationPreview &&
            !(canonicalRoute?.stops && canonicalRoute.stops.some((s) => !isNaN(s.lng) && Math.abs(s.lng - destinationPreview.lng) < 1e-4)) &&
            map && (() => {
              const pos = map.project([destinationPreview.lng, destinationPreview.lat]);
              return (
                <g
                  key="destination-preview-pin"
                  transform={`translate(${pos.x}, ${pos.y})`}
                  className="pointer-events-none select-none transition-all duration-300"
                >
                  <ellipse cx={0} cy={0} rx={12 * scale} ry={5 * scale} fill="rgba(0,0,0,0.4)" />
                  <path
                    d={`M0 0 C -4 -10, -18 -22, -18 -36 C -18 -48, -10 -56, 0 -56 C 10 -56, 18 -48, 18 -36 C 18 -22, 4 -10, 0 0 Z`}
                    fill="#f97316"
                    stroke="#ffffff"
                    strokeWidth="2"
                  />
                  <circle cx={0} cy={-36 * scale} r={6 * scale} fill="#ffffff" />
                  <g transform={`translate(0, ${-64 * scale})`}>
                    <rect
                      x={-((destinationPreview.name.length * 7.5 + 24) / 2)}
                      y={-14}
                      width={destinationPreview.name.length * 7.5 + 24}
                      height={24}
                      rx={12}
                      fill="#0f172ae6"
                      stroke="#f97316"
                      strokeWidth="1.5"
                    />
                    <text
                      x={0}
                      y={3}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize={11.5}
                      fontWeight="700"
                      fontFamily="sans-serif"
                    >
                      🎯 {destinationPreview.name}
                    </text>
                  </g>
                </g>
              );
            })()}
        </svg>
      )}

      {/* Quick Preview Remaining-Distance HUD */}
      {isQuickPreviewActive && quickPreviewRemainingDistance && (
        <div
          data-testid="quick-preview-hud"
          className="absolute top-4 left-4 z-20 pointer-events-none flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 text-white shadow-xl border border-teal-500/40 backdrop-blur-md text-xs font-semibold tracking-wide"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse" />
          <span>Remaining: {quickPreviewRemainingDistance}</span>
        </div>
      )}

      {/* Photon Place Search (`Q3` exact structure) */}
      {viewSize.w > 0 && (
        <div
          ref={searchBoxRef}
          className={`place-search float${searchOpen ? ' open' : ''}`}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {searchOpen ? (
            <>
              <div className="place-field">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <circle cx="10.5" cy="10.5" r="6.5" />
                  <path d="M15.5 15.5L21 21" />
                </svg>
                <input
                  ref={searchInputRef}
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setSearchOpen(false);
                      return;
                    }
                    if (visibleResults.length) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setActiveResultIdx((i) => (i + 1) % visibleResults.length);
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setActiveResultIdx(
                          (i) => (i - 1 + visibleResults.length) % visibleResults.length
                        );
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSelectPlace(visibleResults[activeResultIdx]);
                      }
                    }
                  }}
                  placeholder="Search for a place"
                  aria-label="Search for a place"
                  role="combobox"
                  aria-expanded={visibleResults.length > 0}
                  aria-controls="place-results"
                />
                <button
                  className="place-close"
                  aria-label="Close search"
                  onClick={() => setSearchOpen(false)}
                >
                  ×
                </button>
              </div>
              {visibleResults.length > 0 && (
                <ul id="place-results" className="place-results" role="listbox">
                  {visibleResults.map((item, idx) => (
                    <li
                      key={item.id + idx}
                      id={`place-${idx}`}
                      role="option"
                      aria-selected={idx === activeResultIdx}
                    >
                      <button
                        onMouseEnter={() => setActiveResultIdx(idx)}
                        onClick={() => handleSelectPlace(item)}
                      >
                        <svg
                          className="place-icon"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d={PLACE_ICONS[item.kind]} />
                        </svg>
                        <span className="place-text">
                          <span className="place-name">{item.name}</span>
                          {item.context && <span className="place-context">{item.context}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {visibleStatus === 'busy' && !visibleResults.length && (
                <p className="place-note">Searching…</p>
              )}
              {visibleStatus === 'none' && (
                <p className="place-note">
                  No places found. Try another spelling, or add the country.
                </p>
              )}
              {visibleStatus === 'error' && (
                <p className="place-note">
                  Search isn't available right now. Check your connection and try again.
                </p>
              )}
              {visibleResults.length > 0 && (
                <p className="place-credit">Search by Photon · © OpenStreetMap contributors</p>
              )}
            </>
          ) : (
            <button
              className="place-open"
              title="Search for a place (/)"
              aria-label="Search for a place"
              onClick={() => {
                setSearchOpen(true);
                requestAnimationFrame(() => searchInputRef.current?.focus());
              }}
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="M15.5 15.5L21 21" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Touch-friendly Waypoint Options Modal (replaces blocking window.prompt) */}
      {editingWaypoint && (() => {
        const activeR = routes.find((r) => r.id === editingWaypoint.routeId);
        if (!activeR) return null;
        return (
          <WaypointOptionsModal
            route={activeR}
            pointIndex={editingWaypoint.index}
            onUpdateRoute={(updated) => onUpdateRouteRef.current?.(updated)}
            onClose={() => setEditingWaypoint(null)}
          />
        );
      })()}
    </div>
  );
};
