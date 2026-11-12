import React, { useState, useEffect, useRef } from 'react';
import { Route, RouteLeg, UIMode, DestinationPreview, CanonicalRoute, RouteStop, RouteSegment, CanonicalTransportType, RouteCalculationStatus, QuickPreviewSpeed, QuickPreviewState } from '../types';
import {
  SnapProfile,
  PlaceSuggestion,
  searchPlaceSuggestions,
  buildJourneyWithSegments,
  JourneyCalculationResult,
} from '../utils/roadRouter';
import { ElevationProfileChart } from './ElevationProfileChart';
import { calculateTrackStats } from '../utils/gpxParser';
import { chaikinSmooth } from '../utils/routeSmoothing';
import {
  Upload,
  Plus,
  Trash2,
  Car,
  Bike,
  Footprints,
  Plane,
  Ship,
  Train,
  ArrowUpDown,
  EyeOff,
  MoreHorizontal,
  Sparkles,
  Maximize2,
  Copy,
  Edit2,
  MapPin,
  Navigation,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

import { CANONICAL_TRANSPORTS as CANONICAL_META, getRoutingProfileForTransport } from '../constants/canonicalTransports';

interface RouteEditorPanelProps {
  routes: Route[];
  canonicalRoute?: CanonicalRoute;
  activeRouteId: string;
  uiMode?: UIMode;
  snapProfile: SnapProfile;
  onSetSnapProfile: (profile: SnapProfile) => void;
  routingInterval?: number | 'auto';
  onSetRoutingInterval?: (interval: number | 'auto') => void;
  onSelectRoute: (id: string) => void;
  onAddRoute: () => void;
  onDuplicateRoute?: (route: Route) => void;
  onFitRoute?: (route: Route) => void;
  onUpdateRoute: (route: Route, skipUndo?: boolean) => void;
  onUpdateCanonicalRoute?: (canonical: CanonicalRoute, isCalculationResult?: boolean) => void;
  onDeleteRoute?: (id: string) => void;
  onImportGPX: (file: File, options?: { importWaypoints: boolean; createDayEndSigns: boolean }) => void;
  onPreviewDestination?: (dest: DestinationPreview | null) => void;
  onNext?: () => void;
  quickPreviewState?: QuickPreviewState;
  quickPreviewProgress?: number;
  quickPreviewSpeed?: QuickPreviewSpeed;
  onStartQuickPreview?: () => void;
  onPauseQuickPreview?: () => void;
  onResumeQuickPreview?: () => void;
  onRestartQuickPreview?: () => void;
  onStopQuickPreview?: () => void;
  onSetQuickPreviewSpeed?: (speed: QuickPreviewSpeed) => void;
  onSeekQuickPreview?: (progress: number) => void;
  remainingDistanceKm?: number;
}

interface JourneyStop {
  id: string;
  query: string;
  selectedPlace?: PlaceSuggestion | null;
}

const ICONS: Record<CanonicalTransportType, React.ReactNode> = {
  car: <Car className="w-5 h-5" />,
  walking: <Footprints className="w-5 h-5" />,
  bike: <Bike className="w-5 h-5" />,
  train: <Train className="w-5 h-5" />,
  boat: <Ship className="w-5 h-5" />,
  plane: <Plane className="w-5 h-5" />,
};

export const CANONICAL_TRANSPORTS = CANONICAL_META.map((meta) => ({
  ...meta,
  icon: ICONS[meta.id],
}));

const SIMPLE_TRANSPORTS = CANONICAL_TRANSPORTS;

export const RouteEditorPanel: React.FC<RouteEditorPanelProps> = ({
  routes,
  canonicalRoute,
  activeRouteId,
  uiMode = 'simple',
  snapProfile,
  onSetSnapProfile,
  routingInterval = 0.1,
  onSetRoutingInterval,
  onSelectRoute,
  onAddRoute,
  onDuplicateRoute,
  onFitRoute,
  onUpdateRoute,
  onUpdateCanonicalRoute,
  onDeleteRoute,
  onImportGPX,
  onPreviewDestination,
  onNext,
  quickPreviewState: _quickPreviewState = 'idle',
  quickPreviewProgress: _quickPreviewProgress = 0,
  quickPreviewSpeed = 'normal',
  onStartQuickPreview: _onStartQuickPreview,
  onPauseQuickPreview: _onPauseQuickPreview,
  onResumeQuickPreview: _onResumeQuickPreview,
  onRestartQuickPreview: _onRestartQuickPreview,
  onStopQuickPreview: _onStopQuickPreview,
  onSetQuickPreviewSpeed,
  onSeekQuickPreview: _onSeekQuickPreview,
  remainingDistanceKm: _remainingDistanceKm,
}) => {
  const activeRoute = routes.find((r) => r.id === activeRouteId) || routes[0];
  const [importWaypoints, setImportWaypoints] = useState(true);
  const [createDayEndSigns, setCreateDayEndSigns] = useState(true);
  const [routeMenuOpen, setRouteMenuOpen] = useState(false);
  const [isRenamingRoute, setIsRenamingRoute] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showAdvancedTools, setShowAdvancedTools] = useState(uiMode === 'advanced');

  // Initialize Journey Stops from canonicalRoute.stops if present
  const [stops, setStops] = useState<JourneyStop[]>(() => {
    if (canonicalRoute && canonicalRoute.stops && canonicalRoute.stops.length >= 2) {
      return canonicalRoute.stops.map((s) => ({
        id: s.id,
        query: s.customLabel || s.placeName || s.query || '',
        selectedPlace: {
          id: s.placeId || s.id,
          name: s.placeName,
          context: '',
          fullName: s.customLabel || s.placeName,
          lng: s.lng,
          lat: s.lat,
        },
      }));
    }
    return [
      {
        id: 'stop-start',
        query: '',
        selectedPlace: null,
      },
      {
        id: 'stop-end',
        query: '',
        selectedPlace: null,
      },
    ];
  });
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number>(0);
  const [activeStopAutocomplete, setActiveStopAutocomplete] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isBuildingRoute, setIsBuildingRoute] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const isUserTypingRef = useRef(false);

  // Sync stops when switching projects or canonical routes
  useEffect(() => {
    if (isUserTypingRef.current) return;
    if (canonicalRoute?.stops && canonicalRoute.stops.length >= 2) {
      setStops(
        canonicalRoute.stops.map((s) => ({
          id: s.id,
          query: s.customLabel || s.placeName || s.query || '',
          selectedPlace: !isNaN(s.lng) && !isNaN(s.lat) && (s.lng !== 0 || s.lat !== 0)
            ? {
                id: s.placeId || s.id,
                name: s.placeName,
                context: '',
                fullName: s.customLabel || s.placeName,
                lng: s.lng,
                lat: s.lat,
              }
            : null,
        }))
      );
    }
  }, [canonicalRoute?.id, canonicalRoute?.stops]);

  const handleSelectTransport = (tId: CanonicalTransportType, snap: SnapProfile, targetSegmentIndex?: number) => {
    onSetSnapProfile(snap);
    // Requirement D: When switching between road-following and free transport modes,
    // mark incompatible calculated geometry as stale. Do not prematurely mutate activeRoute
    // to present old road-following geometry as the newly selected Air route.
    if (canonicalRoute && onUpdateCanonicalRoute) {
      const segIdx = targetSegmentIndex !== undefined ? targetSegmentIndex : selectedSegmentIndex;
      const currentSegments = canonicalRoute.segments || [];
      const updatedSegments: RouteSegment[] = currentSegments.map((seg, idx) => {
        // ONLY update the selected segment! Preserve every other segment's transportType and routingProfile!
        if (idx === segIdx || (currentSegments.length <= 1 && segIdx === 0)) {
          return {
            ...seg,
            transportType: tId,
            status: 'stale',
            routingProfile: getRoutingProfileForTransport(tId),
          };
        }
        return seg;
      });
      onUpdateCanonicalRoute({
        ...canonicalRoute,
        status: 'stale',
        segments: updatedSegments,
      });
    }
  };

  useEffect(() => {
    setShowAdvancedTools(uiMode === 'advanced');
  }, [uiMode]);

  const syncCanonicalStops = (updatedStops: JourneyStop[]) => {
    if (!canonicalRoute || !onUpdateCanonicalRoute) return;
    const mappedStops: RouteStop[] = updatedStops.map((s, idx) => {
      const prevStop = canonicalRoute.stops?.find((ps) => ps.id === s.id) || canonicalRoute.stops?.[idx];
      let resolvedLng: number = Number.NaN;
      let resolvedLat: number = Number.NaN;

      if (s.selectedPlace) {
        resolvedLng = s.selectedPlace.lng;
        resolvedLat = s.selectedPlace.lat;
      } else if (prevStop && !isNaN(prevStop.lng) && !isNaN(prevStop.lat) && (prevStop.lng !== 0 || prevStop.lat !== 0)) {
        resolvedLng = prevStop.lng;
        resolvedLat = prevStop.lat;
      }

      return {
        id: s.id.startsWith('stop-') ? s.id : `stop-${Date.now()}-${idx}`,
        placeName: s.selectedPlace?.name || s.query || '',
        customLabel: s.selectedPlace?.fullName || s.query || '',
        showLabel: true,
        lng: resolvedLng,
        lat: resolvedLat,
        placeId: s.selectedPlace?.id || prevStop?.placeId,
        query: s.query,
      };
    });
    onUpdateCanonicalRoute({
      ...canonicalRoute,
      status: 'stale',
      stops: mappedStops,
    });
  };

  const handleStopQueryChange = async (stopId: string, value: string) => {
    isUserTypingRef.current = true;
    setStops((prev) => {
      const next = prev.map((s) => (s.id === stopId ? { ...s, query: value, selectedPlace: null } : s));
      syncCanonicalStops(next);
      return next;
    });
    setActiveStopAutocomplete(stopId);

    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    if (value.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const ctrl = new AbortController();
    searchAbortRef.current = ctrl;
    const res = await searchPlaceSuggestions(value, ctrl.signal);
    setSuggestions(res);
  };

  const handleSelectSuggestion = (stopId: string, place: PlaceSuggestion) => {
    setStops((prev) => {
      const next = prev.map((s) =>
        s.id === stopId ? { ...s, query: place.fullName, selectedPlace: place } : s
      );
      syncCanonicalStops(next);
      return next;
    });
    setActiveStopAutocomplete(null);
    setSuggestions([]);

    // When the destination stop (or any selected stop) is chosen, show it immediately on the map
    const isDestination = stopId === stops[stops.length - 1]?.id;
    onPreviewDestination?.({
      id: place.id,
      name: place.name,
      fullName: place.fullName,
      lng: place.lng,
      lat: place.lat,
      isDestination,
    });
  };

  const handleAddStop = () => {
    const newStop: JourneyStop = {
      id: `stop-${Date.now()}`,
      query: '',
      selectedPlace: null,
    };
    // Insert before destination
    setStops((prev) => {
      const next = [
        ...prev.slice(0, Math.max(1, prev.length - 1)),
        newStop,
        prev[prev.length - 1],
      ];
      syncCanonicalStops(next);
      return next;
    });
  };

  const handleRemoveStop = (stopId: string) => {
    if (stops.length <= 2) return;
    setStops((prev) => {
      const next = prev.filter((s) => s.id !== stopId);
      syncCanonicalStops(next);
      return next;
    });
  };

  const handleCreateJourney = async () => {
    if (!activeRoute) return;
    setIsBuildingRoute(true);
    try {
      const resolvedCoords: { lng: number; lat: number; name: string }[] = [];
      for (let i = 0; i < stops.length; i++) {
        const s = stops[i];
        if (s.selectedPlace) {
          resolvedCoords.push({
            lng: s.selectedPlace.lng,
            lat: s.selectedPlace.lat,
            name: s.selectedPlace.name,
          });
        } else {
          // Check if previous canonical stop had valid non-zero coordinates
          const prevStop = canonicalRoute?.stops?.[i];
          if (prevStop && !isNaN(prevStop.lng) && !isNaN(prevStop.lat) && (prevStop.lng !== 0 || prevStop.lat !== 0)) {
            resolvedCoords.push({
              lng: prevStop.lng,
              lat: prevStop.lat,
              name: prevStop.placeName,
            });
          } else if (s.query.trim()) {
            const matches = await searchPlaceSuggestions(s.query);
            if (matches.length > 0) {
              resolvedCoords.push({
                lng: matches[0].lng,
                lat: matches[0].lat,
                name: matches[0].name,
              });
            }
          }
        }
      }

      // Check for unresolved stops: if any stop could not be resolved, PREVENT CALCULATION!
      if (resolvedCoords.length < stops.length || resolvedCoords.length < 2) {
        setIsBuildingRoute(false);
        const unresolvedIdx = stops.findIndex((_, idx) => !resolvedCoords[idx]);
        const stopLabel = unresolvedIdx === 0 ? 'Start' : unresolvedIdx === stops.length - 1 ? 'Destination' : `Stop #${unresolvedIdx + 1}`;
        alert(`Cannot create journey: ${stopLabel} is unresolved. Please select a valid place from the suggestions.`);
        return;
      }

      // Build per-segment transport array preserving each segment's chosen mode
      const segmentTransports: CanonicalTransportType[] = [];
      for (let i = 0; i < resolvedCoords.length - 1; i++) {
        const existingSeg = canonicalRoute?.segments?.[i];
        segmentTransports.push(existingSeg?.transportType || (activeRoute.transportType as CanonicalTransportType) || 'car');
      }

      let journeyResult: JourneyCalculationResult | null = null;
      let calculationSucceeded = false;
      try {
        journeyResult = await buildJourneyWithSegments(resolvedCoords, segmentTransports);
        calculationSucceeded = Array.isArray(journeyResult.points) && journeyResult.points.length >= 2;
      } catch {
        calculationSucceeded = false;
      }

      // Approved Staged Calculation Policy (Requirement D):
      // - On success: commit new geometry and set status 'calculated'
      // - On failure: discard incomplete staged result, preserve previous successful geometry for atomic rollback,
      //   mark status 'stale', and ensure failed calculations do not overwrite segments with corrupt or incompatible geometry.
      if (!calculationSucceeded || !journeyResult) {
        setIsBuildingRoute(false);
        if (canonicalRoute && onUpdateCanonicalRoute) {
          onUpdateCanonicalRoute({
            ...canonicalRoute,
            status: 'stale',
          }, true);
        }
        alert('Could not calculate route. Previous valid route preserved.');
        return;
      }

      const finalGeometry = journeyResult.points;
      const calculationStatus: RouteCalculationStatus = 'calculated';
      const stats = calculateTrackStats(finalGeometry);
      const journeyName = `${resolvedCoords[0].name} → ${resolvedCoords[resolvedCoords.length - 1].name}`;

      // Construct Canonical Route Stops and Segments
      const canonicalStops: RouteStop[] = resolvedCoords.map((c, idx) => ({
        id: canonicalRoute?.stops?.[idx]?.id || `stop-${Date.now()}-${idx}`,
        placeName: c.name,
        customLabel: c.name,
        showLabel: true,
        lng: c.lng,
        lat: c.lat,
      }));

      // Requirement B: Each canonical segment contains only its own geometry, not the entire journey geometry!
      const canonicalSegments: RouteSegment[] = [];
      for (let i = 0; i < canonicalStops.length - 1; i++) {
        const segTransport = segmentTransports[i];
        const segGeometry = journeyResult.segmentGeometries[i] || [];
        canonicalSegments.push({
          id: canonicalRoute?.segments?.[i]?.id || `seg-${Date.now()}-${i}`,
          fromStopId: canonicalStops[i].id,
          toStopId: canonicalStops[i + 1].id,
          transportType: segTransport,
          routingProfile: getRoutingProfileForTransport(segTransport),
          shapingPoints: [],
          use3dSymbol: true,
          status: calculationStatus,
          geometry: segGeometry,
        });
      }

      if (onUpdateCanonicalRoute) {
        onUpdateCanonicalRoute({
          id: canonicalRoute?.id || activeRoute.id,
          name: journeyName,
          status: calculationStatus,
          color: activeRoute.color,
          width: activeRoute.width,
          style: activeRoute.style,
          stops: canonicalStops,
          segments: canonicalSegments,
          calculatedGeometry: finalGeometry,
          stats,
        }, true);
      }

      const primaryTransport = segmentTransports[0] || 'car';
      const updatedRoute: Route = {
        ...activeRoute,
        name: journeyName,
        transportType: primaryTransport as any,
        points: finalGeometry,
        stats,
      };
      onUpdateRoute(updatedRoute, true);
      onFitRoute?.(updatedRoute);
    } catch (err) {
      console.error('Journey creation error:', err);
    } finally {
      setIsBuildingRoute(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportGPX(file, { importWaypoints, createDayEndSigns });
      e.target.value = '';
    }
  };

  const handleReverseRoute = () => {
    setRouteMenuOpen(false);
    if (!activeRoute || activeRoute.points.length < 2) return;
    const reversedPoints = [...activeRoute.points].reverse();
    const updatedStats = calculateTrackStats(reversedPoints);

    if (onUpdateCanonicalRoute && canonicalRoute) {
      const reversedStops = canonicalRoute.stops ? [...canonicalRoute.stops].reverse() : [];
      onUpdateCanonicalRoute({
        ...canonicalRoute,
        stops: reversedStops,
        calculatedGeometry: reversedPoints,
        stats: updatedStats,
      });
    }

    onUpdateRoute({
      ...activeRoute,
      points: reversedPoints,
      stats: updatedStats,
    });
  };

  const handleRenameRoute = () => {
    setRouteMenuOpen(false);
    if (!activeRoute) return;
    setRenameValue(activeRoute.name);
    setIsRenamingRoute(true);
  };

  const handleConfirmRename = () => {
    if (activeRoute && renameValue.trim()) {
      onUpdateRoute({ ...activeRoute, name: renameValue.trim() });
    }
    setIsRenamingRoute(false);
  };

  const handleDuplicateRoute = () => {
    setRouteMenuOpen(false);
    if (onDuplicateRoute) {
      onDuplicateRoute(activeRoute);
    }
  };

  const handleSmoothRoute = () => {
    setRouteMenuOpen(false);
    if (!activeRoute || activeRoute.points.length < 3) return;
    const smoothed = chaikinSmooth(activeRoute.points);
    const updatedStats = calculateTrackStats(smoothed);
    onUpdateRoute({
      ...activeRoute,
      points: smoothed,
      stats: updatedStats,
    });
  };

  const handleAddLeg = () => {
    if (!activeRoute) return;
    const currentLegs = activeRoute.legs || [];
    const defaultFromIdx =
      activeRoute.points.length > 2
        ? Math.floor(activeRoute.points.length / 2)
        : activeRoute.points.length > 0
        ? activeRoute.points.length - 1
        : 0;
    const newLeg: RouteLeg = {
      id: `leg-${Date.now()}`,
      fromPointIndex: defaultFromIdx,
      transportType: 'boat',
      use3dSymbol: true,
      color: activeRoute.color,
    };
    onUpdateRoute({
      ...activeRoute,
      legs: [...currentLegs, newLeg],
    });
    if (canonicalRoute && onUpdateCanonicalRoute) {
      onUpdateCanonicalRoute({
        ...canonicalRoute,
        status: 'stale',
      });
    }
  };

  const handleUpdateLeg = (legId: string, patch: Partial<RouteLeg>) => {
    if (!activeRoute) return;
    onUpdateRoute({
      ...activeRoute,
      legs: (activeRoute.legs || []).map((l) => (l.id === legId ? { ...l, ...patch } : l)),
    });
    if (canonicalRoute && onUpdateCanonicalRoute) {
      onUpdateCanonicalRoute({
        ...canonicalRoute,
        status: 'stale',
      });
    }
  };

  const handleDeleteLeg = (legId: string) => {
    if (!activeRoute) return;
    onUpdateRoute({
      ...activeRoute,
      legs: (activeRoute.legs || []).filter((l) => l.id !== legId),
    });
    if (canonicalRoute && onUpdateCanonicalRoute) {
      onUpdateCanonicalRoute({
        ...canonicalRoute,
        status: 'stale',
      });
    }
  };

  const handleSimplifyRoute = (targetCount: number) => {
    if (!activeRoute || activeRoute.points.length <= targetCount) return;
    const step = activeRoute.points.length / targetCount;
    const simplified = [];
    for (let i = 0; i < activeRoute.points.length; i += step) {
      simplified.push(activeRoute.points[Math.floor(i)]);
    }
    if (simplified[simplified.length - 1] !== activeRoute.points[activeRoute.points.length - 1]) {
      simplified.push(activeRoute.points[activeRoute.points.length - 1]);
    }
    const updatedStats = calculateTrackStats(simplified);
    onUpdateRoute({
      ...activeRoute,
      points: simplified,
      stats: updatedStats,
    });
  };

  return (
    <aside className="panel w-85 h-full overflow-y-auto p-5 flex flex-col space-y-5 text-xs bg-[#0f172a] border-r border-slate-800 text-slate-100">
      {/* 1. Simple Friendly Header */}
      <div>
        <span className="text-[11px] font-bold tracking-wider text-teal-400 uppercase">
          STEP 1 · ROUTE
        </span>
        <h2 className="text-2xl font-extrabold text-slate-100 mt-1 mb-1 tracking-tight">
          Where are we going?
        </h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Create your journey in a few easy steps, or click directly on the map.
        </p>
      </div>

      {/* 2. Simple Journey Builder (Starting Point -> Stops -> Destination) */}
      <div className="space-y-3 bg-[#1e293b]/80 p-3.5 rounded-xl border border-slate-700/80">
        {stops.map((stop, idx) => {
          const isStart = idx === 0;
          const isEnd = idx === stops.length - 1;
          const label = isStart
            ? 'Starting point'
            : isEnd
            ? 'Destination'
            : `Stop ${idx}`;

          return (
            <div key={stop.id} className="relative space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-300 flex items-center space-x-1.5">
                  <MapPin
                    className={`w-3.5 h-3.5 ${
                      isStart
                        ? 'text-teal-400'
                        : isEnd
                        ? 'text-orange-400'
                        : 'text-sky-400'
                    }`}
                  />
                  <span>{label}</span>
                </label>
                {!isStart && !isEnd && (
                  <button
                    type="button"
                    onClick={() => handleRemoveStop(stop.id)}
                    className="text-[10px] text-slate-400 hover:text-red-400"
                  >
                    Remove
                  </button>
                )}
              </div>

              <input
                type="text"
                value={stop.query}
                onFocus={() => {
                  isUserTypingRef.current = true;
                  setActiveStopAutocomplete(stop.id);
                  if (stop.query.trim().length >= 2) {
                    handleStopQueryChange(stop.id, stop.query);
                  }
                }}
                onBlur={() => {
                  setTimeout(() => {
                    isUserTypingRef.current = false;
                    setActiveStopAutocomplete(null);
                  }, 200);
                }}
                onKeyDown={async (e) => {
                  if (e.key === 'Escape') {
                    setActiveStopAutocomplete(null);
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (suggestions.length > 0) {
                      handleSelectSuggestion(stop.id, suggestions[0]);
                    } else if (stop.query.trim().length >= 2) {
                      const matches = await searchPlaceSuggestions(stop.query);
                      if (matches.length > 0) {
                        handleSelectSuggestion(stop.id, matches[0]);
                      }
                    }
                  }
                }}
                onChange={(e) => handleStopQueryChange(stop.id, e.target.value)}
                placeholder={isStart ? 'e.g. Baku, Azerbaijan' : 'e.g. Laza, Azerbaijan'}
                className="w-full px-3 py-2 rounded-lg bg-[#0f172a] border border-slate-700 focus:border-teal-400 focus:outline-none text-xs text-slate-100 placeholder-slate-500"
              />

              {/* Autocomplete Dropdown */}
              {activeStopAutocomplete === stop.id && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-[#0f172a]/95 backdrop-blur-md border border-slate-700/80 rounded-xl shadow-2xl z-50 max-h-56 overflow-y-auto divide-y divide-slate-800/80">
                  {suggestions.map((sug) => (
                    <button
                      key={sug.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectSuggestion(stop.id, sug);
                      }}
                      className="w-full px-3.5 py-2.5 text-left hover:bg-teal-500/15 flex items-center justify-between text-xs transition-colors cursor-pointer group"
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="font-bold text-slate-100 group-hover:text-teal-300 truncate">
                          {sug.name}
                        </span>
                        {sug.context && (
                          <span className="text-[10px] text-slate-400 group-hover:text-slate-300 truncate mt-0.5">
                            {sug.context}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono shrink-0">
                        {sug.lat.toFixed(2)}°, {sug.lng.toFixed(2)}°
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={handleAddStop}
          className="text-xs font-semibold text-teal-400 hover:text-teal-300 flex items-center space-x-1 pt-1 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add another stop</span>
        </button>
      </div>

      {/* 3. How are you travelling? */}
      {activeRoute && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-teal-400 tracking-wider uppercase block">
              HOW ARE YOU TRAVELLING?
            </span>
            {canonicalRoute?.segments && canonicalRoute.segments.length > 1 && (
              <span className="text-[10px] text-slate-400">
                Editing Leg {selectedSegmentIndex + 1} of {canonicalRoute.segments.length}
              </span>
            )}
          </div>

          {/* Segment selector if multi-segment */}
          {canonicalRoute?.segments && canonicalRoute.segments.length > 1 && (
            <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
              {canonicalRoute.segments.map((seg, sIdx) => {
                const fromName = canonicalRoute.stops?.find((s) => s.id === seg.fromStopId)?.placeName || `Stop ${sIdx + 1}`;
                const toName = canonicalRoute.stops?.find((s) => s.id === seg.toStopId)?.placeName || `Stop ${sIdx + 2}`;
                const isSegActive = selectedSegmentIndex === sIdx;
                return (
                  <button
                    key={seg.id}
                    type="button"
                    onClick={() => setSelectedSegmentIndex(sIdx)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all whitespace-nowrap cursor-pointer ${
                      isSegActive
                        ? 'border-teal-500 bg-teal-500/15 text-teal-300 shadow-sm'
                        : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Leg {sIdx + 1}: {fromName} → {toName} ({seg.transportType})
                  </button>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {SIMPLE_TRANSPORTS.map((item) => {
              const currentTransport = canonicalRoute?.segments?.[selectedSegmentIndex]?.transportType || activeRoute.transportType || 'car';
              const isSelected = currentTransport === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    handleSelectTransport(item.id, item.snap, selectedSegmentIndex);
                  }}
                  className={`p-3 rounded-xl border flex flex-col items-center justify-center space-y-1.5 transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? 'bg-teal-500/15 border-teal-500 ring-2 ring-teal-500 text-teal-400 font-bold'
                      : 'bg-[#1e293b] border-slate-700 text-slate-300 hover:border-teal-400'
                  }`}
                >
                  {item.icon}
                  <span className="text-xs">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Create My Route Primary CTA */}
      <div className="space-y-2">
        {canonicalRoute?.status === 'stale' && (
          <div
            data-testid="route-stale-badge"
            className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs"
          >
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Route modified — recalculation needed to refresh preview</span>
          </div>
        )}

        <div className="space-y-2">
          <button
            type="button"
            disabled={isBuildingRoute}
            onClick={handleCreateJourney}
            className="w-full py-3 px-4 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-slate-950 font-extrabold text-sm shadow-lg shadow-teal-500/20 transition-all flex items-center justify-center space-x-2 cursor-pointer"
          >
            {isBuildingRoute ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Finding route...</span>
              </>
            ) : (
              <>
                <Navigation className="w-4 h-4" />
                <span>Create my route →</span>
              </>
            )}
          </button>

          {/* Speed chips accessible in Route tab */}
          {canonicalRoute?.status === 'calculated' && activeRoute && activeRoute.points.length >= 2 && (
            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-300">Preview Speed</span>
              <div
                className="flex items-center space-x-1 bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/60"
                role="radiogroup"
                aria-label="Playback Speed"
              >
                {(['slow', 'normal', 'fast'] as const).map((spd) => {
                  const isSelected = (quickPreviewSpeed || 'normal') === spd;
                  const label = spd === 'slow' ? 'Slow (30)' : spd === 'normal' ? 'Normal (60)' : 'Fast (120)';
                  return (
                    <button
                      key={spd}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      data-testid={`speed-chip-${spd}`}
                      onClick={() => onSetQuickPreviewSpeed?.(spd)}
                      className={`px-2 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-teal-500 text-slate-950 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {canonicalRoute?.status === 'calculated' && activeRoute && activeRoute.points.length >= 2 && (
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-300 text-[11px]">
            <span>
              ✓ Route ready ({activeRoute.stats?.distanceKm || 0} km)
            </span>
            {onNext && (
              <button
                type="button"
                onClick={onNext}
                className="font-bold underline hover:text-teal-200 cursor-pointer"
              >
                Next: Camera →
              </button>
            )}
          </div>
        )}
      </div>

      {/* 5. Progressive Disclosure: Advanced Route Tools */}
      <div className="pt-2 border-t border-slate-800">
        <button
          type="button"
          onClick={() => setShowAdvancedTools(!showAdvancedTools)}
          className="text-xs font-semibold text-slate-400 hover:text-teal-400 flex items-center space-x-1.5 cursor-pointer"
        >
          <span>{showAdvancedTools ? '▾' : '▸'} Advanced route & GPX tools</span>
        </button>

        {showAdvancedTools && (
          <div className="mt-3 space-y-4 pt-2">
            {/* Snap to Roads Toggle */}
            <div className="group">
              <div className="group-title flex items-center justify-between">
                <span>Map click drawing mode</span>
                {snapProfile !== 'off' && (
                  <span className="text-[10px] text-teal-400 font-semibold uppercase tracking-wider">
                    Auto-Routing
                  </span>
                )}
              </div>
              <div className="seg" role="group" aria-label="Snap to roads">
                <button
                  aria-pressed={snapProfile === 'off'}
                  onClick={() => onSetSnapProfile('off')}
                  title="Freehand drawing with smooth curves"
                >
                  Freehand
                </button>
                <button
                  aria-pressed={snapProfile === 'driving'}
                  onClick={() => onSetSnapProfile('driving')}
                  title="Follow roads for driving"
                >
                  Car
                </button>
                <button
                  aria-pressed={snapProfile === 'cycling'}
                  onClick={() => onSetSnapProfile('cycling')}
                  title="Follow bike paths and secondary roads"
                >
                  Bike
                </button>
                <button
                  aria-pressed={snapProfile === 'walking'}
                  onClick={() => onSetSnapProfile('walking')}
                  title="Follow pedestrian paths and trails"
                >
                  Walk
                </button>
              </div>

              {snapProfile !== 'off' && (
                <div className="space-y-1.5 pt-2 border-t border-[var(--border)] mt-2">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-[var(--text)] font-medium">Point spacing</span>
                    <span className="font-mono font-semibold text-teal-400">
                      {routingInterval === 'auto' || !routingInterval
                        ? 'Auto (road curves)'
                        : `Every ${
                            routingInterval < 1
                              ? routingInterval.toFixed(1)
                              : routingInterval.toFixed(routingInterval % 1 === 0 ? 0 : 1)
                          } km`}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => onSetRoutingInterval?.('auto')}
                      className={`px-2 py-1 rounded text-[10px] font-semibold border transition-all ${
                        routingInterval === 'auto' || !routingInterval
                          ? 'border-teal-500 bg-teal-500/15 text-teal-400'
                          : 'border-slate-700 bg-slate-800 text-slate-400'
                      }`}
                    >
                      Auto
                    </button>
                    <input
                      type="range"
                      min={0.1}
                      max={20}
                      step={0.1}
                      value={typeof routingInterval === 'number' ? routingInterval : 1.0}
                      onChange={(e) => onSetRoutingInterval?.(parseFloat(e.target.value))}
                      className="flex-1 h-1.5 bg-slate-700 rounded appearance-none cursor-pointer accent-teal-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* GPX / KML Upload Dropzone */}
            <div className="space-y-2">
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) onImportGPX(file, { importWaypoints, createDayEndSigns });
                }}
                className="border-2 border-dashed border-slate-700 hover:border-teal-400 rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer transition-colors group bg-[#1e293b]/60 text-center"
              >
                <Upload className="w-5 h-5 text-slate-400 group-hover:text-teal-400 mb-1.5 transition-colors" />
                <span className="font-semibold text-slate-200">Drop GPX, KML, KMZ or IGC</span>
                <span className="text-[10px] text-slate-400 mt-0.5">
                  Auto-imports tracks, waypoints & elevation
                </span>
                <input
                  type="file"
                  accept=".gpx,.kml,.kmz,.igc,application/gpx+xml,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              <div className="flex flex-col space-y-1 px-1">
                <label className="flex items-center space-x-2 text-[11px] text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={importWaypoints}
                    onChange={(e) => setImportWaypoints(e.target.checked)}
                    className="rounded border-slate-700"
                  />
                  <span>Import waypoints as signs</span>
                </label>
                <label className="flex items-center space-x-2 text-[11px] text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createDayEndSigns}
                    onChange={(e) => setCreateDayEndSigns(e.target.checked)}
                    className="rounded border-slate-700"
                  />
                  <span>Place a sign at each day's end</span>
                </label>
              </div>
            </div>

            {/* Routes List */}
            <div className="group">
              <div className="group-title flex items-center justify-between">
                <span>Routes ({routes.length} / 6)</span>
                {routes.length < 6 && (
                  <button
                    onClick={onAddRoute}
                    className="flex items-center space-x-1 text-teal-400 hover:opacity-80 font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Route</span>
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                {routes.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => onSelectRoute(r.id)}
                    className={`p-2.5 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                      r.id === activeRouteId
                        ? 'border-teal-500 bg-teal-500/10'
                        : 'border-slate-700 bg-[#1e293b]'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-black/20 shrink-0"
                        style={{ backgroundColor: r.color }}
                      />
                      <div>
                        <div className="font-semibold text-slate-200 leading-tight">{r.name}</div>
                        <div className="text-[10px] text-slate-400">
                          {r.points.length} points
                          {r.stats?.distanceKm ? ` · ${r.stats.distanceKm} km` : ''}
                        </div>
                      </div>
                    </div>

                    {routes.length > 1 && onDeleteRoute && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteRoute(r.id);
                        }}
                        className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                        title="Delete route"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Active Route Advanced Controls */}
            {activeRoute && (
              <div className="group space-y-3 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between relative">
                  {isRenamingRoute ? (
                    <div className="flex items-center gap-1.5 flex-1 mr-2">
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleConfirmRename();
                          if (e.key === 'Escape') setIsRenamingRoute(false);
                        }}
                        autoFocus
                        aria-label="New route name"
                        className="flex-1 min-w-0 px-2 py-1 rounded bg-[#0f172a] border border-teal-500 text-xs text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={handleConfirmRename}
                        className="px-2 py-1 rounded bg-teal-500 text-slate-950 font-bold text-[11px]"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsRenamingRoute(false)}
                        className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-[11px]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <span className="font-semibold text-slate-200 truncate max-w-[130px]">
                      {activeRoute.name}
                    </span>
                  )}
                  <div className="flex items-center space-x-1">
                    {onFitRoute && activeRoute.points.length > 0 && (
                      <button
                        type="button"
                        onClick={() => onFitRoute(activeRoute)}
                        className="flex items-center space-x-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[11px] font-medium text-slate-200"
                      >
                        <Maximize2 className="w-3 h-3 text-teal-400" />
                        <span>Show route</span>
                      </button>
                    )}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setRouteMenuOpen(!routeMenuOpen)}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200"
                      >
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </button>

                      {routeMenuOpen && (
                        <div className="absolute right-0 top-full mt-1 w-44 bg-[#0f172a] border border-slate-700 rounded-lg shadow-xl py-1 z-30 text-[11px] space-y-0.5">
                          <button
                            onClick={handleRenameRoute}
                            className="w-full px-2.5 py-1.5 text-left flex items-center space-x-2 hover:bg-slate-800 text-slate-200"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                            <span>Rename</span>
                          </button>
                          {onDuplicateRoute && (
                            <button
                              onClick={handleDuplicateRoute}
                              className="w-full px-2.5 py-1.5 text-left flex items-center space-x-2 hover:bg-slate-800 text-slate-200"
                            >
                              <Copy className="w-3.5 h-3.5 text-slate-400" />
                              <span>Duplicate as new route</span>
                            </button>
                          )}
                          {activeRoute.points.length > 2 && (
                            <button
                              onClick={handleSmoothRoute}
                              className="w-full px-2.5 py-1.5 text-left flex items-center space-x-2 hover:bg-slate-800 text-slate-200"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                              <span>Make it smooth</span>
                            </button>
                          )}
                          {activeRoute.points.length > 1 && (
                            <button
                              onClick={handleReverseRoute}
                              className="w-full px-2.5 py-1.5 text-left flex items-center space-x-2 hover:bg-slate-800 text-slate-200"
                            >
                              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                              <span>Reverse route</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Multi-Leg Trip Modes */}
                <div className="space-y-1.5 p-2 bg-[#1e293b] rounded-lg border border-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[11px] text-slate-200">
                      Multi-leg transport
                    </span>
                    <button
                      type="button"
                      onClick={handleAddLeg}
                      className="flex items-center space-x-1 text-teal-400 font-semibold text-[10px] hover:underline"
                    >
                      <Plus className="w-3 h-3" />
                      <span>New leg</span>
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {activeRoute.legs?.map((leg) => (
                      <div
                        key={leg.id}
                        className="flex items-center justify-between gap-1.5 p-1.5 bg-[#0f172a] rounded text-[10px]"
                      >
                        <select
                          value={leg.transportType}
                          onChange={(e) =>
                            handleUpdateLeg(leg.id, { transportType: e.target.value as any })
                          }
                          className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-[10px] text-slate-200 flex-1 min-w-0"
                        >
                          {CANONICAL_TRANSPORTS.map((tm) => (
                            <option key={tm.id} value={tm.id}>
                              {tm.label} ({tm.routingDescription})
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center space-x-1 text-slate-400 shrink-0">
                          <span>pt#</span>
                          <input
                            type="number"
                            min={1}
                            max={Math.max(1, activeRoute.points.length)}
                            value={leg.fromPointIndex + 1}
                            onChange={(e) =>
                              handleUpdateLeg(leg.id, {
                                fromPointIndex: Math.max(0, Number(e.target.value) - 1),
                              })
                            }
                            className="w-11 bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-[10px] text-slate-200 text-center"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => handleDeleteLeg(leg.id)}
                          className="text-slate-400 hover:text-red-400 p-0.5"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Canonical 6 Transport Modes & Routing Engines */}
                <div className="space-y-1.5">
                  <div className="group-title flex items-center justify-between">
                    <span>Transport mode & routing engine</span>
                    <span className="text-[10px] text-teal-400 capitalize font-medium">
                      {CANONICAL_TRANSPORTS.find((t) => t.id === (activeRoute.transportType || 'car'))?.label || 'Car'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#1e293b] rounded-lg border border-slate-700">
                    {CANONICAL_TRANSPORTS.map((tm) => {
                      const isSelected = (activeRoute.transportType || 'car') === tm.id;
                      return (
                        <button
                          key={tm.id}
                          type="button"
                          onClick={() => handleSelectTransport(tm.id, tm.snap)}
                          className={`p-2 rounded-lg border flex flex-col items-center justify-center space-y-1 transition-all ${
                            isSelected
                              ? 'border-teal-500 bg-teal-500/15 text-teal-400 font-semibold shadow-sm'
                              : 'border-slate-700 bg-[#0f172a] text-slate-300 hover:border-slate-600 hover:text-slate-100'
                          }`}
                        >
                          {tm.icon}
                          <span className="text-[10px] font-semibold">{tm.label}</span>
                          <span className="text-[8px] text-slate-400">{tm.routingDescription}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Detail Slider */}
                {activeRoute.points.length > 50 && (
                  <div className="space-y-1">
                    <div className="flex justify-between group-title">
                      <span>Route detail (simplify)</span>
                      <output>{activeRoute.points.length} pts</output>
                    </div>
                    <input
                      type="range"
                      min={30}
                      max={Math.max(100, activeRoute.points.length)}
                      value={activeRoute.points.length}
                      onChange={(e) => handleSimplifyRoute(Number(e.target.value))}
                      className="range"
                    />
                  </div>
                )}

                <ElevationProfileChart points={activeRoute.points} color={activeRoute.color} />

                <div className="p-2 rounded-lg bg-[#1e293b] border border-slate-700">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activeRoute.hideLine || false}
                      onChange={(e) => onUpdateRoute({ ...activeRoute, hideLine: e.target.checked })}
                      className="rounded border-slate-700"
                    />
                    <span className="flex items-center space-x-1.5 text-[11px] font-medium text-slate-200">
                      <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                      <span>No line (show moving symbol only)</span>
                    </span>
                  </label>
                </div>

                {activeRoute.points.length > 0 && (
                  <button
                    onClick={() => onUpdateRoute({ ...activeRoute, points: [], stats: undefined })}
                    className="btn block text-red-400 hover:text-red-300 border-red-500/20 hover:border-red-500/40"
                  >
                    Clear {activeRoute.points.length} points
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
