import React, { useState, useEffect, useRef } from 'react';
import { Route, RouteLeg, TransportType, UIMode, DestinationPreview } from '../types';
import {
  SnapProfile,
  PlaceSuggestion,
  searchPlaceSuggestions,
  buildJourneyFromStops,
} from '../utils/roadRouter';
import { ElevationProfileChart } from './ElevationProfileChart';
import { ALL_TRANSPORTS, TRANSPORT_CATEGORIES, TransportMeta } from '../constants/transports';
import { calculateTrackStats } from '../utils/gpxParser';
import { chaikinSmooth } from '../utils/routeSmoothing';
import {
  Upload,
  Plus,
  Trash2,
  Car,
  Bike,
  Footprints,
  Compass,
  Plane,
  Ship,
  Train,
  Shield,
  Waves,
  Truck,
  Bus,
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
} from 'lucide-react';

interface RouteEditorPanelProps {
  routes: Route[];
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
  onUpdateRoute: (route: Route) => void;
  onDeleteRoute?: (id: string) => void;
  onImportGPX: (file: File, options?: { importWaypoints: boolean; createDayEndSigns: boolean }) => void;
  onPreviewDestination?: (dest: DestinationPreview | null) => void;
  onNext?: () => void;
}

interface JourneyStop {
  id: string;
  query: string;
  selectedPlace?: PlaceSuggestion | null;
}

const SIMPLE_TRANSPORTS: { id: TransportType; label: string; icon: React.ReactNode; snap: SnapProfile }[] = [
  { id: 'car', label: 'Car', icon: <Car className="w-5 h-5" />, snap: 'driving' },
  { id: 'walking', label: 'Walk', icon: <Footprints className="w-5 h-5" />, snap: 'walking' },
  { id: 'plane', label: 'Plane', icon: <Plane className="w-5 h-5" />, snap: 'off' },
  { id: 'bicycle', label: 'Bike', icon: <Bike className="w-5 h-5" />, snap: 'cycling' },
  { id: 'train', label: 'Train', icon: <Train className="w-5 h-5" />, snap: 'driving' },
  { id: 'boat', label: 'Boat', icon: <Ship className="w-5 h-5" />, snap: 'off' },
];

const getCategoryIcon = (iconName: string) => {
  switch (iconName) {
    case 'Car': return <Car className="w-3.5 h-3.5" />;
    case 'Bike': return <Bike className="w-3.5 h-3.5" />;
    case 'Footprints': return <Footprints className="w-3.5 h-3.5" />;
    case 'Plane': return <Plane className="w-3.5 h-3.5" />;
    case 'Ship': return <Ship className="w-3.5 h-3.5" />;
    case 'Train': return <Train className="w-3.5 h-3.5" />;
    case 'Shield': return <Shield className="w-3.5 h-3.5" />;
    case 'Waves': return <Waves className="w-3.5 h-3.5" />;
    case 'Truck': return <Truck className="w-3.5 h-3.5" />;
    case 'Bus': return <Bus className="w-3.5 h-3.5" />;
    default: return <Compass className="w-3.5 h-3.5" />;
  }
};

export const RouteEditorPanel: React.FC<RouteEditorPanelProps> = ({
  routes,
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
  onDeleteRoute,
  onImportGPX,
  onPreviewDestination,
  onNext,
}) => {
  const activeRoute = routes.find((r) => r.id === activeRouteId) || routes[0];
  const [activeCategory, setActiveCategory] = useState<TransportMeta['category']>('road');
  const [importWaypoints, setImportWaypoints] = useState(true);
  const [createDayEndSigns, setCreateDayEndSigns] = useState(true);
  const [routeMenuOpen, setRouteMenuOpen] = useState(false);
  const [showAdvancedTools, setShowAdvancedTools] = useState(uiMode === 'advanced');

  // Simple Journey Builder State
  const [stops, setStops] = useState<JourneyStop[]>([
    {
      id: 'stop-start',
      query: 'Baku, Azerbaijan',
      selectedPlace: {
        id: 'baku',
        name: 'Baku',
        context: 'Azerbaijan',
        fullName: 'Baku, Azerbaijan',
        lng: 49.8671,
        lat: 40.4093,
      },
    },
    {
      id: 'stop-end',
      query: 'Laza, Azerbaijan',
      selectedPlace: {
        id: 'laza',
        name: 'Laza',
        context: 'Qusar, Azerbaijan',
        fullName: 'Laza, Azerbaijan',
        lng: 48.1156,
        lat: 41.2969,
      },
    },
  ]);
  const [activeStopAutocomplete, setActiveStopAutocomplete] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isBuildingRoute, setIsBuildingRoute] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setShowAdvancedTools(uiMode === 'advanced');
  }, [uiMode]);

  const handleStopQueryChange = async (stopId: string, value: string) => {
    setStops((prev) =>
      prev.map((s) => (s.id === stopId ? { ...s, query: value, selectedPlace: null } : s))
    );
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
    setStops((prev) =>
      prev.map((s) =>
        s.id === stopId ? { ...s, query: place.fullName, selectedPlace: place } : s
      )
    );
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
    setStops((prev) => [
      ...prev.slice(0, Math.max(1, prev.length - 1)),
      newStop,
      prev[prev.length - 1],
    ]);
  };

  const handleRemoveStop = (stopId: string) => {
    if (stops.length <= 2) return;
    setStops((prev) => prev.filter((s) => s.id !== stopId));
  };

  const handleCreateJourney = async () => {
    if (!activeRoute) return;
    setIsBuildingRoute(true);
    try {
      const resolvedCoords: { lng: number; lat: number; name: string }[] = [];
      for (const s of stops) {
        if (s.selectedPlace) {
          resolvedCoords.push({
            lng: s.selectedPlace.lng,
            lat: s.selectedPlace.lat,
            name: s.selectedPlace.name,
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

      if (resolvedCoords.length >= 2) {
        const transport = activeRoute.transportType || 'car';
        const journeyPoints = await buildJourneyFromStops(resolvedCoords, transport);
        const stats = calculateTrackStats(journeyPoints);
        const journeyName = `${resolvedCoords[0].name} → ${resolvedCoords[resolvedCoords.length - 1].name}`;
        const updatedRoute: Route = {
          ...activeRoute,
          name: journeyName,
          points: journeyPoints,
          stats,
        };
        onUpdateRoute(updatedRoute);
        onFitRoute?.(updatedRoute);
      }
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
    onUpdateRoute({
      ...activeRoute,
      points: reversedPoints,
      stats: updatedStats,
    });
  };

  const handleRenameRoute = () => {
    setRouteMenuOpen(false);
    const newName = prompt('Rename route:', activeRoute.name);
    if (newName && newName.trim()) {
      onUpdateRoute({ ...activeRoute, name: newName.trim() });
    }
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
      transportType: 'ferry',
      use3dSymbol: true,
      color: activeRoute.color,
    };
    onUpdateRoute({
      ...activeRoute,
      legs: [...currentLegs, newLeg],
    });
  };

  const handleUpdateLeg = (legId: string, patch: Partial<RouteLeg>) => {
    if (!activeRoute) return;
    onUpdateRoute({
      ...activeRoute,
      legs: (activeRoute.legs || []).map((l) => (l.id === legId ? { ...l, ...patch } : l)),
    });
  };

  const handleDeleteLeg = (legId: string) => {
    if (!activeRoute) return;
    onUpdateRoute({
      ...activeRoute,
      legs: (activeRoute.legs || []).filter((l) => l.id !== legId),
    });
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

  const filteredTransports = ALL_TRANSPORTS.filter((t) => t.category === activeCategory);

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
                  setActiveStopAutocomplete(stop.id);
                  if (stop.query.trim().length >= 2) {
                    handleStopQueryChange(stop.id, stop.query);
                  }
                }}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
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
                <div className="absolute left-0 right-0 top-full mt-1 bg-[#0f172a] border border-slate-700 rounded-xl shadow-2xl z-40 overflow-hidden">
                  {suggestions.map((sug) => (
                    <button
                      key={sug.id}
                      type="button"
                      onClick={() => handleSelectSuggestion(stop.id, sug)}
                      className="w-full px-3 py-2 text-left hover:bg-teal-500/15 flex items-center justify-between text-xs border-b border-slate-800/60 last:border-none"
                    >
                      <span className="font-semibold text-slate-200">{sug.name}</span>
                      <span className="text-[10px] text-slate-400 truncate ml-2">
                        {sug.context}
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
          <span className="text-[11px] font-bold text-teal-400 tracking-wider uppercase block">
            HOW ARE YOU TRAVELLING?
          </span>
          <div className="grid grid-cols-3 gap-2">
            {SIMPLE_TRANSPORTS.map((item) => {
              const isSelected = (activeRoute.transportType || 'car') === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSetSnapProfile(item.snap);
                    onUpdateRoute({ ...activeRoute, transportType: item.id });
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
        <button
          type="button"
          disabled={isBuildingRoute}
          onClick={handleCreateJourney}
          className="w-full py-3 px-4 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-slate-950 font-extrabold text-sm shadow-lg shadow-teal-500/20 transition-all flex items-center justify-center space-x-2 cursor-pointer"
        >
          {isBuildingRoute ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Finding the best route...</span>
            </>
          ) : (
            <>
              <Navigation className="w-4 h-4" />
              <span>Create my route →</span>
            </>
          )}
        </button>

        {activeRoute && activeRoute.points.length >= 2 && (
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
                  <span className="font-semibold text-slate-200 truncate max-w-[130px]">
                    {activeRoute.name}
                  </span>
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
                          {ALL_TRANSPORTS.map((tm) => (
                            <option key={tm.id} value={tm.id}>
                              {tm.label}
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

                {/* All 59 Transports Picker */}
                <div className="space-y-1.5">
                  <div className="group-title flex items-center justify-between">
                    <span>All 59 transport vehicles</span>
                    <span className="text-[10px] text-slate-400 capitalize">
                      {ALL_TRANSPORTS.find((t) => t.id === (activeRoute.transportType || 'car'))?.label}
                    </span>
                  </div>
                  <div className="flex overflow-x-auto space-x-1 pb-1 scrollbar-none">
                    {TRANSPORT_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id)}
                        className={`px-2 py-1 rounded-md text-[10px] whitespace-nowrap border transition-all ${
                          activeCategory === cat.id
                            ? 'border-teal-500 bg-teal-500/15 text-teal-400 font-semibold'
                            : 'border-slate-700 bg-slate-800 text-slate-400'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 max-h-44 overflow-y-auto p-1 bg-[#1e293b] rounded-lg border border-slate-700">
                    {filteredTransports.map((tm) => (
                      <button
                        key={tm.id}
                        onClick={() => onUpdateRoute({ ...activeRoute, transportType: tm.id })}
                        className={`p-1.5 rounded-lg border flex flex-col items-center justify-center space-y-1 transition-all ${
                          (activeRoute.transportType || 'car') === tm.id
                            ? 'border-teal-500 bg-teal-500/15 text-teal-400 font-semibold'
                            : 'border-slate-700 bg-[#0f172a] text-slate-400'
                        }`}
                      >
                        {getCategoryIcon(tm.iconName)}
                        <span className="text-[9px] text-center truncate w-full">{tm.label}</span>
                      </button>
                    ))}
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
