import React, { useState } from 'react';
import type { Route, TransportType, CanonicalTransportType } from '../types';
import { calculateTrackStats } from '../utils/gpxParser';
import { Clock, CornerUpRight, Trash2, Navigation, X } from 'lucide-react';

interface WaypointOptionsModalProps {
  route: Route;
  pointIndex: number;
  onUpdateRoute: (updated: Route) => void;
  onClose: () => void;
}

const QUICK_PAUSES = [0, 1, 2, 5, 10];

const LEG_TRANSPORTS: { id: CanonicalTransportType; label: string }[] = [
  { id: 'car', label: 'Car (Follow Roads)' },
  { id: 'walking', label: 'Walking (Follow Paths)' },
  { id: 'bike', label: 'Bike (Follow Roads)' },
  { id: 'train', label: 'Train (Free Mode / Rail)' },
  { id: 'boat', label: 'Boat (Free Mode / Sea)' },
  { id: 'plane', label: 'Plane (Free Mode / Flight Arc)' },
];

export const WaypointOptionsModal: React.FC<WaypointOptionsModalProps> = ({
  route,
  pointIndex,
  onUpdateRoute,
  onClose,
}) => {
  const pt = route.points[pointIndex];
  const [pauseSec, setPauseSec] = useState<number>(pt?.pauseSec || 0);
  const [sharpCorner, setSharpCorner] = useState<boolean>(!!pt?.sharpCorner);
  const [selectedLegTransport, setSelectedLegTransport] = useState<TransportType | ''>('');

  if (!pt) return null;

  const handleSave = () => {
    const updatedPts = [...route.points];
    updatedPts[pointIndex] = {
      ...pt,
      pauseSec: pauseSec > 0 ? Math.min(20, Math.max(0.5, pauseSec)) : 0,
      sharpCorner,
    };

    let updatedLegs = route.legs || [];
    if (selectedLegTransport) {
      const existingIdx = updatedLegs.findIndex((l) => l.fromPointIndex === pointIndex);
      const newLeg = {
        id: existingIdx >= 0 ? updatedLegs[existingIdx].id : `leg-${Date.now()}`,
        fromPointIndex: pointIndex,
        transportType: selectedLegTransport,
        use3dSymbol: true,
        color: route.color,
      };
      if (existingIdx >= 0) {
        updatedLegs = updatedLegs.map((l, i) => (i === existingIdx ? newLeg : l));
      } else {
        updatedLegs = [...updatedLegs, newLeg];
      }
    }

    onUpdateRoute({
      ...route,
      points: updatedPts,
      legs: updatedLegs,
    });
    onClose();
  };

  const handleDeletePoint = () => {
    const updatedPts = route.points.filter((_, i) => i !== pointIndex);
    onUpdateRoute({
      ...route,
      points: updatedPts,
      stats: calculateTrackStats(updatedPts),
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="waypoint-dialog-title"
        className="w-full max-w-sm rounded-2xl bg-[#0f172a] border border-slate-700 p-5 text-slate-100 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 id="waypoint-dialog-title" className="text-base font-bold text-slate-100">
              Waypoint #{pointIndex + 1} Options
            </h3>
            <p className="text-[11px] text-slate-400 font-mono">
              {pt.lat.toFixed(4)}°, {pt.lng.toFixed(4)}°
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close waypoint options"
            className="w-10 h-10 rounded-xl bg-slate-800/80 hover:bg-slate-700 flex items-center justify-center text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. Pause Duration */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>Pause at this point ({pauseSec > 0 ? `${pauseSec}s` : 'None'})</span>
          </label>
          <div className="grid grid-cols-5 gap-1.5">
            {QUICK_PAUSES.map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setPauseSec(val)}
                className={`min-h-[38px] rounded-lg text-xs font-bold border transition-all ${
                  pauseSec === val
                    ? 'bg-teal-500 text-slate-950 border-teal-500'
                    : 'bg-[#1e293b] text-slate-300 border-slate-700 hover:border-teal-400'
                }`}
              >
                {val === 0 ? 'Off' : `${val}s`}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={20}
            step={0.5}
            value={pauseSec}
            onChange={(e) => setPauseSec(parseFloat(e.target.value))}
            aria-label="Pause duration in seconds"
            className="w-full accent-teal-400 cursor-pointer"
          />
        </div>

        {/* 2. Corner Smoothness */}
        <div className="space-y-1.5">
          <span className="text-xs font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
            <CornerUpRight className="w-3.5 h-3.5" />
            <span>Corner Turning</span>
          </span>
          <button
            type="button"
            onClick={() => setSharpCorner(!sharpCorner)}
            className={`w-full min-h-[42px] px-3 py-2 rounded-xl border flex items-center justify-between text-xs font-semibold transition-all ${
              sharpCorner
                ? 'bg-teal-500/15 border-teal-500 text-teal-300'
                : 'bg-[#1e293b] border-slate-700 text-slate-300'
            }`}
          >
            <span>Sharp Corner (No spline rounding)</span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                sharpCorner ? 'bg-teal-500 text-slate-950' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {sharpCorner ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>

        {/* 3. Change Leg Transport */}
        <div className="space-y-1.5">
          <label
            htmlFor="leg-transport-select"
            className="text-xs font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Change Transport From Here</span>
          </label>
          <select
            id="leg-transport-select"
            value={selectedLegTransport}
            onChange={(e) => setSelectedLegTransport(e.target.value as TransportType | '')}
            className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1e293b] border border-slate-700 text-xs text-slate-100"
          >
            <option value="">Keep current transport</option>
            {LEG_TRANSPORTS.map((t) => (
              <option key={t.id} value={t.id}>
                Switch to {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* 4. Actions */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleDeletePoint}
            className="min-h-[42px] px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-extrabold"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
