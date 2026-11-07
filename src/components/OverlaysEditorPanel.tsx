import React from 'react';
import { OverlayConfig } from '../types';
import { Gauge, Mountain, Compass, Activity, Navigation } from 'lucide-react';

interface OverlaysEditorPanelProps {
  overlays: OverlayConfig;
  mode?: 'title' | 'info';
  onUpdateOverlays: (overlays: OverlayConfig) => void;
  onNext?: () => void;
}

export const OverlaysEditorPanel: React.FC<OverlaysEditorPanelProps> = ({
  overlays,
  mode = 'info',
  onUpdateOverlays,
  onNext,
}) => {
  if (mode === 'title') {
    return (
      <aside className="panel w-85 h-full overflow-y-auto p-5 flex flex-col space-y-5 text-xs bg-[#0f172a] border-r border-slate-800 text-slate-100">
        <div>
          <span className="text-[11px] font-bold tracking-wider text-teal-400 uppercase">
            STEP 5 · TITLE
          </span>
          <h2 className="text-2xl font-extrabold text-slate-100 mt-1 mb-1 tracking-tight">
            What is the video called?
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Add a title and subtitle that appear at the top of your travel video.
          </p>
        </div>

        <div className="space-y-4 bg-[#1e293b]/80 p-4 rounded-xl border border-slate-700/80">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-teal-400 uppercase tracking-wider block">
              VIDEO TITLE
            </label>
            <input
              type="text"
              value={overlays.title || ''}
              onChange={(e) => onUpdateOverlays({ ...overlays, title: e.target.value })}
              placeholder="e.g. Summer Roadtrip to Laza"
              className="w-full px-3 py-2.5 rounded-lg bg-[#0f172a] border border-slate-700 focus:border-teal-400 focus:outline-none text-sm font-semibold text-slate-100 placeholder-slate-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-teal-400 uppercase tracking-wider block">
              SUBTITLE (OPTIONAL)
            </label>
            <input
              type="text"
              value={overlays.subtitle || ''}
              onChange={(e) => onUpdateOverlays({ ...overlays, subtitle: e.target.value })}
              placeholder="e.g. August 2026 · 210 km"
              className="w-full px-3 py-2 rounded-lg bg-[#0f172a] border border-slate-700 focus:border-teal-400 focus:outline-none text-xs text-slate-200 placeholder-slate-500"
            />
          </div>
        </div>

        {/* Visual Card Style Picker */}
        <div className="space-y-2.5">
          <span className="text-[11px] font-bold text-teal-400 tracking-wider uppercase block">
            CARD LOOK & STYLE
          </span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: 'dark', label: 'Dark Glass', desc: 'Sleek dark badge' },
                { id: 'light', label: 'Crisp Light', desc: 'Bright white card' },
                { id: 'bold', label: 'Bold Sport', desc: 'High-contrast punchy' },
                { id: 'vintage', label: 'Vintage Paper', desc: 'Warm journal look' },
              ] as const
            ).map((style) => {
              const active = overlays.theme === style.id;
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => onUpdateOverlays({ ...overlays, theme: style.id })}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    active
                      ? 'bg-teal-500/15 border-teal-500 ring-2 ring-teal-500'
                      : 'bg-[#1e293b] border-slate-700 hover:border-teal-400'
                  }`}
                >
                  <strong
                    className={`text-xs block ${
                      active ? 'text-teal-400' : 'text-slate-200'
                    }`}
                  >
                    {style.label}
                  </strong>
                  <span className="text-[10px] text-slate-400">{style.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {onNext && (
          <div className="pt-4 mt-auto border-t border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={onNext}
              className="px-6 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm shadow-lg shadow-teal-500/20 transition-all flex items-center space-x-2 cursor-pointer"
            >
              <span>Next: Photos</span>
              <span>→</span>
            </button>
          </div>
        )}
      </aside>
    );
  }

  // Step 7: Info ("What information should appear?")
  const infoCards = [
    {
      key: 'showDistance' as const,
      label: 'Distance',
      desc: 'Shows how far we travelled',
      icon: <Navigation className="w-4 h-4 text-teal-400" />,
      checked: overlays.showDistance,
    },
    {
      key: 'showSpeed' as const,
      label: 'Speed',
      desc: 'Shows how fast we are moving',
      icon: <Gauge className="w-4 h-4 text-teal-400" />,
      checked: overlays.showSpeed,
    },
    {
      key: 'showAltitude' as const,
      label: 'Height / Altitude',
      desc: 'Shows mountain elevation',
      icon: <Mountain className="w-4 h-4 text-teal-400" />,
      checked: overlays.showAltitude,
    },
    {
      key: 'showElevationProfile' as const,
      label: 'Hill Graph',
      desc: 'Draws the up-and-down profile',
      icon: <Activity className="w-4 h-4 text-teal-400" />,
      checked: overlays.showElevationProfile,
    },
    {
      key: 'showCompass' as const,
      label: 'Compass',
      desc: 'Shows which way is North',
      icon: <Compass className="w-4 h-4 text-teal-400" />,
      checked: overlays.showCompass,
    },
  ];

  return (
    <aside className="panel w-85 h-full overflow-y-auto p-5 flex flex-col space-y-5 text-xs bg-[#0f172a] border-r border-slate-800 text-slate-100">
      <div>
        <span className="text-[11px] font-bold tracking-wider text-teal-400 uppercase">
          STEP 7 · INFO
        </span>
        <h2 className="text-2xl font-extrabold text-slate-100 mt-1 mb-1 tracking-tight">
          What information should appear?
        </h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Tap the counters you want to show on screen during the journey.
        </p>
      </div>

      {/* Visual Toggle Cards */}
      <div className="space-y-2">
        {infoCards.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() =>
              onUpdateOverlays({ ...overlays, [item.key]: !item.checked })
            }
            className={`w-full p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
              item.checked
                ? 'bg-teal-500/15 border-teal-500 ring-1 ring-teal-500'
                : 'bg-[#1e293b] border-slate-700 hover:border-teal-400'
            }`}
          >
            <div className="flex items-center space-x-3 text-left">
              <div className="p-2 rounded-lg bg-[#0f172a]">{item.icon}</div>
              <div>
                <strong className="text-xs text-slate-100 block">{item.label}</strong>
                <span className="text-[10px] text-slate-400">{item.desc}</span>
              </div>
            </div>
            <div
              className={`w-5 h-5 rounded-md flex items-center justify-center border text-xs font-bold ${
                item.checked
                  ? 'bg-teal-500 border-teal-500 text-slate-950'
                  : 'border-slate-600 bg-slate-800 text-transparent'
              }`}
            >
              ✓
            </div>
          </button>
        ))}
      </div>

      {/* Units */}
      <div className="space-y-2">
        <span className="text-[11px] font-bold text-teal-400 tracking-wider uppercase block">
          UNITS ?
        </span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onUpdateOverlays({ ...overlays, unit: 'metric' })}
            className={`p-2.5 rounded-xl border text-center font-semibold transition-all cursor-pointer ${
              overlays.unit === 'metric'
                ? 'bg-teal-500/15 border-teal-500 text-teal-400'
                : 'bg-[#1e293b] border-slate-700 text-slate-300'
            }`}
          >
            Kilometers (km)
          </button>
          <button
            type="button"
            onClick={() => onUpdateOverlays({ ...overlays, unit: 'imperial' })}
            className={`p-2.5 rounded-xl border text-center font-semibold transition-all cursor-pointer ${
              overlays.unit === 'imperial'
                ? 'bg-teal-500/15 border-teal-500 text-teal-400'
                : 'bg-[#1e293b] border-slate-700 text-slate-300'
            }`}
          >
            Miles (mi)
          </button>
        </div>
      </div>

      {onNext && (
        <div className="pt-4 mt-auto border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onNext}
            className="px-6 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm shadow-lg shadow-teal-500/20 transition-all flex items-center space-x-2 cursor-pointer"
          >
            <span>Next: Video</span>
            <span>→</span>
          </button>
        </div>
      )}
    </aside>
  );
};
