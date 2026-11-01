import React, { useState } from 'react';
import { Route, RouteLeg } from '../types';
import { SnapProfile } from '../utils/roadRouter';
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
} from 'lucide-react';

interface RouteEditorPanelProps {
  routes: Route[];
  activeRouteId: string;
  snapProfile: SnapProfile;
  onSetSnapProfile: (profile: SnapProfile) => void;
  onSelectRoute: (id: string) => void;
  onAddRoute: () => void;
  onDuplicateRoute?: (route: Route) => void;
  onFitRoute?: (route: Route) => void;
  onUpdateRoute: (route: Route) => void;
  onDeleteRoute?: (id: string) => void;
  onImportGPX: (file: File, options?: { importWaypoints: boolean; createDayEndSigns: boolean }) => void;
}

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
  snapProfile,
  onSetSnapProfile,
  onSelectRoute,
  onAddRoute,
  onDuplicateRoute,
  onFitRoute,
  onUpdateRoute,
  onDeleteRoute,
  onImportGPX,
}) => {
  const activeRoute = routes.find((r) => r.id === activeRouteId) || routes[0];
  const [activeCategory, setActiveCategory] = useState<TransportMeta['category']>('road');
  const [importWaypoints, setImportWaypoints] = useState(true);
  const [createDayEndSigns, setCreateDayEndSigns] = useState(true);
  const [routeMenuOpen, setRouteMenuOpen] = useState(false);

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
    const fromIndex = activeRoute.points.length > 0 ? activeRoute.points.length - 1 : 0;
    const newLeg: RouteLeg = {
      id: `leg-${Date.now()}`,
      fromPointIndex: fromIndex,
      transportType: 'boat',
      use3dSymbol: true,
      color: activeRoute.color,
    };
    onUpdateRoute({
      ...activeRoute,
      legs: [...currentLegs, newLeg],
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
    <aside className="panel w-80 h-full overflow-y-auto p-4 flex flex-col space-y-4 text-xs">
      <div>
        <h2>1. Draw or Import Route</h2>
        <p className="lede">
          Click on the map to draw points, or drop a GPX / KML file from your watch or bike computer.
        </p>
      </div>

      {/* Snap to Roads Toggle (OSRM / BRouter engine) */}
      <div className="group">
        <div className="group-title flex items-center justify-between">
          <span>Snap to roads</span>
          {snapProfile !== 'off' && (
            <span className="text-[10px] text-[var(--accent)] font-semibold uppercase tracking-wider">
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
      </div>

      {/* GPX / KML Upload Dropzone */}
      <div className="space-y-2">
        <label className="border-2 border-dashed border-[var(--border)] hover:border-[var(--accent)] rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer transition-colors group bg-[var(--panel-2)] text-center">
          <Upload className="w-5 h-5 text-[var(--muted)] group-hover:text-[var(--accent)] mb-1.5 transition-colors" />
          <span className="font-semibold text-[var(--text)]">Drop GPX, KML, KMZ or IGC</span>
          <span className="text-[10px] text-[var(--muted)] mt-0.5">
            Auto-imports tracks, waypoints & elevation
          </span>
          <input
            type="file"
            accept=".gpx,.kml,.kmz,.igc,application/gpx+xml,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
        
        {/* Import Preferences (Oct 15 & 29 changelog) */}
        <div className="flex flex-col space-y-1 px-1">
          <label className="flex items-center space-x-2 text-[11px] text-[var(--muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={importWaypoints}
              onChange={(e) => setImportWaypoints(e.target.checked)}
              className="rounded border-[var(--border)]"
            />
            <span>Import waypoints as signs</span>
          </label>
          <label className="flex items-center space-x-2 text-[11px] text-[var(--muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={createDayEndSigns}
              onChange={(e) => setCreateDayEndSigns(e.target.checked)}
              className="rounded border-[var(--border)]"
            />
            <span>Place a sign at each day's end</span>
          </label>
        </div>
      </div>

      {/* Routes List (Up to 6 routes - Oct 16 changelog) */}
      <div className="group">
        <div className="group-title flex items-center justify-between">
          <span>Routes ({routes.length} / 6)</span>
          {routes.length < 6 && (
            <button
              onClick={onAddRoute}
              className="flex items-center space-x-1 text-[var(--accent)] hover:opacity-80 font-semibold"
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
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                  : 'border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--border-2)]'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <span
                  className="w-3.5 h-3.5 rounded-full border border-black/20 shrink-0"
                  style={{ backgroundColor: r.color }}
                />
                <div>
                  <div className="font-semibold text-[var(--text)] leading-tight">{r.name}</div>
                  <div className="text-[10px] text-[var(--muted)]">
                    {r.points.length} points
                    {r.stats?.distanceKm ? ` · ${r.stats.distanceKm} km` : ''}
                    {r.hideLine ? ' · Symbol only' : ''}
                  </div>
                </div>
              </div>

              {routes.length > 1 && onDeleteRoute && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteRoute(r.id);
                  }}
                  className="p-1 text-[var(--muted)] hover:text-red-400 transition-colors"
                  title="Delete route"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Active Route Telemetry & Properties */}
      {activeRoute && (
        <div className="group space-y-3 pt-2 border-t border-[var(--border)]">
          {/* Action Row: Route Name, Show Route & ⋯ Actions Menu (Official Help Guide feature) */}
          <div className="flex items-center justify-between relative">
            <span className="font-semibold text-[var(--text)] truncate max-w-[130px]">{activeRoute.name}</span>
            <div className="flex items-center space-x-1">
              {onFitRoute && activeRoute.points.length > 0 && (
                <button
                  type="button"
                  onClick={() => onFitRoute(activeRoute)}
                  className="flex items-center space-x-1 px-2 py-1 bg-[var(--panel-2)] hover:bg-[var(--panel-3)] border border-[var(--border)] rounded text-[11px] font-medium text-[var(--text)] transition-colors"
                  title="Fit whole route in window (Show route)"
                >
                  <Maximize2 className="w-3 h-3 text-[var(--accent)]" />
                  <span>Show route</span>
                </button>
              )}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setRouteMenuOpen(!routeMenuOpen)}
                  className="p-1 rounded bg-[var(--panel-2)] hover:bg-[var(--panel-3)] border border-[var(--border)] text-[var(--text)] transition-colors"
                  title="Route actions (Rename, Duplicate, Smooth, Reverse, Clear)"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>

                {routeMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-xl py-1 z-30 text-[11px] space-y-0.5">
                    <button
                      onClick={handleRenameRoute}
                      className="w-full px-2.5 py-1.5 text-left flex items-center space-x-2 hover:bg-[var(--panel-2)] text-[var(--text)]"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-[var(--muted)]" />
                      <span>Rename</span>
                    </button>
                    {onDuplicateRoute && (
                      <button
                        onClick={handleDuplicateRoute}
                        className="w-full px-2.5 py-1.5 text-left flex items-center space-x-2 hover:bg-[var(--panel-2)] text-[var(--text)]"
                      >
                        <Copy className="w-3.5 h-3.5 text-[var(--muted)]" />
                        <span>Duplicate as new route</span>
                      </button>
                    )}
                    {activeRoute.points.length > 2 && (
                      <button
                        onClick={handleSmoothRoute}
                        className="w-full px-2.5 py-1.5 text-left flex items-center space-x-2 hover:bg-[var(--panel-2)] text-[var(--text)]"
                        title="Smooth out sharp corners and GPS noise"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>Make it smooth</span>
                      </button>
                    )}
                    {activeRoute.points.length > 1 && (
                      <button
                        onClick={handleReverseRoute}
                        className="w-full px-2.5 py-1.5 text-left flex items-center space-x-2 hover:bg-[var(--panel-2)] text-[var(--text)]"
                      >
                        <ArrowUpDown className="w-3.5 h-3.5 text-[var(--muted)]" />
                        <span>Reverse route</span>
                      </button>
                    )}
                    {activeRoute.points.length > 0 && (
                      <button
                        onClick={() => {
                          setRouteMenuOpen(false);
                          if (confirm('Clear all points on this route?')) {
                            onUpdateRoute({ ...activeRoute, points: [], stats: undefined });
                          }
                        }}
                        className="w-full px-2.5 py-1.5 text-left flex items-center space-x-2 hover:bg-red-500/10 text-red-400 border-t border-[var(--border)] mt-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Clear route</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Multi-Leg Trip Modes (Official Help Guide feature) */}
          <div className="space-y-1.5 p-2 bg-[var(--panel-2)] rounded-lg border border-[var(--border)]">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[11px] text-[var(--text)]">Route legs</span>
              <button
                type="button"
                onClick={handleAddLeg}
                className="flex items-center space-x-1 text-[var(--accent)] font-semibold text-[10px] hover:underline"
              >
                <Plus className="w-3 h-3" />
                <span>New leg</span>
              </button>
            </div>
            <div className="space-y-1 max-h-28 overflow-y-auto">
              <div className="flex items-center justify-between p-1.5 bg-[var(--panel)] rounded text-[10px]">
                <span className="font-medium">
                  Leg 1: {ALL_TRANSPORTS.find((t) => t.id === (activeRoute.transportType || 'car'))?.label}
                </span>
                <span className="text-[var(--muted)]">Start → End</span>
              </div>
              {activeRoute.legs?.map((leg, idx) => (
                <div key={leg.id} className="flex items-center justify-between p-1.5 bg-[var(--panel)] rounded text-[10px]">
                  <span className="font-medium">
                    Leg {idx + 2}: {ALL_TRANSPORTS.find((t) => t.id === leg.transportType)?.label || leg.transportType}
                  </span>
                  <span className="text-[var(--muted)]">From pt #{leg.fromPointIndex}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Telemetry Stats Card */}
          {activeRoute.stats && (
            <div className="grid grid-cols-2 gap-2 p-2 rounded-xl bg-[var(--panel-2)] border border-[var(--border)] text-center">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Distance</div>
                <div className="text-sm font-bold text-[var(--text)] font-mono">
                  {activeRoute.stats.distanceKm} km
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Gain / Loss</div>
                <div className="text-sm font-bold text-[var(--text)] font-mono">
                  {activeRoute.stats.elevationGainM !== undefined
                    ? `+${activeRoute.stats.elevationGainM}m`
                    : '—'}
                </div>
              </div>
            </div>
          )}

          {/* Elevation Profile SVG Chart */}
          <ElevationProfileChart points={activeRoute.points} color={activeRoute.color} />

          {/* Transport Mode Categories (Oct 21 & 27 changelogs) */}
          <div className="space-y-1.5">
            <div className="group-title flex items-center justify-between">
              <span>Transport symbol</span>
              <span className="text-[10px] text-[var(--muted)] capitalize">
                {ALL_TRANSPORTS.find((t) => t.id === (activeRoute.transportType || 'car'))?.label}
              </span>
            </div>

            {/* Category tabs */}
            <div className="flex overflow-x-auto space-x-1 pb-1 scrollbar-none">
              {TRANSPORT_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-2 py-1 rounded-md text-[10px] whitespace-nowrap border transition-all ${
                    activeCategory === cat.id
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] font-semibold'
                      : 'border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Transport icon grid */}
            <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto p-1 bg-[var(--panel-2)] rounded-lg border border-[var(--border)]">
              {filteredTransports.map((tm) => (
                <button
                  key={tm.id}
                  onClick={() => onUpdateRoute({ ...activeRoute, transportType: tm.id })}
                  className={`p-1.5 rounded-lg border flex flex-col items-center justify-center space-y-1 transition-all ${
                    (activeRoute.transportType || 'car') === tm.id
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] font-semibold shadow-sm'
                      : 'border-[var(--border)] bg-[var(--panel-1)] text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {getCategoryIcon(tm.iconName)}
                  <span className="text-[9px] text-center truncate w-full">{tm.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Detail Slider to Simplify Long Tracks (Official FAQ feature) */}
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
              <div className="range-labels">
                <span>Fewer points</span>
                <span>Full detail</span>
              </div>
              <p className="hint">Use the detail slider to simplify long tracks.</p>
            </div>
          )}

          {/* Oct 8 changelog: Symbol scale slider (0.5x to 2.0x) */}
          <div className="space-y-1">
            <div className="flex justify-between group-title">
              <span>Symbol size</span>
              <output>{activeRoute.symbolScale || 1.0}×</output>
            </div>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={activeRoute.symbolScale || 1.0}
              onChange={(e) => onUpdateRoute({ ...activeRoute, symbolScale: Number(e.target.value) })}
              className="range"
            />
          </div>

          {/* Oct 8 changelog: No line, just symbol toggle */}
          <div className="p-2 rounded-lg bg-[var(--panel-2)] border border-[var(--border)]">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={activeRoute.hideLine || false}
                onChange={(e) => onUpdateRoute({ ...activeRoute, hideLine: e.target.checked })}
                className="rounded border-[var(--border)]"
              />
              <span className="flex items-center space-x-1.5 text-[11px] font-medium text-[var(--text)]">
                <EyeOff className="w-3.5 h-3.5 text-[var(--muted)]" />
                <span>No line (show moving symbol only)</span>
              </span>
            </label>
          </div>

          {/* Line Style (Solid / Dashed / Dotted) - Hidden if hideLine is true */}
          {!activeRoute.hideLine && (
            <>
              <div className="space-y-1.5">
                <div className="group-title">Line dash</div>
                <div className="seg" role="group">
                  {(['solid', 'dashed', 'dotted'] as const).map((style) => (
                    <button
                      key={style}
                      aria-pressed={(activeRoute.style || 'solid') === style}
                      onClick={() => onUpdateRoute({ ...activeRoute, style })}
                    >
                      {style.charAt(0).toUpperCase() + style.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Line Width */}
              <div className="space-y-1">
                <div className="flex justify-between group-title">
                  <span>Line width</span>
                  <output>{activeRoute.width}px</output>
                </div>
                <input
                  type="range"
                  min={2}
                  max={16}
                  value={activeRoute.width}
                  onChange={(e) => onUpdateRoute({ ...activeRoute, width: Number(e.target.value) })}
                  className="range"
                />
              </div>
            </>
          )}

          {/* Route Color */}
          <div className="space-y-1.5">
            <div className="group-title">Route color</div>
            <div className="flex items-center space-x-2">
              {['#ff4d2e', '#ff9800', '#ffd600', '#4caf50', '#2196f3', '#9c27b0', '#ffffff'].map(
                (c) => (
                  <button
                    key={c}
                    onClick={() => onUpdateRoute({ ...activeRoute, color: c })}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${
                      activeRoute.color === c ? 'scale-110 border-white' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                )
              )}
            </div>
          </div>

          {/* Clear Points */}
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
    </aside>
  );
};
