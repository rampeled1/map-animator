import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MapProject, StepId, Route, MapTheme, RoutePoint, MapSign, OverlayConfig, CameraBlock } from '../types';
import { MapViewer } from './MapViewer';
import { RouteEditorPanel } from './RouteEditorPanel';
import { SignsEditorPanel } from './SignsEditorPanel';
import { OverlaysEditorPanel } from './OverlaysEditorPanel';
import { CameraEditorPanel } from './CameraEditorPanel';
import { Play, Pause, HelpCircle, Download } from 'lucide-react';
import { SnapProfile, getRoadRoute } from '../utils/roadRouter';
import { calculateTrackStats } from '../utils/gpxParser';
import { exportProjectFile } from '../utils/projectStorage';
import { startCanvasRecording } from '../utils/videoRecorder';
import {
  PRIMARY_THEMES,
  MORE_THEMES_LIST,
  LABEL_LANGUAGES,
  getThemeInfo,
} from '../constants/themes';

interface EditorPageProps {
  project: MapProject;
  onUpdateProject: (updater: (prev: MapProject) => MapProject) => void;
  onBackToHome: () => void;
  onImportGPX: (
    file: File,
    options?: { importWaypoints: boolean; createDayEndSigns: boolean },
    sceneIndex?: number
  ) => void;
}

/** Exact `k6` SVG theme swatch from mapanimator.baldinger.se */
const ThemeSwatch: React.FC<{ info: MapTheme }> = ({ info }) => {
  const [land, water, road] = info.swatch;
  const isSat = info.id === 'satellite';
  return (
    <svg className="theme-swatch" viewBox="0 0 80 48" aria-hidden="true">
      <rect width="80" height="48" fill={land} />
      {isSat && (
        <>
          <ellipse cx="22" cy="14" rx="18" ry="9" fill={road} opacity="0.55" />
          <ellipse cx="52" cy="36" rx="16" ry="8" fill={road} opacity="0.4" />
        </>
      )}
      <path
        d="M52 0 C58 10 70 12 80 10 V0Z M0 34 C10 30 18 40 26 48 H0Z"
        fill={water}
      />
      {!isSat && (
        <path
          d="M-2 22 C20 16 34 30 54 22 S76 18 82 26"
          fill="none"
          stroke={road}
          strokeWidth="3"
        />
      )}
      <path
        d="M8 40 C24 32 40 12 70 18"
        fill="none"
        stroke="#ff4d2e"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
};

function formatTimeSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return `${m}:${Number(s) < 10 ? '0' : ''}${s}`;
}

export const EditorPage: React.FC<EditorPageProps> = ({
  project,
  onUpdateProject,
  onBackToHome,
  onImportGPX,
}) => {
  const [currentStep, setCurrentStep] = useState<StepId>('route');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<0.5 | 1 | 2>(1);
  const [moreThemesOpen, setMoreThemesOpen] = useState(false);
  const [snapProfile, setSnapProfile] = useState<SnapProfile>('driving');
  const [routingInterval, setRoutingInterval] = useState<number | 'auto'>(0.1);
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);

  // Command+Z Undo / Redo action history stack
  const undoStackRef = useRef<any[]>([]);
  const redoStackRef = useRef<any[]>([]);
  const lastSnapshotTimeRef = useRef<number>(0);
  const projectRef = useRef(project);
  projectRef.current = project;

  const pushUndoSnapshot = (force: boolean = true) => {
    const now = Date.now();
    if (!force && now - lastSnapshotTimeRef.current < 600) return;
    lastSnapshotTimeRef.current = now;

    const snapshot = JSON.parse(JSON.stringify(projectRef.current.scenes));
    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > 50) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
  };

  const handleUndo = () => {
    if (undoStackRef.current.length === 0) {
      // Fallback: pop last point of active route if available
      const currentScenes = projectRef.current.scenes;
      const targetScene = currentScenes[activeSceneIndex] || currentScenes[0];
      const route = targetScene?.routes.find((r) => r.id === activeRouteId);
      if (route && route.points.length > 0) {
        const popped = route.points.slice(0, -1);
        handleUpdateRoute({
          ...route,
          points: popped,
          stats: calculateTrackStats(popped),
        });
      }
      return;
    }
    const previousScenes = undoStackRef.current.pop()!;
    const currentScenes = JSON.parse(JSON.stringify(projectRef.current.scenes));
    redoStackRef.current.push(currentScenes);

    onUpdateProject((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      scenes: previousScenes,
    }));
  };

  const handleRedo = () => {
    if (redoStackRef.current.length === 0) return;
    const nextScenes = redoStackRef.current.pop()!;
    const currentScenes = JSON.parse(JSON.stringify(projectRef.current.scenes));
    undoStackRef.current.push(currentScenes);

    onUpdateProject((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      scenes: nextScenes,
    }));
  };

  // Camera settings state (Follow, Still, Tripod, Orbit)
  const [cameraMode, setCameraMode] = useState<'follow' | 'still' | 'orbit' | 'tripod'>('follow');
  const [followOrient, setFollowOrient] = useState<'north' | 'heading'>('north');
  const [rotateOffset, setRotateOffset] = useState<number>(0);
  const [followZoom, setFollowZoom] = useState(8);
  const [tilt, setTilt] = useState(0);
  const [lookAhead] = useState(0.15);
  const [distanceKm, setDistanceKm] = useState<number>(2.3);
  const [heightKm, setHeightKm] = useState<number>(2.9);
  const [orbitDirection, setOrbitDirection] = useState<'clockwise' | 'anticlockwise'>('clockwise');

  // In-browser video rendering state
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStatus, setRenderStatus] = useState('');
  const [renderAllScenes, setRenderAllScenes] = useState(false);
  const [creditCopied, setCreditCopied] = useState(false);
  const [fitRouteRequested, setFitRouteRequested] = useState<Route | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpTab, setHelpTab] = useState<'guide' | 'shortcuts' | 'heic'>('guide');
  const stageRef = useRef<HTMLDivElement>(null);

  const activeScene = project.scenes[activeSceneIndex] || project.scenes[0];
  const [activeRouteId, setActiveRouteId] = useState<string>(
    activeScene?.routes[0]?.id || 'route-1'
  );

  const duration = activeScene?.duration || 15;
  const mapLabels = activeScene?.mapLabels ?? true;
  const labelLang = activeScene?.labelLang ?? '';
  const regions = activeScene?.regions ?? false;
  const terrain = activeScene?.terrain ?? false;
  const selectedExtraTheme = MORE_THEMES_LIST.find((t) => t.id === activeScene?.mapThemeId);

  // Active camera keyframe block resolution
  const playheadRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const sortedCameraBlocks = (activeScene.cameraBlocks || []).slice().sort((a, b) => a.tRatio - b.tRatio);
  const activeCameraBlock = sortedCameraBlocks.filter((cb) => cb.tRatio <= playheadRatio).pop() || null;

  // Global Keyboard Shortcuts (Official Help Guide feature + 'N' for Camera)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;

      if (e.key === '1') setCurrentStep('route');
      else if (e.key === '2') setCurrentStep('map');
      else if (e.key === '3') setCurrentStep('signs');
      else if (e.key === '4') setCurrentStep('overlays');
      else if (e.key === '5') setCurrentStep('camera');
      else if (e.key === '6') setCurrentStep('preview');
      else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        handleAddCameraBlock(cameraMode);
      } else if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setHelpOpen((h) => {
          if (!h) setHelpTab('shortcuts');
          return !h;
        });
      } else if (e.key === 'Escape') {
        setHelpOpen(false);
        setMoreThemesOpen(false);
      } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (
        ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') ||
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y')
      ) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeScene, activeRouteId, cameraMode, currentTime, duration, followZoom, tilt, rotateOffset, followOrient, distanceKm, heightKm, orbitDirection]);

  // Animation timeline playhead loop
  useEffect(() => {
    if (!isPlaying) return;
    let lastTime = performance.now();
    let frameId: number;

    const loop = (now: number) => {
      const deltaSec = ((now - lastTime) / 1000) * (isRendering ? 1 : playbackSpeed);
      lastTime = now;

      setCurrentTime((prev) => {
        const next = prev + deltaSec;
        if (next >= duration) {
          if (isRendering && renderAllScenes && activeSceneIndex < project.scenes.length - 1) {
            setActiveSceneIndex((idx) => idx + 1);
            return 0;
          }
          setIsPlaying(false);
          return 0;
        }
        return next;
      });

      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, duration, playbackSpeed, isRendering, renderAllScenes, activeSceneIndex, project.scenes.length]);

  const steps: { id: StepId; label: string; num: number }[] = [
    { id: 'route', label: 'Route', num: 1 },
    { id: 'map', label: 'Map', num: 2 },
    { id: 'signs', label: 'Signs', num: 3 },
    { id: 'overlays', label: 'Overlays', num: 4 },
    { id: 'camera', label: 'Camera', num: 5 },
    { id: 'preview', label: 'Preview & export', num: 6 },
  ];

  const updateActiveScene = (patch: Partial<typeof activeScene>) => {
    onUpdateProject((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      scenes: prev.scenes.map((s, idx) => (idx === activeSceneIndex ? { ...s, ...patch } : s)),
    }));
  };

  const handleAddScene = () => {
    const newScene = {
      ...activeScene,
      id: `scene-${Date.now()}`,
      name: `Scene ${project.scenes.length + 1}`,
      routes: [],
      signs: [],
    };
    onUpdateProject((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      scenes: [...prev.scenes, newScene],
    }));
    setActiveSceneIndex(project.scenes.length);
  };

  const handleAddPoint = async (point: { lng: number; lat: number }) => {
    pushUndoSnapshot(true);
    const targetRoute = activeScene.routes.find((r) => r.id === activeRouteId);
    let newPoints: RoutePoint[] = [point];

    if (snapProfile !== 'off' && targetRoute && targetRoute.points.length > 0) {
      const lastPoint = targetRoute.points[targetRoute.points.length - 1];
      newPoints = await getRoadRoute(lastPoint, point, snapProfile, routingInterval);
    }

    onUpdateProject((prev) => {
      const updatedRoutes = prev.scenes[activeSceneIndex].routes.map((r) => {
        if (r.id === activeRouteId) {
          const merged = [...r.points, ...newPoints];
          return {
            ...r,
            points: merged,
            stats: calculateTrackStats(merged),
          };
        }
        return r;
      });
      return {
        ...prev,
        updatedAt: Date.now(),
        scenes: prev.scenes.map((s, idx) =>
          idx === activeSceneIndex ? { ...s, routes: updatedRoutes } : s
        ),
      };
    });
  };

  const handleAddRoute = () => {
    if (activeScene.routes.length >= 6) {
      alert('A scene can have up to six routes.');
      return;
    }
    const colors = ['#ff4d2e', '#2196f3', '#4caf50', '#ff9800', '#9c27b0', '#00bcd4'];
    const newRoute: Route = {
      id: `route-${Date.now()}`,
      name: `Route ${activeScene.routes.length + 1}`,
      color: colors[activeScene.routes.length % colors.length],
      width: 8,
      style: 'solid',
      transportType: 'car',
      symbolScale: 1.0,
      legs: [],
      points: [],
    };
    onUpdateProject((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      scenes: prev.scenes.map((s, idx) =>
        idx === activeSceneIndex ? { ...s, routes: [...s.routes, newRoute] } : s
      ),
    }));
    setActiveRouteId(newRoute.id);
  };

  const handleDuplicateRoute = (route: Route) => {
    if (activeScene.routes.length >= 6) {
      alert('A scene can have up to six routes.');
      return;
    }
    const colors = ['#ff4d2e', '#2196f3', '#4caf50', '#ff9800', '#9c27b0', '#00bcd4'];
    const duplicated: Route = {
      ...route,
      id: `route-${Date.now()}`,
      name: `${route.name} (Copy)`,
      color: colors[activeScene.routes.length % colors.length],
    };
    onUpdateProject((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      scenes: prev.scenes.map((s, idx) =>
        idx === activeSceneIndex ? { ...s, routes: [...s.routes, duplicated] } : s
      ),
    }));
    setActiveRouteId(duplicated.id);
  };

  const handleDeleteRoute = (id: string) => {
    pushUndoSnapshot(true);
    onUpdateProject((prev) => {
      const filtered = prev.scenes[activeSceneIndex].routes.filter((r) => r.id !== id);
      if (activeRouteId === id && filtered.length > 0) {
        setActiveRouteId(filtered[0].id);
      }
      return {
        ...prev,
        updatedAt: Date.now(),
        scenes: prev.scenes.map((s, idx) =>
          idx === activeSceneIndex ? { ...s, routes: filtered } : s
        ),
      };
    });
  };

  const handleUpdateRoute = (updated: Route) => {
    pushUndoSnapshot(false);
    onUpdateProject((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      scenes: prev.scenes.map((s, idx) =>
        idx === activeSceneIndex
          ? { ...s, routes: s.routes.map((r) => (r.id === updated.id ? updated : r)) }
          : s
      ),
    }));
  };

  // Signs handlers
  const handleAddSign = (sign: MapSign) => {
    pushUndoSnapshot(true);
    updateActiveScene({ signs: [...activeScene.signs, sign] });
  };
  const handleUpdateSign = (sign: MapSign) => {
    updateActiveScene({
      signs: activeScene.signs.map((s) => (s.id === sign.id ? sign : s)),
    });
  };
  const handleDeleteSign = (id: string) => {
    pushUndoSnapshot(true);
    updateActiveScene({
      signs: activeScene.signs.filter((s) => s.id !== id),
    });
  };
  const handleReorderSigns = (newSigns: MapSign[]) => {
    pushUndoSnapshot(true);
    updateActiveScene({ signs: newSigns });
  };

  // Overlays handler
  const handleUpdateOverlays = (overlays: OverlayConfig) => {
    updateActiveScene({ overlays });
  };

  // Camera keyframe block handlers (Oct 20 changelog & 3D pipeline)
  const handleAddCameraBlock = (kind: 'follow' | 'still' | 'orbit' | 'tripod') => {
    pushUndoSnapshot(true);
    const pts = activeScene.routes[0]?.points || [];
    const tRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
    const idx = Math.min(pts.length - 1, Math.max(0, Math.floor(pts.length * tRatio)));
    const targetPt = pts[idx] || (pts.length > 0 ? pts[0] : { lng: 15, lat: 50 });
    const newBlock: CameraBlock = {
      id: `cam-${Date.now()}`,
      tRatio,
      kind,
      center: [targetPt.lng, targetPt.lat] as [number, number],
      zoom: followZoom,
      pitch: tilt,
      bearing: rotateOffset,
      followOrient,
      rotateOffset,
      distanceKm,
      heightKm,
      orbitDirection,
      easing: 'smooth' as const,
    };
    updateActiveScene({
      cameraBlocks: [...(activeScene.cameraBlocks || []), newBlock],
    });
  };

  const handleUpdateActiveCameraBlock = (updates: Partial<CameraBlock>) => {
    if (!activeCameraBlock) return;
    const updatedBlocks = (activeScene.cameraBlocks || []).map((cb) =>
      cb.id === activeCameraBlock.id ? { ...cb, ...updates } : cb
    );
    updateActiveScene({ cameraBlocks: updatedBlocks });
  };

  const handleDeleteCameraBlock = (id: string) => {
    pushUndoSnapshot(true);
    updateActiveScene({
      cameraBlocks: (activeScene.cameraBlocks || []).filter((cb) => cb.id !== id),
    });
  };

  // Synchronize local camera controls when active block changes
  useEffect(() => {
    if (activeCameraBlock) {
      if (activeCameraBlock.kind) setCameraMode(activeCameraBlock.kind);
      if (activeCameraBlock.pitch !== undefined) setTilt(activeCameraBlock.pitch);
      if (activeCameraBlock.zoom !== undefined) setFollowZoom(activeCameraBlock.zoom);
      if (activeCameraBlock.rotateOffset !== undefined) setRotateOffset(activeCameraBlock.rotateOffset);
      if (activeCameraBlock.followOrient !== undefined) setFollowOrient(activeCameraBlock.followOrient);
      if (activeCameraBlock.distanceKm !== undefined) setDistanceKm(activeCameraBlock.distanceKm);
      if (activeCameraBlock.heightKm !== undefined) setHeightKm(activeCameraBlock.heightKm);
      if (activeCameraBlock.orbitDirection !== undefined) setOrbitDirection(activeCameraBlock.orbitDirection);
    }
  }, [activeCameraBlock?.id]);

  const handleMapCameraChange = (cam: {
    zoom: number;
    pitch: number;
    bearing: number;
    center: [number, number];
  }) => {
    if (currentStep !== 'camera') return;
    setFollowZoom(cam.zoom);
    setTilt(cam.pitch);
    setRotateOffset(cam.bearing);
    if (activeCameraBlock) {
      handleUpdateActiveCameraBlock({
        zoom: cam.zoom,
        pitch: cam.pitch,
        bearing: cam.bearing,
        rotateOffset: cam.bearing,
        center: cam.center,
      });
    }
  };

  // Video render handler
  const handleStartRender = () => {
    if (!stageRef.current) return;
    setIsRendering(true);
    setRenderProgress(0);
    setRenderStatus('Initializing recording...');
    if (renderAllScenes && project.scenes.length > 1) {
      setActiveSceneIndex(0);
    }
    setCurrentTime(0);
    setIsPlaying(true);

    const totalDurationSec =
      renderAllScenes && project.scenes.length > 1
        ? project.scenes.reduce((acc, s) => acc + (s.duration || 15), 0)
        : duration;

    try {
      startCanvasRecording(stageRef.current, project.name, {
        durationSec: totalDurationSec,
        fps: project.fps || 30,
        onProgress: (p, status) => {
          setRenderProgress(p);
          setRenderStatus(status);
        },
        onFinish: () => {
          setIsRendering(false);
          setIsPlaying(false);
          setCurrentTime(0);
        },
      });
    } catch (err: any) {
      alert(`Could not start render: ${err.message}`);
      setIsRendering(false);
      setIsPlaying(false);
    }
  };

  return (
    <div className="editor h-screen w-screen flex flex-col bg-[var(--bg)] text-[var(--text)] overflow-hidden">
      {/* 1. Top Bar */}
      <header className="topbar h-12 border-b border-[var(--border)] bg-[var(--panel)] px-4 flex items-center justify-between z-30">
        <div className="crumb flex items-center space-x-3">
          <button
            type="button"
            className="back text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)] transition-colors flex items-center space-x-1"
            onClick={onBackToHome}
          >
            <span>← Projects</span>
          </button>
          <span className="text-[var(--border)]">/</span>
          <input
            className="project-title bg-transparent border-0 font-semibold text-sm text-[var(--text)] focus:ring-1 focus:ring-[var(--accent)] px-2 py-1 rounded"
            value={project.name}
            onChange={(e) =>
              onUpdateProject((prev) => ({
                ...prev,
                name: e.target.value,
                updatedAt: Date.now(),
              }))
            }
            aria-label="Project name"
          />
        </div>

        {/* Multi-Scene Tabs */}
        <div className="scene-tabs flex items-center space-x-1">
          {project.scenes.map((s, idx) => (
            <button
              key={s.id}
              onClick={() => {
                setActiveSceneIndex(idx);
                if (s.routes.length > 0) setActiveRouteId(s.routes[0].id);
              }}
              className={`px-3 py-1 text-xs rounded-t font-medium transition-colors ${
                idx === activeSceneIndex
                  ? 'border-b-2 border-[var(--accent)] bg-[var(--panel-2)] text-[var(--text)]'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              Scene {idx + 1}
            </button>
          ))}
          <button
            onClick={handleAddScene}
            className="px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)] font-medium"
            title="Add a new scene"
          >
            +
          </button>
        </div>

        <div className="flex items-center space-x-2">
          {/* Export .mapanim Project File */}
          <button
            type="button"
            onClick={() => exportProjectFile(project)}
            className="text-xs px-2.5 py-1 rounded border border-[var(--border)] hover:bg-[var(--panel-2)] text-[var(--text)] flex items-center space-x-1"
            title="Download project as .mapanim file"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export .mapanim</span>
          </button>

          <a
            className="donate-mini text-xs px-2.5 py-1 rounded border border-[var(--border)] hover:bg-[var(--panel-2)] text-[var(--text)]"
            href="https://www.paypal.com/donate/?hosted_button_id=4Z34EYQP2T548"
            target="_blank"
            rel="noopener noreferrer"
          >
            ❤️ Donate
          </a>
        </div>
      </header>

      {/* 2. Step Bar */}
      <nav className="stepbar h-11 border-b border-[var(--border)] bg-[var(--panel-2)] px-4 flex items-center justify-between z-20">
        <div className="steps flex items-center space-x-1">
          {steps.map((s) => {
            const isActive = currentStep === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setCurrentStep(s.id)}
                className={`step px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 ${
                  isActive
                    ? 'active bg-[var(--panel)] text-[var(--accent)] shadow-sm border border-[var(--border)]'
                    : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel)]'
                }`}
              >
                <span className="num opacity-60 text-[10px]">{s.num}</span>
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>

        <div className="stepbar-right flex items-center space-x-3">
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="shortcuts-btn text-xs text-[var(--muted)] hover:text-[var(--text)] flex items-center space-x-1.5 px-2 py-1 rounded border border-[var(--border)]"
            title="Help & Keyboard shortcuts (?)"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span className="shortcuts-label hidden sm:inline">Help & Shortcuts</span>
          </button>

          <label className="aspect-pick flex items-center space-x-1.5 text-xs text-[var(--muted)] cursor-pointer">
            <span className="shape-icon w-3.5 h-2.5 border border-current rounded-sm"></span>
            <select
              value={project.aspect}
              onChange={(e) =>
                onUpdateProject((prev) => ({
                  ...prev,
                  aspect: e.target.value as any,
                  updatedAt: Date.now(),
                }))
              }
              className="bg-[var(--panel)] text-[var(--text)] text-xs border border-[var(--border)] rounded px-2 py-1 focus:ring-1 focus:ring-[var(--accent)]"
            >
              <option value="16:9">16:9 Landscape</option>
              <option value="9:16">9:16 Portrait (Reels/TikTok)</option>
              <option value="1:1">1:1 Square</option>
              <option value="4:5">4:5 Instagram</option>
              <option value="21:9">21:9 Cinema</option>
            </select>
          </label>
        </div>
      </nav>

      {/* 3. Main Workspace */}
      <div className="workspace-wrap flex-1 flex relative overflow-hidden">
        {/* Step 1: Route */}
        {currentStep === 'route' && (
          <RouteEditorPanel
            routes={activeScene.routes}
            activeRouteId={activeRouteId}
            snapProfile={snapProfile}
            onSetSnapProfile={setSnapProfile}
            routingInterval={routingInterval}
            onSetRoutingInterval={setRoutingInterval}
            onSelectRoute={setActiveRouteId}
            onAddRoute={handleAddRoute}
            onDuplicateRoute={handleDuplicateRoute}
            onFitRoute={(r) => setFitRouteRequested({ ...r })}
            onUpdateRoute={handleUpdateRoute}
            onDeleteRoute={handleDeleteRoute}
            onImportGPX={(file, opts) => onImportGPX(file, opts, activeSceneIndex)}
          />
        )}

        {/* Step 2: Map */}
        {currentStep === 'map' && (
          <aside className="panel">
            <div>
              <h2>Choose the map</h2>
              <p className="lede">
                The map under your routes. The routes’ lines and symbols are styled in the Route
                step.
              </p>
              <p className="scene-note">
                For this scene. A new scene copies the map of the last scene.
              </p>
            </div>

            <div className="group">
              <div className="group-title">Map theme</div>
              <div className="themes" role="radiogroup" aria-label="Map theme">
                {PRIMARY_THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    role="radio"
                    aria-checked={activeScene.mapThemeId === theme.id}
                    className="theme"
                    onClick={() => updateActiveScene({ mapThemeId: theme.id })}
                    title={theme.note}
                  >
                    <ThemeSwatch info={theme} />
                    <span>{theme.name}</span>
                  </button>
                ))}

                <button
                  role="radio"
                  aria-checked={!!selectedExtraTheme}
                  className="theme more-tile"
                  onClick={() => setMoreThemesOpen(true)}
                  title="21 more map themes"
                >
                  <span className="more-face">
                    {selectedExtraTheme && <ThemeSwatch info={selectedExtraTheme} />}
                    <span className="more-icon" aria-hidden="true">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
                        <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
                        <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
                        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
                      </svg>
                    </span>
                  </span>
                  <span>More</span>
                </button>
              </div>

              <p className="hint">
                {selectedExtraTheme && <b>{selectedExtraTheme.name}: </b>}
                {getThemeInfo(activeScene.mapThemeId)?.note}
                {selectedExtraTheme && (
                  <>
                    {' '}
                    <button className="link-btn" onClick={() => setMoreThemesOpen(true)}>
                      More themes
                    </button>
                  </>
                )}
              </p>
            </div>

            <div className="group">
              <div className="group-title">On the map</div>
              <label className="toggle">
                Place names
                <input
                  type="checkbox"
                  checked={mapLabels}
                  onChange={(e) => updateActiveScene({ mapLabels: e.target.checked })}
                />
              </label>

              {(mapLabels || regions) && (
                <label className="toggle">
                  Names in
                  <select
                    value={labelLang}
                    onChange={(e) =>
                      updateActiveScene({ labelLang: e.target.value || undefined })
                    }
                  >
                    <option value="">Local names</option>
                    {LABEL_LANGUAGES.map((lang) => (
                      <option key={lang.id} value={lang.id}>
                        {lang.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="toggle">
                States and regions
                <input
                  type="checkbox"
                  checked={regions}
                  onChange={(e) => updateActiveScene({ regions: e.target.checked })}
                />
              </label>

              <label className="toggle">
                3D mountains
                <input
                  type="checkbox"
                  checked={terrain}
                  onChange={(e) => updateActiveScene({ terrain: e.target.checked })}
                />
              </label>

              {terrain && (
                <p className="hint">
                  Mountains rise and get shaded slopes. Tilt the camera in the Camera step to see
                  them in 3D. Renders take a little longer.
                </p>
              )}
            </div>

            <div className="next">
              <button
                className="btn primary block"
                onClick={() => setCurrentStep('signs')}
              >
                Next: add signs →
              </button>
            </div>
          </aside>
        )}

        {/* Step 3: Signs */}
        {currentStep === 'signs' && (
          <SignsEditorPanel
            signs={activeScene.signs}
            defaultCenter={
              activeScene.routes[0]?.points?.length
                ? [
                    activeScene.routes[0].points[Math.floor(activeScene.routes[0].points.length / 2)].lng,
                    activeScene.routes[0].points[Math.floor(activeScene.routes[0].points.length / 2)].lat,
                  ]
                : [15, 50]
            }
            onAddSign={handleAddSign}
            onUpdateSign={handleUpdateSign}
            onDeleteSign={handleDeleteSign}
            onReorderSigns={handleReorderSigns}
          />
        )}

        {/* Step 4: Overlays */}
        {currentStep === 'overlays' && (
          <OverlaysEditorPanel
            overlays={activeScene.overlays}
            onUpdateOverlays={handleUpdateOverlays}
          />
        )}

        {/* Step 5: Camera */}
        {currentStep === 'camera' && (
          <CameraEditorPanel
            cameraMode={cameraMode}
            onSetCameraMode={(mode) => {
              setCameraMode(mode);
              handleUpdateActiveCameraBlock({ kind: mode });
            }}
            followOrient={followOrient}
            onSetFollowOrient={(orient) => {
              setFollowOrient(orient);
              handleUpdateActiveCameraBlock({ followOrient: orient });
            }}
            rotateOffset={rotateOffset}
            onSetRotateOffset={(deg) => {
              setRotateOffset(deg);
              handleUpdateActiveCameraBlock({ rotateOffset: deg, bearing: deg });
            }}
            followZoom={followZoom}
            onSetFollowZoom={(z) => {
              setFollowZoom(z);
              handleUpdateActiveCameraBlock({ zoom: z });
            }}
            tilt={tilt}
            onSetTilt={(t) => {
              setTilt(t);
              handleUpdateActiveCameraBlock({ pitch: t });
            }}
            distanceKm={distanceKm}
            onSetDistanceKm={(d) => {
              setDistanceKm(d);
              handleUpdateActiveCameraBlock({ distanceKm: d });
            }}
            heightKm={heightKm}
            onSetHeightKm={(h) => {
              setHeightKm(h);
              handleUpdateActiveCameraBlock({ heightKm: h });
            }}
            orbitDirection={orbitDirection}
            onSetOrbitDirection={(dir) => {
              setOrbitDirection(dir);
              handleUpdateActiveCameraBlock({ orbitDirection: dir });
            }}
            currentTime={currentTime}
            activeCameraBlock={activeCameraBlock}
          />
        )}

        {/* Step 6: Preview & Export */}
        {currentStep === 'preview' && (
          <aside className="panel w-80 h-full overflow-y-auto p-4 flex flex-col space-y-4 text-xs">
            <div>
              <h2>Preview & export</h2>
              <p className="lede">Renders a high-bitrate video directly in your browser.</p>
            </div>
            <div className="group">
              <div className="group-title">Resolution</div>
              <select
                value={project.size}
                onChange={(e) =>
                  onUpdateProject((prev) => ({
                    ...prev,
                    size: Number(e.target.value) as any,
                    updatedAt: Date.now(),
                  }))
                }
                className="field"
              >
                <option value={480}>480p</option>
                <option value={720}>720p HD</option>
                <option value={1080}>1080p Full HD (Recommended)</option>
                <option value={1440}>1440p 2K</option>
                <option value={2160}>2160p 4K</option>
              </select>
            </div>

            <div className="group">
              <div className="group-title">Frame rate</div>
              <select
                value={project.fps}
                onChange={(e) =>
                  onUpdateProject((prev) => ({
                    ...prev,
                    fps: Number(e.target.value) as any,
                    updatedAt: Date.now(),
                  }))
                }
                className="field"
              >
                <option value={24}>24 fps (Cinema)</option>
                <option value={25}>25 fps (PAL)</option>
                <option value={30}>30 fps (Standard)</option>
                <option value={50}>50 fps (European Broadcast / PAL HD)</option>
                <option value={60}>60 fps (Smooth 60fps)</option>
              </select>
            </div>

            {/* Official FAQ feature: All scenes in one video toggle */}
            {project.scenes.length > 1 && (
              <div className="group space-y-1">
                <div className="group-title">Multi-scene video</div>
                <label className="toggle">
                  All scenes in one video
                  <input
                    type="checkbox"
                    checked={renderAllScenes}
                    onChange={(e) => setRenderAllScenes(e.target.checked)}
                  />
                </label>
                <p className="hint">
                  {renderAllScenes
                    ? 'Renders all scenes sequentially into a single sequence video.'
                    : 'Renders only the active scene.'}
                </p>
              </div>
            )}

            {/* Oct 30 changelog: Map credit on your page instead */}
            <div className="group space-y-2">
              <div className="group-title">Map Credit</div>
              <label className="toggle">
                Include map credit in video
                <input
                  type="checkbox"
                  checked={project.includeMapCredit ?? true}
                  onChange={(e) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      includeMapCredit: e.target.checked,
                      updatedAt: Date.now(),
                    }))
                  }
                />
              </label>
              <div className="p-2.5 rounded-lg bg-[var(--panel-2)] border border-[var(--border)] space-y-1.5">
                <div className="flex justify-between items-center text-[10px] text-[var(--muted)]">
                  <span>Publish Attribution Credit:</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText('Map data © OpenStreetMap contributors, MapLibre');
                      setCreditCopied(true);
                      setTimeout(() => setCreditCopied(false), 2000);
                    }}
                    className="text-[var(--accent)] font-semibold hover:underline"
                  >
                    {creditCopied ? 'Copied!' : 'Copy credit'}
                  </button>
                </div>
                <div className="p-1.5 bg-[var(--panel)] rounded font-mono text-[10px] text-[var(--text)] select-all border border-[var(--border)]">
                  Map data © OpenStreetMap contributors, MapLibre
                </div>
                <p className="text-[10px] text-[var(--muted)] leading-tight">
                  You can leave the map credit out of the video as long as you put it where you publish the video.
                </p>
              </div>
            </div>

            <div className="next pt-2">
              <button
                type="button"
                className="btn primary block"
                disabled={isRendering || activeScene.routes.every((r) => r.points.length === 0)}
                onClick={handleStartRender}
              >
                {isRendering ? 'Rendering...' : 'Render video'}
              </button>
            </div>
          </aside>
        )}

        {/* 3D Map Stage */}
        <main ref={stageRef} className="stage flex-1 h-full relative">
          <MapViewer
            themeId={activeScene.mapThemeId}
            mapLabels={mapLabels}
            labelLang={labelLang || undefined}
            regions={regions}
            terrain={terrain}
            aspect={project.aspect}
            size={project.size}
            routes={activeScene.routes}
            signs={activeScene.signs}
            currentStep={currentStep}
            currentTime={currentTime}
            duration={duration}
            overlays={activeScene.overlays}
            cameraMode={cameraMode}
            followOrient={followOrient}
            rotateOffset={rotateOffset}
            followZoom={followZoom}
            tilt={tilt}
            lookAhead={lookAhead}
            distanceKm={distanceKm}
            heightKm={heightKm}
            orbitDirection={orbitDirection}
            cameraBlocks={activeScene.cameraBlocks}
            includeMapCredit={project.includeMapCredit ?? true}
            isPlaying={isPlaying}
            fitRouteRequested={fitRouteRequested}
            onUpdateRoute={handleUpdateRoute}
            onAddPoint={handleAddPoint}
            onAddSign={handleAddSign}
            onUpdateSign={handleUpdateSign}
            onMapCameraChange={handleMapCameraChange}
          />
        </main>
      </div>

      {/* Render Progress Scrim Dialog */}
      {isRendering &&
        createPortal(
          <div className="scrim">
            <div className="dialog p-6 text-center space-y-4 max-w-sm" role="dialog">
              <h3 className="text-base font-bold text-[var(--text)]">Rendering video</h3>
              <p className="text-xs text-[var(--muted)]">{renderStatus}</p>
              <div className="w-full h-2 rounded-full bg-[var(--panel-2)] overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)] transition-all duration-300"
                  style={{ width: `${renderProgress}%` }}
                />
              </div>
              <span className="text-xs font-mono font-bold text-[var(--accent)]">
                {renderProgress}%
              </span>
            </div>
          </div>,
          document.body
        )}

      {/* More Map Themes Dialog (`A6` exact portal dialog) */}
      {moreThemesOpen &&
        createPortal(
          <div
            className="scrim"
            onClick={(e) => e.target === e.currentTarget && setMoreThemesOpen(false)}
          >
            <div
              className="dialog picker-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="More map themes"
            >
              <div className="dialog-head">
                <h3>More map themes</h3>
                <button
                  className="ghost icon-only"
                  onClick={() => setMoreThemesOpen(false)}
                  aria-label="Close"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
              <div className="more-themes" role="radiogroup" aria-label="More map themes">
                {MORE_THEMES_LIST.map((theme) => (
                  <button
                    key={theme.id}
                    role="radio"
                    aria-checked={activeScene.mapThemeId === theme.id}
                    className="theme more-theme"
                    onClick={() => {
                      updateActiveScene({ mapThemeId: theme.id });
                      setMoreThemesOpen(false);
                    }}
                  >
                    <ThemeSwatch info={theme} />
                    <span className="more-theme-name">{theme.name}</span>
                    <span className="more-theme-note">{theme.note}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* 4. Bottom Timeline Scrubber */}
      <footer className="timeline h-16 border-t border-[var(--border)] bg-[var(--panel)] px-6 flex items-center space-x-6 z-20">
        <button
          type="button"
          onClick={() => setIsPlaying(!isPlaying)}
          className="w-9 h-9 rounded-full bg-[var(--accent)] hover:bg-[#ff6930] text-[var(--accent-ink)] flex items-center justify-center shadow-md transition-transform active:scale-95"
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current ml-0.5" />
          )}
        </button>

        <div className="flex-1 flex flex-col space-y-1 relative">
          <div className="flex justify-between text-[11px] text-[var(--muted)] font-mono">
            <span>{currentTime.toFixed(1)}s</span>
            <span>{duration.toFixed(1)}s</span>
          </div>
          <div className="relative flex items-center">
            <input
              type="range"
              min={0}
              max={duration}
              step={0.1}
              value={currentTime}
              onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-[var(--panel-2)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
            />
          </div>

          {/* Camera keyframe blocks lane (matching snapshots & native classes) */}
          {(currentStep === 'camera' || (activeScene.cameraBlocks && activeScene.cameraBlocks.length > 0)) && (
            <div className="relative w-full h-6 bg-[var(--panel-2)]/60 rounded border border-[var(--border)] overflow-hidden flex items-center mt-0.5">
              {sortedCameraBlocks.map((cb, idx) => {
                const nextCb = sortedCameraBlocks[idx + 1];
                const startPct = cb.tRatio * 100;
                const endPct = nextCb ? nextCb.tRatio * 100 : 100;
                const widthPct = Math.max(1, endPct - startPct);
                const isCurrent = activeCameraBlock?.id === cb.id;

                return (
                  <div
                    key={cb.id}
                    className={`bar cam-block ${cb.kind} ${isCurrent ? 'current' : ''}`}
                    style={{
                      position: 'absolute',
                      left: `${startPct}%`,
                      width: `${widthPct}%`,
                      height: '100%',
                      cursor: 'pointer',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentTime(cb.tRatio * duration);
                      setCameraMode(cb.kind);
                      if (cb.pitch !== undefined) setTilt(cb.pitch);
                      if (cb.zoom !== undefined) setFollowZoom(cb.zoom);
                      if (cb.rotateOffset !== undefined) setRotateOffset(cb.rotateOffset);
                      if (cb.followOrient !== undefined) setFollowOrient(cb.followOrient);
                      if (cb.distanceKm !== undefined) setDistanceKm(cb.distanceKm);
                      if (cb.heightKm !== undefined) setHeightKm(cb.heightKm);
                      if (cb.orbitDirection !== undefined) setOrbitDirection(cb.orbitDirection);
                    }}
                    title={`Camera ${cb.kind} from ${formatTimeSec(cb.tRatio * duration)}`}
                  >
                    <span className="cam-title text-[11px] font-semibold capitalize pl-1.5">
                      {cb.kind}
                    </span>
                    <span className="cam-sub text-[10px] opacity-75 font-mono ml-1">
                      from {formatTimeSec(cb.tRatio * duration)}
                    </span>
                    <button
                      type="button"
                      className="cam-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCameraBlock(cb.id);
                      }}
                      title="Delete this camera block (×)"
                    >
                      ×
                    </button>
                  </div>
                );
              })}

              {/* Camera '+' add button on playhead */}
              {currentStep === 'camera' && (
                <button
                  type="button"
                  className="cam-add"
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                  onClick={() => handleAddCameraBlock(cameraMode)}
                  title="Add camera block at playhead (+ or press N)"
                >
                  +
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={duration}
            onChange={(e) => updateActiveScene({ duration: Number(e.target.value) })}
            className="text-xs font-semibold text-[var(--text)] px-2 py-1 bg-[var(--panel-2)] rounded-md border border-[var(--border)]"
            title="Scene animation duration"
          >
            <option value={5}>5s</option>
            <option value={10}>10s</option>
            <option value={15}>15s</option>
            <option value={20}>20s</option>
            <option value={30}>30s</option>
            <option value={45}>45s</option>
            <option value={60}>60s</option>
            <option value={120}>120s</option>
          </select>

          <button
            type="button"
            onClick={() =>
              setPlaybackSpeed((s) => (s === 1 ? 2 : s === 2 ? 0.5 : 1))
            }
            className="speed-dial text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)] px-3 py-1 bg-[var(--panel-2)] rounded-md border border-[var(--border)] transition-colors"
            title="Click to cycle preview speed (0.5x / 1.0x / 2.0x)"
          >
            {playbackSpeed.toFixed(1)}x Speed
          </button>
        </div>
      </footer>

      {/* Help & Keyboard Shortcuts Modal Dialog (Official Help Document) */}
      {helpOpen &&
        createPortal(
          <div
            className="scrim"
            onClick={(e) => e.target === e.currentTarget && setHelpOpen(false)}
          >
            <div
              className="dialog p-6 max-w-2xl max-h-[85vh] overflow-y-auto space-y-4"
              role="dialog"
              aria-modal="true"
              aria-label="Map Animator Help"
            >
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <div className="flex items-center space-x-3">
                  <h2 className="text-lg font-bold text-[var(--text)]">Help & Documentation</h2>
                  <div className="flex bg-[var(--panel-2)] rounded-md p-0.5 text-xs">
                    <button
                      onClick={() => setHelpTab('guide')}
                      className={`px-2.5 py-1 rounded ${
                        helpTab === 'guide'
                          ? 'bg-[var(--panel)] text-[var(--text)] font-semibold shadow-sm'
                          : 'text-[var(--muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      Guide
                    </button>
                    <button
                      onClick={() => setHelpTab('shortcuts')}
                      className={`px-2.5 py-1 rounded ${
                        helpTab === 'shortcuts'
                          ? 'bg-[var(--panel)] text-[var(--text)] font-semibold shadow-sm'
                          : 'text-[var(--muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      Shortcuts
                    </button>
                    <button
                      onClick={() => setHelpTab('heic')}
                      className={`px-2.5 py-1 rounded ${
                        helpTab === 'heic'
                          ? 'bg-[var(--panel)] text-[var(--text)] font-semibold shadow-sm'
                          : 'text-[var(--muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      iPhone HEIC
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => setHelpOpen(false)}
                  className="text-[var(--muted)] hover:text-[var(--text)] text-lg p-1"
                >
                  ✕
                </button>
              </div>

              {/* Tab 1: Workflow Guide */}
              {helpTab === 'guide' && (
                <div className="space-y-4 text-xs text-[var(--text)] leading-relaxed">
                  <p className="text-[var(--muted)]">
                    A video is made in six steps, shown along the top of the editor. You can move between them at any time.
                  </p>

                  <div className="space-y-1">
                    <h3 className="font-bold text-sm text-[var(--accent)]">1. Route</h3>
                    <p className="text-[var(--muted)]">
                      The editor opens ready to draw: click on the map to place points, or drop in a GPX, KML, KMZ or IGC file. Drag points to move them, double-click a point to make it a sharp corner, and click on the line to add a point in between.
                    </p>
                    <p className="text-[var(--muted)]">
                      Use the <b>⋯ menu</b> on the route to <i>Rename</i>, <i>Duplicate as new route</i>, <i>Make it smooth</i>, <i>Reverse route</i>, or <i>Clear route</i>. Use the <b>Legs box</b> to switch transport modes mid-route (e.g. from motorcycle to ferry or plane).
                    </p>
                    <p className="text-[var(--muted)]">
                      Click any point to choose <b>Pause here</b> (½ to 20 seconds). Paused points show a small ⏸ mark while editing.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <h3 className="font-bold text-sm text-[var(--accent)]">2. Map</h3>
                    <p className="text-[var(--muted)]">
                      Pick a map theme: the primary ones in view or More for twenty others (Old Atlas, Swiss Topo, Blueprint, Military 1930s army map, Neon Night, etc.). Toggle place names in 40 languages, region borders, and 3D terrain elevation.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <h3 className="font-bold text-sm text-[var(--accent)]">3. Signs</h3>
                    <p className="text-[var(--muted)]">
                      Add Map pins, Campsite tents, Start arches, Finish checkered flags, Hotels, or Photos. Photos with GPS metadata are placed automatically where they were taken. Concurrent photos display side-by-side on leader strings without overlapping.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <h3 className="font-bold text-sm text-[var(--accent)]">4. Overlays</h3>
                    <p className="text-[var(--muted)]">
                      Add a title with subtitle, live distance, altitude (including below sea level, like Dead Sea -430m), speed, cumulative Climb & Descent counters (meters climbed and descended), dynamic elevation profile chart, and compass rose.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <h3 className="font-bold text-sm text-[var(--accent)]">5. Camera</h3>
                    <p className="text-[var(--muted)]">
                      Choose between <b>Follow</b> (tracks moving symbol), <b>Still</b> (fixed panoramic view), <b>Tripod</b> (stands in one spot and turns to watch symbol go by), or <b>Orbit</b> (smoothly circles 360°). Tilt up to 80° for sweeping flyovers.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <h3 className="font-bold text-sm text-[var(--accent)]">6. Preview & export</h3>
                    <p className="text-[var(--muted)]">
                      Select resolution (480p to 4K) and frame rate (24, 25, 30, 50, 60 fps). You can leave map credit out of the video as long as you copy the attribution credit snippet to where you publish. Multi-scene projects can toggle <i>All scenes in one video</i>.
                    </p>
                  </div>
                </div>
              )}

              {/* Tab 2: Keyboard Shortcuts */}
              {helpTab === 'shortcuts' && (
                <div className="space-y-3 text-xs">
                  <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[var(--panel-2)] border-b border-[var(--border)]">
                          <th className="p-2.5 font-bold text-[var(--text)]">Shortcut</th>
                          <th className="p-2.5 font-bold text-[var(--text)]">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        <tr>
                          <td className="p-2 font-mono font-bold text-[var(--accent)]">1 – 6</td>
                          <td className="p-2 text-[var(--muted)]">Go to step: Route, Map, Signs, Overlays, Camera, Preview</td>
                        </tr>
                        <tr>
                          <td className="p-2 font-mono font-bold text-[var(--accent)]">Space</td>
                          <td className="p-2 text-[var(--muted)]">Play or pause the preview animation</td>
                        </tr>
                        <tr>
                          <td className="p-2 font-mono font-bold text-[var(--accent)]">⌘ / Ctrl + Z</td>
                          <td className="p-2 text-[var(--muted)]">Undo last point placed on route</td>
                        </tr>
                        <tr>
                          <td className="p-2 font-mono font-bold text-[var(--accent)]">Hold ⌘ / Ctrl + drag</td>
                          <td className="p-2 text-[var(--muted)]">Turn and tilt the 3D map view</td>
                        </tr>
                        <tr>
                          <td className="p-2 font-mono font-bold text-[var(--accent)]">/</td>
                          <td className="p-2 text-[var(--muted)]">Search places and geographical features (Photon)</td>
                        </tr>
                        <tr>
                          <td className="p-2 font-mono font-bold text-[var(--accent)]">Esc</td>
                          <td className="p-2 text-[var(--muted)]">Close open dialogs or clear selection</td>
                        </tr>
                        <tr>
                          <td className="p-2 font-mono font-bold text-[var(--accent)]">?</td>
                          <td className="p-2 text-[var(--muted)]">Show this Help & Shortcuts guide</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab 3: iPhone Photos (HEIC) */}
              {helpTab === 'heic' && (
                <div className="space-y-3 text-xs text-[var(--muted)] leading-relaxed">
                  <p>
                    iPhones save photos as HEIC, which only Safari can show directly. To use them in Chrome, Edge or Firefox, turn them into JPEG first while preserving their EXIF GPS location:
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5">
                    <li>
                      <b>On a Mac, in Photos:</b> Select photos → <i>File → Export → Export Photos</i>. Choose JPEG and tick <i>Location information</i>.
                    </li>
                    <li>
                      <b>On a Mac, in Finder:</b> Select photos → right-click → <i>Quick Actions → Convert Image</i>, and choose JPEG.
                    </li>
                    <li>
                      <b>On a Windows PC:</b> On iPhone, set <i>Settings → Apps → Photos → Transfer to Mac or PC</i> to <i>Automatic</i>.
                    </li>
                    <li>
                      <b>From now on:</b> On iPhone, <i>Settings → Camera → Formats → Most Compatible</i> saves new photos as JPEG straight away.
                    </li>
                    <li>
                      <b>Or use Safari on Mac:</b> Safari renders HEIC photos natively and auto-places them where they were taken.
                    </li>
                  </ul>
                </div>
              )}

              <div className="pt-3 border-t border-[var(--border)] text-right">
                <button
                  onClick={() => setHelpOpen(false)}
                  className="btn primary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
