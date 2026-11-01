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
  lookAhead: number;
  onSetLookAhead: (lookAhead: number) => void;
  cameraBlocks: CameraBlock[];
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
  lookAhead,
  onSetLookAhead,
}) => {
  return (
    <aside className="panel w-80 h-full overflow-y-auto p-4 flex flex-col space-y-4 text-xs">
      <div>
        <h2>5. Camera Movement</h2>
        <p className="lede">
          Choose how the camera films the journey: following the moving symbol, holding a still frame, watching from a tripod, or orbiting.
        </p>
      </div>

      {/* Camera Mode (Oct 20 changelog: 4 kinds of camera) */}
      <div className="group">
        <div className="group-title">How the camera films</div>
        <div className="grid grid-cols-4 gap-1 seg p-0.5" role="group">
          <button
            aria-pressed={cameraMode === 'follow'}
            onClick={() => onSetCameraMode('follow')}
            className="text-[11px] py-1.5"
          >
            Follow
          </button>
          <button
            aria-pressed={cameraMode === 'still'}
            onClick={() => onSetCameraMode('still')}
            className="text-[11px] py-1.5"
          >
            Still
          </button>
          <button
            aria-pressed={cameraMode === 'tripod'}
            onClick={() => onSetCameraMode('tripod')}
            className="text-[11px] py-1.5"
          >
            Tripod
          </button>
          <button
            aria-pressed={cameraMode === 'orbit'}
            onClick={() => onSetCameraMode('orbit')}
            className="text-[11px] py-1.5"
          >
            Orbit
          </button>
        </div>
        <p className="hint">
          {cameraMode === 'follow'
            ? 'Stays with the symbol as it travels.'
            : cameraMode === 'still'
            ? 'Holds one fixed panoramic framing.'
            : cameraMode === 'tripod'
            ? 'Stands in one fixed vantage spot and turns to watch the symbol go by.'
            : 'Smoothly circles 360° around the travel symbol over its length.'}
        </p>
      </div>

      {/* Follow Settings */}
      {cameraMode === 'follow' && (
        <>
          <div className="group">
            <div className="group-title">Which way is up</div>
            <div className="seg" role="group">
              <button
                aria-pressed={followOrient === 'north'}
                onClick={() => onSetFollowOrient('north')}
              >
                North up
              </button>
              <button
                aria-pressed={followOrient === 'heading'}
                onClick={() => onSetFollowOrient('heading')}
              >
                Direction of travel
              </button>
            </div>
            <p className="hint">
              {followOrient === 'north'
                ? 'The map stays still, the symbol turns.'
                : 'The map turns, the symbol always points straight ahead.'}
            </p>
          </div>

          {/* Oct 17 changelog: Rotate slider for North up */}
          {followOrient === 'north' && onSetRotateOffset && (
            <div className="group">
              <div className="flex justify-between group-title">
                <span>Rotate map angle</span>
                <output>{rotateOffset > 0 ? `+${rotateOffset}°` : `${rotateOffset}°`}</output>
              </div>
              <input
                type="range"
                min="-180"
                max="180"
                step="5"
                value={rotateOffset}
                onChange={(e) => onSetRotateOffset(Number(e.target.value))}
                className="range"
              />
              <div className="range-labels">
                <span>-180°</span>
                <span>0° (North)</span>
                <span>+180°</span>
              </div>
              <p className="hint">Keeps this custom direction upwards throughout the entire video.</p>
            </div>
          )}

          <div className="group">
            <div className="flex justify-between group-title">
              <span>Zoom</span>
              <output>{followZoom.toFixed(1)}</output>
            </div>
            <input
              type="range"
              min="2"
              max="16"
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
            <div className="group-title">Look ahead</div>
            <div className="seg" role="group">
              <button
                aria-pressed={lookAhead === 0}
                onClick={() => onSetLookAhead(0)}
              >
                Centred
              </button>
              <button
                aria-pressed={lookAhead === 0.15}
                onClick={() => onSetLookAhead(0.15)}
              >
                A little
              </button>
              <button
                aria-pressed={lookAhead === 0.3}
                onClick={() => onSetLookAhead(0.3)}
              >
                More
              </button>
            </div>
            <p className="hint">How far ahead of the symbol the camera looks as it travels.</p>
          </div>
        </>
      )}

      {/* Tilt */}
      <div className="group">
        <div className="flex justify-between group-title">
          <span>Tilt (Pitch)</span>
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
          <span>Flat (0°)</span>
          <span>Tilted 3D (80°)</span>
        </div>
        <p className="hint">Tilt gives a flyover feel over 3D mountains.</p>
      </div>
    </aside>
  );
};
