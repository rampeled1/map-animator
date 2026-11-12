import React, { useRef, useState } from 'react';
import { MapSign } from '../types';
import { extractExifGps } from '../utils/exifReader';
import { CatmullRom3DPath } from '../utils/catmullRom3DPath';
import {
  MapPin,
  Image as ImageIcon,
  Type,
  Trash2,
  Camera,
  Tent,
  Flag,
  Trophy,
  Hotel,
  ArrowUp,
  ArrowDown,
  GripVertical,
} from 'lucide-react';

interface SignsEditorPanelProps {
  signs: MapSign[];
  routePoints?: { lng: number; lat: number }[];
  defaultCenter?: [number, number];
  totalRouteDistanceKm?: number;
  pathEngine?: CatmullRom3DPath | null;
  onAddSign: (sign: MapSign) => void;
  onUpdateSign: (sign: MapSign) => void;
  onDeleteSign: (id: string) => void;
  onReorderSigns?: (signs: MapSign[]) => void;
  onSelectSign?: (id: string) => void;
  onNext?: () => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const SignsEditorPanel: React.FC<SignsEditorPanelProps> = React.memo(({
  signs,
  routePoints,
  defaultCenter = [12.4964, 41.9028],
  totalRouteDistanceKm = 0,
  pathEngine,
  onAddSign,
  onUpdateSign,
  onDeleteSign,
  onReorderSigns,
  onNext,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  // Determine fallback coordinate along the active route if available
  const getFallbackLocation = (): [number, number] => {
    if (routePoints && routePoints.length > 0) {
      const fraction = (signs.length + 1) / (signs.length + 2);
      const ptIdx = Math.min(
        routePoints.length - 1,
        Math.max(0, Math.floor(fraction * (routePoints.length - 1)))
      );
      return [routePoints[ptIdx].lng, routePoints[ptIdx].lat];
    }
    const jitter = (signs.length % 5) * 0.002;
    return [defaultCenter[0] + jitter, defaultCenter[1] + jitter];
  };

  const updatePhotoDistance = (sign: MapSign, dKm: number) => {
    const maxDist = totalRouteDistanceKm || 0;
    const clampedDist = Math.max(0, Math.min(maxDist, dKm));
    if (pathEngine && maxDist > 0) {
      const pGeo = clampedDist / maxDist;
      const u = pathEngine.getSplineParameterAtDistanceProgress(pGeo);
      const sample = pathEngine.sample(u);
      if (sample) {
        onUpdateSign({
          ...sign,
          lng: sample.worldPoint[0],
          lat: sample.worldPoint[1],
          routeDistanceKm: clampedDist,
        });
        return;
      }
    }
    onUpdateSign({
      ...sign,
      routeDistanceKm: clampedDist,
    });
  };

  const processPhotoFile = async (file: File) => {
    // Check for EXIF GPS tags
    const gps = await extractExifGps(file);
    const photoUrl = await readFileAsDataUrl(file);
    const fallback = getFallbackLocation();

    let initialDistKm = 0;
    let initialLng = fallback[0];
    let initialLat = fallback[1];

    if (!gps && pathEngine && totalRouteDistanceKm > 0) {
      initialDistKm = 0;
      const u = pathEngine.getSplineParameterAtDistanceProgress(0);
      const sample = pathEngine.sample(u);
      if (sample) {
        initialLng = sample.worldPoint[0];
        initialLat = sample.worldPoint[1];
      }
    } else if (gps) {
      initialLng = gps.lng;
      initialLat = gps.lat;
    }

    const newSign: MapSign = {
      id: `sign-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      lng: initialLng,
      lat: initialLat,
      text: file.name.replace(/\.[^/.]+$/, ''),
      style: 'photo',
      photoUrl,
      triggerMode: 'onPassed',
      pauseSec: 2,
      size: 1,
      routeDistanceKm: !gps && totalRouteDistanceKm > 0 ? initialDistKm : undefined,
    };

    onAddSign(newSign);
    if (gps) {
      alert(`Photo auto-located from EXIF GPS at ${gps.lat.toFixed(4)}°, ${gps.lng.toFixed(4)}°!`);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      await processPhotoFile(file);
    }
    e.target.value = '';
  };

  const handleCreateSign = (style: MapSign['style']) => {
    let defaultText = 'Waypoint';
    if (style === 'text') defaultText = 'Scenic View';
    else if (style === 'camp') defaultText = 'Campsite';
    else if (style === 'start') defaultText = 'Start';
    else if (style === 'finish') defaultText = 'Finish';
    else if (style === 'hotel') defaultText = 'Hotel';

    const fallback = getFallbackLocation();
    const newSign: MapSign = {
      id: `sign-${Date.now()}`,
      lng: fallback[0],
      lat: fallback[1],
      text: defaultText,
      style,
      triggerMode: style === 'start' ? 'always' : 'onPassed',
      pauseSec: 1.5,
      size: 1,
    };
    onAddSign(newSign);
  };

  const moveSign = (index: number, direction: 'up' | 'down') => {
    if (!onReorderSigns) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= signs.length) return;
    const updated = [...signs];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    onReorderSigns(updated);
  };

  return (
    <aside className="panel w-85 h-full overflow-y-auto p-5 flex flex-col space-y-4 text-xs bg-[#0f172a] border-r border-slate-800 text-slate-100">
      <div>
        <span className="text-[11px] font-bold tracking-wider text-teal-400 uppercase">
          STEP 6 · PHOTOS
        </span>
        <h2 className="text-2xl font-extrabold text-slate-100 mt-1 mb-1 tracking-tight">
          Which photos should we show?
        </h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Drop photos from your phone or add pins along your journey.
        </p>
      </div>

      {/* Auto-Place Geo-Tagged Photo Dropzone */}
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={async (e) => {
          e.preventDefault();
          const files = Array.from(e.dataTransfer.files || []);
          for (const file of files) {
            await processPhotoFile(file);
          }
        }}
        className="border-2 border-dashed border-[var(--border)] hover:border-[var(--accent)] rounded-xl p-3.5 flex flex-col items-center justify-center cursor-pointer transition-colors group bg-[var(--panel-2)] text-center"
      >
        <Camera className="w-5 h-5 text-[var(--muted)] group-hover:text-[var(--accent)] mb-1.5 transition-colors" />
        <span className="font-semibold text-[var(--text)]">Drop Phone Photos</span>
        <span className="text-[10px] text-[var(--muted)] mt-0.5">
          Reads EXIF GPS tags to auto-place photos where taken
        </span>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          onChange={handlePhotoUpload}
          className="hidden"
        />
      </label>

      {/* Create Sign Buttons (Oct 8 changelog: camp, start arch, finish flag, hotel) */}
      <div className="group">
        <div className="group-title">Add new sign</div>
        <div className="grid grid-cols-4 gap-1.5">
          <button
            onClick={() => handleCreateSign('pin')}
            className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--accent)] flex flex-col items-center justify-center space-y-1 transition-all"
            title="Standard waypoint pin"
          >
            <MapPin className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span className="text-[9px] font-semibold text-[var(--text)]">Pin</span>
          </button>
          <button
            onClick={() => handleCreateSign('camp')}
            className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--accent)] flex flex-col items-center justify-center space-y-1 transition-all"
            title="Camp tent sign"
          >
            <Tent className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[9px] font-semibold text-[var(--text)]">Camp</span>
          </button>
          <button
            onClick={() => handleCreateSign('start')}
            className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--accent)] flex flex-col items-center justify-center space-y-1 transition-all"
            title="Start line arch"
          >
            <Flag className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[9px] font-semibold text-[var(--text)]">Start</span>
          </button>
          <button
            onClick={() => handleCreateSign('finish')}
            className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--accent)] flex flex-col items-center justify-center space-y-1 transition-all"
            title="Finish checkered flag"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[9px] font-semibold text-[var(--text)]">Finish</span>
          </button>
          <button
            onClick={() => handleCreateSign('hotel')}
            className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--accent)] flex flex-col items-center justify-center space-y-1 transition-all"
            title="Hotel lodging sign"
          >
            <Hotel className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-[9px] font-semibold text-[var(--text)]">Hotel</span>
          </button>
          <button
            onClick={() => handleCreateSign('text')}
            className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--accent)] flex flex-col items-center justify-center space-y-1 transition-all"
            title="Pure text label"
          >
            <Type className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span className="text-[9px] font-semibold text-[var(--text)]">Text</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--accent)] flex flex-col items-center justify-center space-y-1 transition-all col-span-2"
            title="Photo callout"
          >
            <ImageIcon className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span className="text-[9px] font-semibold text-[var(--text)]">Upload Photo</span>
          </button>
        </div>
      </div>

      {/* Signs List with Reordering (Oct 29 changelog) */}
      <div className="group space-y-2">
        <div className="group-title flex items-center justify-between">
          <span>Placed Signs ({signs.length})</span>
          <span className="text-[10px] text-[var(--muted)]">Drag or move order</span>
        </div>
        {signs.length === 0 ? (
          <div className="p-3 rounded-lg bg-[var(--panel-2)] border border-[var(--border)] text-center text-[11px] text-[var(--muted)]">
            No signs or photos placed yet. Click on the map or use the buttons above to place signs.
          </div>
        ) : (
          signs.map((sign, index) => (
            <div
              key={sign.id}
              draggable
              onDragStart={() => setDraggedIdx(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (draggedIdx !== null && draggedIdx !== index && onReorderSigns) {
                  const updated = [...signs];
                  const [moved] = updated.splice(draggedIdx, 1);
                  updated.splice(index, 0, moved);
                  onReorderSigns(updated);
                }
                setDraggedIdx(null);
              }}
              onDragEnd={() => setDraggedIdx(null)}
              className={`p-2.5 rounded-lg border bg-[var(--panel-2)] space-y-2 transition-opacity ${
                draggedIdx === index
                  ? 'opacity-50 border-[var(--accent)]'
                  : 'border-[var(--border)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1 flex-1 min-w-0">
                  <div className="flex flex-col text-[var(--muted)] mr-1">
                    <button
                      onClick={() => moveSign(index, 'up')}
                      disabled={index === 0}
                      className="hover:text-[var(--text)] disabled:opacity-20 p-0.5"
                      title="Move sign earlier in stack"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => moveSign(index, 'down')}
                      disabled={index === signs.length - 1}
                      className="hover:text-[var(--text)] disabled:opacity-20 p-0.5"
                      title="Move sign later in stack"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>
                  <GripVertical className="w-3.5 h-3.5 text-[var(--muted)] shrink-0 cursor-grab" />
                  <input
                    type="text"
                    value={sign.text}
                    onChange={(e) => onUpdateSign({ ...sign, text: e.target.value })}
                    className="font-semibold text-[var(--text)] bg-transparent border-0 focus:ring-1 focus:ring-[var(--accent)] rounded px-1 -ml-1 text-xs truncate w-full"
                  />
                </div>
                <button
                  onClick={() => onDeleteSign(sign.id)}
                  className="p-1 text-[var(--muted)] hover:text-red-400 transition-colors ml-1"
                  title="Delete sign"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Photo Distance Slider (B11) */}
              {sign.style === 'photo' && (totalRouteDistanceKm || 0) > 0 && (
                <div className="space-y-1.5 p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center space-x-1.5">
                      {sign.photoUrl && (
                        <img
                          src={sign.photoUrl}
                          alt={sign.text}
                          className="w-5 h-5 rounded object-cover border border-slate-700 shrink-0"
                        />
                      )}
                      <span className="text-slate-300 font-semibold">Route Distance</span>
                    </div>
                    <span className="font-mono text-teal-400 font-bold">
                      {(sign.routeDistanceKm ?? 0).toFixed(1)} km
                      <span className="text-slate-500 font-normal text-[10px]"> / {(totalRouteDistanceKm || 0).toFixed(1)} km</span>
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0.1, totalRouteDistanceKm || 0)}
                    step={0.1}
                    value={Math.min(totalRouteDistanceKm || 0, sign.routeDistanceKm ?? 0)}
                    onChange={(e) => {
                      const d = parseFloat(e.target.value);
                      updatePhotoDistance(sign, d);
                    }}
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-400"
                    aria-label={`Photo route distance for ${sign.text}`}
                  />
                  <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                    <span>0 km</span>
                    <span>{(totalRouteDistanceKm || 0).toFixed(1)} km</span>
                  </div>
                </div>
              )}

              {/* Visibility Trigger Mode */}
              <div className="space-y-1">
                <div className="text-[10px] text-[var(--muted)] font-medium">When to show:</div>
                <div className="seg" role="group">
                  <button
                    aria-pressed={sign.triggerMode === 'always'}
                    onClick={() => onUpdateSign({ ...sign, triggerMode: 'always' })}
                  >
                    Always
                  </button>
                  <button
                    aria-pressed={sign.triggerMode === 'onPassed'}
                    onClick={() => onUpdateSign({ ...sign, triggerMode: 'onPassed' })}
                  >
                    When passed
                  </button>
                  <button
                    aria-pressed={sign.triggerMode === 'whilePassing'}
                    onClick={() => onUpdateSign({ ...sign, triggerMode: 'whilePassing' })}
                  >
                    While passing
                  </button>
                </div>
              </div>

              {/* Pause duration (Oct 20 changelog: up to 20 seconds) */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-[var(--muted)]">Pause animation:</span>
                <select
                  value={sign.pauseSec ?? 0}
                  onChange={(e) => onUpdateSign({ ...sign, pauseSec: Number(e.target.value) })}
                  className="bg-[var(--panel)] border border-[var(--border)] rounded px-2 py-0.5 text-[11px] text-[var(--text)]"
                >
                  <option value={0}>None</option>
                  <option value={0.5}>½ s</option>
                  <option value={1}>1 s</option>
                  <option value={2}>2 s</option>
                  <option value={3}>3 s</option>
                  <option value={5}>5 s</option>
                  <option value={10}>10 s</option>
                  <option value={15}>15 s</option>
                  <option value={20}>20 s</option>
                </select>
              </div>
            </div>
          ))
        )}
      </div>

      {onNext && (
        <div className="pt-4 mt-auto border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onNext}
            className="px-6 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm shadow-lg shadow-teal-500/20 transition-all flex items-center space-x-2 cursor-pointer"
          >
            <span>Next: Info</span>
            <span>→</span>
          </button>
        </div>
      )}
    </aside>
  );
});
