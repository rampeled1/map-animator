import React, { useRef } from 'react';
import { MapSign } from '../types';
import { extractExifGps } from '../utils/exifReader';
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
  onAddSign: (sign: MapSign) => void;
  onUpdateSign: (sign: MapSign) => void;
  onDeleteSign: (id: string) => void;
  onReorderSigns?: (signs: MapSign[]) => void;
  onSelectSign?: (id: string) => void;
}

export const SignsEditorPanel: React.FC<SignsEditorPanelProps> = ({
  signs,
  onAddSign,
  onUpdateSign,
  onDeleteSign,
  onReorderSigns,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check for EXIF GPS tags
    const gps = await extractExifGps(file);
    const photoUrl = URL.createObjectURL(file);

    const newSign: MapSign = {
      id: `sign-${Date.now()}`,
      lng: gps ? gps.lng : 12.4964,
      lat: gps ? gps.lat : 41.9028,
      text: file.name.replace(/\.[^/.]+$/, ''),
      style: 'photo',
      photoUrl,
      triggerMode: 'onPassed',
      pauseSec: 2,
      size: 1,
    };

    onAddSign(newSign);
    if (gps) {
      alert(`Photo auto-located from EXIF GPS at ${gps.lat.toFixed(4)}°, ${gps.lng.toFixed(4)}°!`);
    } else {
      alert('No GPS metadata found in photo. Sign placed in the center of the current map view.');
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

    const newSign: MapSign = {
      id: `sign-${Date.now()}`,
      lng: 12.4964,
      lat: 41.9028,
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
    <aside className="panel w-80 h-full overflow-y-auto p-4 flex flex-col space-y-4 text-xs">
      <div>
        <h2>3. Add Signs & Photos</h2>
        <p className="lede">
          Add map pins, camp sites, finish arches, or drop photos from your phone. Photos with GPS are positioned automatically.
        </p>
      </div>

      {/* Auto-Place Geo-Tagged Photo Dropzone */}
      <label className="border-2 border-dashed border-[var(--border)] hover:border-[var(--accent)] rounded-xl p-3.5 flex flex-col items-center justify-center cursor-pointer transition-colors group bg-[var(--panel-2)] text-center">
        <Camera className="w-5 h-5 text-[var(--muted)] group-hover:text-[var(--accent)] mb-1.5 transition-colors" />
        <span className="font-semibold text-[var(--text)]">Drop Phone Photos</span>
        <span className="text-[10px] text-[var(--muted)] mt-0.5">
          Reads EXIF GPS tags to auto-place photos where taken
        </span>
        <input
          ref={fileInputRef}
          type="file"
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
            No signs or photos placed yet.
          </div>
        ) : (
          signs.map((sign, index) => (
            <div
              key={sign.id}
              className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] space-y-2"
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
    </aside>
  );
};
