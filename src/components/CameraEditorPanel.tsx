import React, { useState } from 'react';
import type {
  CameraBlock,
  CameraMode,
  CameraModePreset,
  AspectRatioOption,
  DurationPreset,
} from '../types';

interface CameraEditorPanelProps {
  // Simplified Presets
  cameraPreset?: CameraModePreset;
  onSetCameraPreset: (preset: CameraModePreset) => void;

  // Aspect Ratio & Duration
  aspectRatio: AspectRatioOption;
  onSetAspectRatio: (aspect: AspectRatioOption) => void;
  durationPreset?: DurationPreset;
  duration: number;
  onSetDuration: (duration: number, preset?: DurationPreset) => void;

  // Advanced Camera Controls
  cameraMode: CameraMode;
  onSetCameraMode: (mode: CameraMode) => void;
  followOrient: 'north' | 'heading';
  onSetFollowOrient: (orient: 'north' | 'heading') => void;
  rotateOffset?: number;
  onSetRotateOffset?: (deg: number) => void;
  followZoom: number;
  onSetFollowZoom: (zoom: number) => void;
  tilt: number;
  onSetTilt: (tilt: number) => void;
  distanceKm?: number;
  onSetDistanceKm?: (km: number) => void;
  heightKm?: number;
  onSetHeightKm?: (km: number) => void;
  orbitDirection?: 'clockwise' | 'anticlockwise';
  onSetOrbitDirection?: (dir: 'clockwise' | 'anticlockwise') => void;
  smoothness?: number;
  onSetSmoothness?: (s: number) => void;

  // Keyframe Block & Navigation
  currentTime?: number;
  activeCameraBlock?: CameraBlock | null;
  onNext?: () => void;
}

export const CameraEditorPanel: React.FC<CameraEditorPanelProps> = React.memo(({
  cameraPreset = 'fly_along',
  onSetCameraPreset,
  aspectRatio = '16:9',
  onSetAspectRatio,
  durationPreset = 40,
  duration = 40,
  onSetDuration,
  cameraMode: _cameraMode,
  onSetCameraMode: _onSetCameraMode,
  followOrient: _followOrient,
  onSetFollowOrient: _onSetFollowOrient,
  rotateOffset: _rotateOffset = 0,
  onSetRotateOffset: _onSetRotateOffset,
  followZoom,
  onSetFollowZoom,
  tilt,
  onSetTilt,
  distanceKm: _distanceKm = 2.3,
  onSetDistanceKm: _onSetDistanceKm,
  heightKm: _heightKm = 2.9,
  onSetHeightKm: _onSetHeightKm,
  orbitDirection: _orbitDirection = 'clockwise',
  onSetOrbitDirection: _onSetOrbitDirection,
  smoothness = 0.5,
  onSetSmoothness,
  onNext,
}) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customDurationInput, setCustomDurationInput] = useState<number>(duration);

  return (
    <aside className="panel w-85 h-full overflow-y-auto p-5 flex flex-col space-y-5 text-xs bg-[#0f172a] border-r border-slate-800 text-slate-100 font-sans">
      {/* 1. Header */}
      <div>
        <span className="text-[11px] font-bold tracking-wider text-teal-400 uppercase">
          STEP 2 · CAMERA
        </span>
        <h2 className="text-2xl font-extrabold text-slate-100 mt-1 mb-1 tracking-tight">
          How does the camera fly?
        </h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          How the camera flies, how high, which format and how long the video is.
        </p>
      </div>

      {/* 2. Camera Preset Selector */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-teal-400 tracking-wider uppercase">
            CAMERA ?
          </span>
          <span className="text-[11px] font-mono text-slate-500 capitalize">
            {cameraPreset.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Preset A: Fly Along */}
          <button
            type="button"
            onClick={() => {
              onSetCameraPreset('fly_along');
            }}
            className={`flex flex-col items-center justify-center p-3.5 rounded-xl border text-center transition-all duration-200 cursor-pointer ${
              cameraPreset === 'fly_along'
                ? 'bg-teal-500/10 border-teal-500 ring-2 ring-teal-500'
                : 'bg-[#1e293b] border-slate-700 hover:border-teal-400'
            }`}
          >
            {/* SVG Thumbnail: Forward perspective curve */}
            <div className="w-10 h-7.5 flex items-center justify-center mb-2">
              <svg width="40" height="30" viewBox="0 0 40 30" fill="none" className="text-teal-400">
                <path
                  d="M5 25 C 15 22, 20 12, 35 6"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray="2 2"
                />
                <polygon points="35,6 27,6 31,12" fill="currentColor" />
                <circle cx="10" cy="23" r="2.5" fill="#f97316" />
              </svg>
            </div>
            <strong
              className={`text-xs font-bold leading-tight ${
                cameraPreset === 'fly_along' ? 'text-teal-400' : 'text-slate-200'
              }`}
            >
              Fly Along
            </strong>
            <span className="text-[10px] text-slate-400 mt-1 leading-snug line-clamp-2">
              Follows direction of travel
            </span>
          </button>

          {/* Preset B: Whole Tour */}
          <button
            type="button"
            onClick={() => {
              onSetCameraPreset('whole_tour');
            }}
            className={`flex flex-col items-center justify-center p-3.5 rounded-xl border text-center transition-all duration-200 cursor-pointer ${
              cameraPreset === 'whole_tour'
                ? 'bg-teal-500/10 border-teal-500 ring-2 ring-teal-500'
                : 'bg-[#1e293b] border-slate-700 hover:border-teal-400'
            }`}
          >
            {/* SVG Thumbnail: Wide map bounds frame */}
            <div className="w-10 h-7.5 flex items-center justify-center mb-2">
              <svg width="40" height="30" viewBox="0 0 40 30" fill="none" className="text-teal-400">
                <rect x="6" y="5" width="28" height="20" rx="3" stroke="#475569" strokeWidth="1.5" strokeDasharray="2 2" />
                <path d="M10 20 Q 20 8 30 18" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" />
                <circle cx="10" cy="20" r="2" fill="#14b8a6" />
                <circle cx="30" cy="18" r="2" fill="#ef4444" />
              </svg>
            </div>
            <strong
              className={`text-xs font-bold leading-tight ${
                cameraPreset === 'whole_tour' ? 'text-teal-400' : 'text-slate-200'
              }`}
            >
              Whole Tour
            </strong>
            <span className="text-[10px] text-slate-400 mt-1 leading-snug line-clamp-2">
              Shows complete route overview
            </span>
          </button>
        </div>

        {/* ▾ Advanced Controls Disclosure */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="flex items-center space-x-1.5 text-xs font-semibold text-slate-400 hover:text-teal-400 transition-colors"
          >
            <span>{advancedOpen ? '▾' : '▸'} Advanced camera settings</span>
          </button>

          {advancedOpen && (
            <div className="mt-3 p-3.5 bg-[#1e293b]/70 border border-slate-700 rounded-xl space-y-3.5 text-xs">
              {/* Preset Specific Sliders */}
              {cameraPreset === 'whole_tour' ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-slate-300">
                    <span>Framing & Zoom</span>
                    <span className="font-mono text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded text-[10px]">
                      Auto-fit via route bounds
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    The camera automatically computes the bounding box to frame the full route at a gentle angle.
                  </p>
                </div>
              ) : (
                <>
                  {/* Zoom Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-slate-300">
                      <span>Zoom Level</span>
                      <span className="font-mono text-teal-400">{followZoom.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="8"
                      max="20"
                      step="0.5"
                      value={followZoom}
                      onChange={(e) => onSetFollowZoom(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>Wide</span>
                      <span>Close</span>
                    </div>
                  </div>

                  {/* Pitch / Tilt Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-slate-300">
                      <span>Pitch (Tilt)</span>
                      <span className="font-mono text-teal-400">{tilt}°</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="80"
                      step="1"
                      value={tilt}
                      onChange={(e) => onSetTilt(parseInt(e.target.value, 10))}
                      className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>Flat (0°)</span>
                      <span>High Flyover (80°)</span>
                    </div>
                  </div>

                  {/* Smoothness Slider (Fly Along) */}
                  {cameraPreset === 'fly_along' && onSetSmoothness && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-slate-300">
                        <span>Turn Smoothness</span>
                        <span className="font-mono text-teal-400">{(smoothness * 100).toFixed(0)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={smoothness}
                        onChange={(e) => onSetSmoothness(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
                      />
                    </div>
                  )}
                </>
              )}


            </div>
          )}
        </div>
      </div>

      {/* 3. Video Format Selector */}
      <div className="space-y-3">
        <span className="text-[11px] font-bold text-teal-400 tracking-wider uppercase">
          FORMAT ?
        </span>
        <div className="grid grid-cols-3 gap-2.5">
          {/* 16:9 Landscape */}
          <button
            type="button"
            onClick={() => onSetAspectRatio('16:9')}
            className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all duration-200 cursor-pointer ${
              aspectRatio === '16:9'
                ? 'bg-teal-500/10 border-teal-500 ring-2 ring-teal-500'
                : 'bg-[#1e293b] border-slate-700 hover:border-teal-400'
            }`}
          >
            <div className="w-10 h-6 border-2 border-current rounded-sm mb-2 flex items-center justify-center text-slate-400">
              <span className="text-[8px] font-mono">16:9</span>
            </div>
            <strong
              className={`text-xs font-bold leading-tight ${
                aspectRatio === '16:9' ? 'text-teal-400' : 'text-slate-200'
              }`}
            >
              Landscape
            </strong>
            <span className="text-[10px] font-mono text-slate-400 mt-0.5">1920 × 1080</span>
          </button>

          {/* 9:16 Vertical */}
          <button
            type="button"
            onClick={() => onSetAspectRatio('9:16')}
            className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all duration-200 cursor-pointer ${
              aspectRatio === '9:16'
                ? 'bg-teal-500/10 border-teal-500 ring-2 ring-teal-500'
                : 'bg-[#1e293b] border-slate-700 hover:border-teal-400'
            }`}
          >
            <div className="w-6 h-8 border-2 border-current rounded-sm mb-1.5 flex items-center justify-center text-slate-400">
              <span className="text-[8px] font-mono">9:16</span>
            </div>
            <strong
              className={`text-xs font-bold leading-tight ${
                aspectRatio === '9:16' ? 'text-teal-400' : 'text-slate-200'
              }`}
            >
              Vertical
            </strong>
            <span className="text-[10px] font-mono text-slate-400 mt-0.5">Reels / Shorts</span>
          </button>

          {/* 1:1 Square */}
          <button
            type="button"
            onClick={() => onSetAspectRatio('1:1')}
            className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all duration-200 cursor-pointer ${
              aspectRatio === '1:1'
                ? 'bg-teal-500/10 border-teal-500 ring-2 ring-teal-500'
                : 'bg-[#1e293b] border-slate-700 hover:border-teal-400'
            }`}
          >
            <div className="w-7 h-7 border-2 border-current rounded-sm mb-2 flex items-center justify-center text-slate-400">
              <span className="text-[8px] font-mono">1:1</span>
            </div>
            <strong
              className={`text-xs font-bold leading-tight ${
                aspectRatio === '1:1' ? 'text-teal-400' : 'text-slate-200'
              }`}
            >
              Square
            </strong>
            <span className="text-[10px] font-mono text-slate-400 mt-0.5">1080 × 1080</span>
          </button>
        </div>
      </div>

      {/* 4. Animation Duration */}
      <div className="space-y-3">
        <span className="text-[11px] font-bold text-teal-400 tracking-wider uppercase">
          LENGTH ?
        </span>
        <div className="grid grid-cols-2 gap-2.5">
          {/* Short: 20s */}
          <button
            type="button"
            onClick={() => onSetDuration(20, 20)}
            className={`p-3 rounded-xl border flex items-center justify-between transition-all duration-200 cursor-pointer ${
              durationPreset === 20 || duration === 20
                ? 'bg-teal-500/10 border-teal-500 ring-2 ring-teal-500 text-teal-400'
                : 'bg-[#1e293b] border-slate-700 text-slate-200 hover:border-teal-400'
            }`}
          >
            <div className="text-left">
              <strong className="text-xs block">Short</strong>
              <span className="text-[10px] text-slate-400">Fast overview</span>
            </div>
            <span className="font-mono text-sm font-bold">20 s</span>
          </button>

          {/* Normal: 40s (Default) */}
          <button
            type="button"
            onClick={() => onSetDuration(40, 40)}
            className={`p-3 rounded-xl border flex items-center justify-between transition-all duration-200 cursor-pointer ${
              durationPreset === 40 || duration === 40
                ? 'bg-teal-500/10 border-teal-500 ring-2 ring-teal-500 text-teal-400'
                : 'bg-[#1e293b] border-slate-700 text-slate-200 hover:border-teal-400'
            }`}
          >
            <div className="text-left">
              <strong className="text-xs block">Normal (Recommended)</strong>
              <span className="text-[10px] text-slate-400">Standard pace</span>
            </div>
            <span className="font-mono text-sm font-bold">40 s</span>
          </button>

          {/* Long: 60s */}
          <button
            type="button"
            onClick={() => onSetDuration(60, 60)}
            className={`p-3 rounded-xl border flex items-center justify-between transition-all duration-200 cursor-pointer ${
              durationPreset === 60 || duration === 60
                ? 'bg-teal-500/10 border-teal-500 ring-2 ring-teal-500 text-teal-400'
                : 'bg-[#1e293b] border-slate-700 text-slate-200 hover:border-teal-400'
            }`}
          >
            <div className="text-left">
              <strong className="text-xs block">Long</strong>
              <span className="text-[10px] text-slate-400">Cinematic detailed</span>
            </div>
            <span className="font-mono text-sm font-bold">60 s</span>
          </button>

          {/* Custom */}
          <button
            type="button"
            onClick={() => onSetDuration(customDurationInput, 'custom')}
            className={`p-3 rounded-xl border flex items-center justify-between transition-all duration-200 cursor-pointer ${
              durationPreset === 'custom'
                ? 'bg-teal-500/10 border-teal-500 ring-2 ring-teal-500 text-teal-400'
                : 'bg-[#1e293b] border-slate-700 text-slate-200 hover:border-teal-400'
            }`}
          >
            <div className="text-left">
              <strong className="text-xs block">Custom</strong>
              <span className="text-[10px] text-slate-400">User specified</span>
            </div>
            <span className="font-mono text-sm font-bold">{duration} s</span>
          </button>
        </div>

        {/* Custom duration slider / input */}
        {durationPreset === 'custom' && (
          <div className="mt-2 p-3 bg-[#1e293b] border border-slate-700 rounded-xl space-y-2">
            <div className="flex justify-between items-center text-xs text-slate-300">
              <span>Set custom length:</span>
              <div className="flex items-center space-x-1 font-mono">
                <input
                  type="number"
                  min="5"
                  max="300"
                  value={customDurationInput}
                  onChange={(e) => {
                    const val = Math.max(5, Math.min(300, parseInt(e.target.value, 10) || 5));
                    setCustomDurationInput(val);
                    onSetDuration(val, 'custom');
                  }}
                  className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-0.5 text-center text-teal-400 font-bold"
                />
                <span>sec</span>
              </div>
            </div>
            <input
              type="range"
              min="5"
              max="300"
              step="5"
              value={customDurationInput}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setCustomDurationInput(val);
                onSetDuration(val, 'custom');
              }}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>5s</span>
              <span>150s</span>
              <span>300s (5 min)</span>
            </div>
          </div>
        )}
      </div>

      {/* 5. Footer: Next: Map → */}
      <div className="pt-6 mt-auto border-t border-slate-800 flex justify-end">
        <button
          type="button"
          onClick={onNext}
          className="px-6 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm shadow-lg shadow-teal-500/20 transition-all flex items-center space-x-2 cursor-pointer"
        >
          <span>Next: Map</span>
          <span>→</span>
        </button>
      </div>
    </aside>
  );
});
