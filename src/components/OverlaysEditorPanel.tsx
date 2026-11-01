import React from 'react';
import { OverlayConfig } from '../types';

interface OverlaysEditorPanelProps {
  overlays: OverlayConfig;
  onUpdateOverlays: (overlays: OverlayConfig) => void;
}

export const OverlaysEditorPanel: React.FC<OverlaysEditorPanelProps> = ({
  overlays,
  onUpdateOverlays,
}) => {
  return (
    <aside className="panel w-80 h-full overflow-y-auto p-4 flex flex-col space-y-4 text-xs">
      <div>
        <h2>4. Dashboard Overlays</h2>
        <p className="lede">
          Add titles, live distance, altitude, speed, a dynamic elevation profile, and a compass rose to your video.
        </p>
      </div>

      {/* Title & Subtitle */}
      <div className="group space-y-2">
        <div className="group-title">Trip Title</div>
        <input
          type="text"
          value={overlays.title || ''}
          onChange={(e) => onUpdateOverlays({ ...overlays, title: e.target.value })}
          placeholder="e.g. Crossing the Alps"
          className="field w-full text-xs"
        />
        <input
          type="text"
          value={overlays.subtitle || ''}
          onChange={(e) => onUpdateOverlays({ ...overlays, subtitle: e.target.value })}
          placeholder="e.g. Day 1 · 420 km"
          className="field w-full text-xs"
        />
      </div>

      {/* Telemetry Metrics */}
      <div className="group">
        <div className="group-title">Telemetry Metrics</div>
        <label className="toggle">
          Distance Counter
          <input
            type="checkbox"
            checked={overlays.showDistance}
            onChange={(e) => onUpdateOverlays({ ...overlays, showDistance: e.target.checked })}
          />
        </label>
        <label className="toggle">
          Live Altitude
          <input
            type="checkbox"
            checked={overlays.showAltitude}
            onChange={(e) => onUpdateOverlays({ ...overlays, showAltitude: e.target.checked })}
          />
        </label>
        <label className="toggle">
          Speed Metric
          <input
            type="checkbox"
            checked={overlays.showSpeed}
            onChange={(e) => onUpdateOverlays({ ...overlays, showSpeed: e.target.checked })}
          />
        </label>
        <label className="toggle">
          Elevation Profile Chart
          <input
            type="checkbox"
            checked={overlays.showElevationProfile}
            onChange={(e) =>
              onUpdateOverlays({ ...overlays, showElevationProfile: e.target.checked })
            }
          />
        </label>
        {/* Oct 21 changelog: Climb & Descent counter */}
        <label className="toggle">
          Climb & Descent (Ascent/Descent Counters)
          <input
            type="checkbox"
            checked={overlays.showClimbDescent || false}
            onChange={(e) =>
              onUpdateOverlays({ ...overlays, showClimbDescent: e.target.checked })
            }
          />
        </label>
        <label className="toggle">
          Compass Rose
          <input
            type="checkbox"
            checked={overlays.showCompass}
            onChange={(e) => onUpdateOverlays({ ...overlays, showCompass: e.target.checked })}
          />
        </label>
      </div>

      {/* Measurement Units */}
      <div className="group">
        <div className="group-title">Units of Measurement</div>
        <div className="seg" role="group">
          {(['metric', 'imperial', 'nautical'] as const).map((unit) => (
            <button
              key={unit}
              aria-pressed={overlays.unit === unit}
              onClick={() => onUpdateOverlays({ ...overlays, unit })}
            >
              {unit === 'metric' ? 'Metric (km/m)' : unit === 'imperial' ? 'Imperial (mi/ft)' : 'Nautical (nm)'}
            </button>
          ))}
        </div>
      </div>

      {/* Overlay Theme */}
      <div className="group">
        <div className="group-title">Overlay Aesthetic</div>
        <select
          value={overlays.theme}
          onChange={(e) => onUpdateOverlays({ ...overlays, theme: e.target.value as any })}
          className="field w-full"
        >
          <option value="dark">Dark Glass (Clean HUD)</option>
          <option value="light">Crisp Light</option>
          <option value="vintage">Vintage Parchment</option>
          <option value="minimal">Minimalist Monochrome</option>
          <option value="bold">Bold Sport</option>
          <option value="outdoor">Outdoor Topo</option>
        </select>
      </div>
    </aside>
  );
};
