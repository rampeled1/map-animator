import React from 'react';
import { CameraBlock } from '../types';

interface CameraEditorPanelProps {
  cameraMode: 'follow' | 'still' | 'orbit' | 'tripod';
  onSetCameraMode: (mode: 'follow' | 'still' | 'orbit' | 'tripod') => void;
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
  currentTime?: number;
  activeCameraBlock?: CameraBlock | null;
}

function formatTimeSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return `${m}:${Number(s) < 10 ? '0' : ''}${s}`;
}

export const CameraEditorPanel: React.FC<CameraEditorPanelProps> = ({
  cameraMode,
  onSetCameraMode,
  followOrient,
  onSetFollowOrient,
  rotateOffset = 0,
  onSetRotateOffset,
  followZoom,
  onSetFollowZoom,
  tilt,
  onSetTilt,
  distanceKm = 2.3,
  onSetDistanceKm,
  heightKm = 2.9,
  onSetHeightKm,
  orbitDirection = 'clockwise',
  onSetOrbitDirection,
  currentTime = 0,
  activeCameraBlock,
}) => {
  const timeLabel = activeCameraBlock ? formatTimeSec(currentTime) : '0:00.0';

  return (
    <aside className="panel">
      <div>
        <h2>Set up the camera</h2>
        <p className="lede">
          Move the timeline to a moment, then move, zoom, turn and tilt the map to film it the way you want.
        </p>
      </div>

      <div className="group">
        <div className="group-title">
          <span>CAMERA</span>
          <output className="font-mono text-xs">from {timeLabel}</output>
        </div>
        <div className="seg" role="group" aria-label="Camera mode">
          <button
            aria-pressed={cameraMode === 'follow'}
            onClick={() => onSetCameraMode('follow')}
          >
            Follow
          </button>
          <button
            aria-pressed={cameraMode === 'still'}
            onClick={() => onSetCameraMode('still')}
          >
            Still
          </button>
          <button
            aria-pressed={cameraMode === 'tripod'}
            onClick={() => onSetCameraMode('tripod')}
          >
            Tripod
          </button>
          <button
            aria-pressed={cameraMode === 'orbit'}
            onClick={() => onSetCameraMode('orbit')}
          >
            Orbit
          </button>
        </div>

        {/* 1. STILL MODE */}
        {cameraMode === 'still' && (
          <>
            <p className="hint">
              Stays on one view: move the map until the frame shows what you want.
            </p>
            <div className="group">
              <div className="group-title">
                <span>TILT</span>
                <output>{tilt}°</output>
              </div>
              <input
                type="range"
                min="0"
                max="80"
                value={tilt}
                onChange={(e) => onSetTilt(Number(e.target.value))}
                className="range"
              />
              <div className="range-labels">
                <span>Flat</span>
                <span>Tilted</span>
              </div>
              <p className="hint">
                Tilt gives a flyover feel. Turn on 3D mountains in the Map step to raise the terrain.
              </p>
            </div>
          </>
        )}

        {/* 2. TRIPOD MODE */}
        {cameraMode === 'tripod' && (
          <>
            <p className="hint">
              Stands in one spot and turns to watch the symbol go by. Move the map to place it: the camera stands where you're looking from.
            </p>
            <div className="group">
              <div className="group-title">
                <span>DISTANCE</span>
                <output>{distanceKm.toFixed(1)} km</output>
              </div>
              <input
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                value={distanceKm}
                onChange={(e) => onSetDistanceKm?.(parseFloat(e.target.value))}
                className="range"
              />
              <div className="range-labels">
                <span>Close</span>
                <span>Far</span>
              </div>
            </div>

            <div className="group">
              <div className="group-title">
                <span>HEIGHT</span>
                <output>{heightKm.toFixed(1)} km</output>
              </div>
              <input
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                value={heightKm}
                onChange={(e) => onSetHeightKm?.(parseFloat(e.target.value))}
                className="range"
              />
              <div className="range-labels">
                <span>Low</span>
                <span>High</span>
              </div>
            </div>

            <p className="hint">
              Distance and height are from the symbol where the playhead is. Stand off to the side of the route: right above it, the camera has to spin round quickly.
            </p>
          </>
        )}

        {/* 3. ORBIT MODE */}
        {cameraMode === 'orbit' && (
          <>
            <p className="hint">
              Circles the symbol once over the length of this camera: make it longer for a slower lap. To circle while it stands still, add a pause on the route.
            </p>

            <div className="seg" role="group" aria-label="Orbit direction">
              <button
                aria-pressed={orbitDirection === 'clockwise'}
                onClick={() => onSetOrbitDirection?.('clockwise')}
              >
                Clockwise
              </button>
              <button
                aria-pressed={orbitDirection === 'anticlockwise'}
                onClick={() => onSetOrbitDirection?.('anticlockwise')}
              >
                Anticlockwise
              </button>
            </div>

            <div className="group">
              <div className="group-title">
                <span>ZOOM</span>
                <output>{followZoom.toFixed(1)}</output>
              </div>
              <input
                type="range"
                min="2"
                max="18"
                step="0.1"
                value={followZoom}
                onChange={(e) => onSetFollowZoom(Number(e.target.value))}
                className="range"
              />
              <div className="range-labels">
                <span>Wide</span>
                <span>Close</span>
              </div>
            </div>

            <div className="group">
              <div className="group-title">
                <span>TILT</span>
                <output>{tilt}°</output>
              </div>
              <input
                type="range"
                min="0"
                max="80"
                value={tilt}
                onChange={(e) => onSetTilt(Number(e.target.value))}
                className="range"
              />
              <div className="range-labels">
                <span>From above</span>
                <span>Low</span>
              </div>
              <p className="hint">
                Or zoom and tilt the map itself. Turning the map sets where on the circle it is now.
              </p>
            </div>
          </>
        )}

        {/* 4. FOLLOW MODE */}
        {cameraMode === 'follow' && (
          <>
            <p className="hint">
              Stays with the tip of the line as it travels.
            </p>

            <div className="group">
              <div className="group-title">
                <span>WHICH WAY IS UP</span>
              </div>
              <div className="orient">
                <button
                  type="button"
                  aria-pressed={followOrient === 'north'}
                  onClick={() => onSetFollowOrient('north')}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polygon points="12 6 15 12 12 10 9 12 12 6" fill="currentColor" stroke="none" />
                    <polygon points="12 18 15 12 12 14 9 12 12 18" fill="none" />
                  </svg>
                  <strong>Same direction up</strong>
                  <span>The map stays still, the arrow turns</span>
                </button>

                <button
                  type="button"
                  aria-pressed={followOrient === 'heading'}
                  onClick={() => onSetFollowOrient('heading')}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L19 21L12 17L5 21L12 2Z" fill="currentColor" />
                  </svg>
                  <strong>Direction of travel</strong>
                  <span>The map turns, the arrow points up</span>
                </button>
              </div>
            </div>

            <div className="group">
              <div className="group-title">
                <span>ZOOM</span>
                <output>{followZoom.toFixed(1)}</output>
              </div>
              <input
                type="range"
                min="2"
                max="18"
                step="0.1"
                value={followZoom}
                onChange={(e) => onSetFollowZoom(Number(e.target.value))}
                className="range"
              />
              <div className="range-labels">
                <span>Wide</span>
                <span>Close</span>
              </div>
            </div>

            {followOrient === 'north' && onSetRotateOffset && (
              <div className="group">
                <div className="group-title">
                  <span>ROTATE</span>
                  <output>{rotateOffset > 0 ? `+${rotateOffset}°` : `${rotateOffset}°`}</output>
                </div>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  value={rotateOffset}
                  onChange={(e) => onSetRotateOffset(Number(e.target.value))}
                  className="range"
                />
                <div className="range-labels">
                  <span>Left</span>
                  <span>North up</span>
                  <span>Right</span>
                </div>
              </div>
            )}

            <div className="group">
              <div className="group-title">
                <span>TILT</span>
                <output>{tilt}°</output>
              </div>
              <input
                type="range"
                min="0"
                max="80"
                value={tilt}
                onChange={(e) => onSetTilt(Number(e.target.value))}
                className="range"
              />
              <div className="range-labels">
                <span>Flat</span>
                <span>Tilted</span>
              </div>
              <p className="hint">
                Or zoom, turn and tilt the map itself.
              </p>
            </div>
          </>
        )}
      </div>

      <p className="hint mt-auto pt-4 border-t border-[var(--border)] text-xs leading-relaxed">
        To film differently from a moment on, move the playhead there and click + on it in the timeline (or press N). The × on a camera there deletes it.
      </p>
    </aside>
  );
};
