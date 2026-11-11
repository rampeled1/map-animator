import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  MapProject,
  StepId,
  Route,
  MapTheme,
  RoutePoint,
  MapSign,
  OverlayConfig,
  CameraBlock,
  CameraModePreset,
  AspectRatioOption,
  DurationPreset,
  DestinationPreview,
  CanonicalRoute,
  Scene,
  QuickPreviewSpeed,
  QuickPreviewState,
  QUICK_PREVIEW_BASE_SPEED_KMH,
  QUICK_PREVIEW_SPEED_MULTIPLIERS,
} from '../types';
import { CatmullRom3DPath } from '../utils/catmullRom3DPath';
import { getAdaptedCanonicalRoute } from '../utils/routeAdapter';
import { projectStorage } from '../utils/indexedDbStorage';
import { MapViewer } from './MapViewer';
import { RouteEditorPanel } from './RouteEditorPanel';
import { SignsEditorPanel } from './SignsEditorPanel';
import { OverlaysEditorPanel } from './OverlaysEditorPanel';
import { CameraEditorPanel } from './CameraEditorPanel';
import { MobileSheetHeader, MobileBottomStageBar } from './MobileStageNav';
import { TabletDrawerContainer } from './TabletDrawerContainer';
import {
  useResponsiveLayout,
  getStageForStep,
  getDefaultStepForStage,
  MobileStageId,
  MobileSheetSnap,
} from '../utils/useResponsiveLayout';
import { Play, Pause, HelpCircle, Download, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { SnapProfile, getRoadRoute } from '../utils/roadRouter';
import { calculateTrackStats } from '../utils/gpxParser';
import { exportProjectFile } from '../utils/projectStorage';
import { startCanvasRecording } from '../utils/videoRecorder';
import { mapPresetToCameraBlocks } from '../utils/cameraPresetMapper';
import {
  PRIMARY_THEMES,
  MORE_THEMES_LIST,
  LABEL_LANGUAGES,
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

  // Responsive layout state (Desktop / Tablet Drawer / iPhone 4-Stage Sheet)
  const { tier, experience } = useResponsiveLayout();
  const [tabletDrawerOpen, setTabletDrawerOpen] = useState(true);
  const [mobileSheetSnap, setMobileSheetSnap] = useState<MobileSheetSnap>('split');
  const [lastStepByStage, setLastStepByStage] = useState<Record<MobileStageId, StepId>>({
    journey: 'route',
    style: 'camera',
    personalize: 'title',
    video: 'preview',
  });

  useEffect(() => {
    const stageId = getStageForStep(currentStep);
    setLastStepByStage((prev) =>
      prev[stageId] === currentStep ? prev : { ...prev, [stageId]: currentStep }
    );
  }, [currentStep]);

  const handleSelectMobileStage = (stageId: MobileStageId) => {
    const targetStep = lastStepByStage[stageId] || getDefaultStepForStage(stageId);
    setCurrentStep(targetStep);
    if (mobileSheetSnap === 'map') {
      setMobileSheetSnap('split');
    }
  };

  // Command+Z Undo / Redo action history stack (Unified project-wide, max 20 entries)
  const MAX_UNDO_ENTRIES = 20;
  const undoStackRef = useRef<MapProject[]>([]);
  const redoStackRef = useRef<MapProject[]>([]);
  const isInteractionActiveRef = useRef<boolean>(false);
  const hasInteractionMovedRef = useRef<boolean>(false);
  const preInteractionSnapshotRef = useRef<MapProject | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;

  // Explicit drag interaction lifecycle handling:
  // 1. Pointer-down starts tracking, but does not yet create a history entry
  const beginTrackingInteraction = () => {
    isInteractionActiveRef.current = true;
    hasInteractionMovedRef.current = false;
    preInteractionSnapshotRef.current = JSON.parse(JSON.stringify(projectRef.current));
  };

  // 2. The first actual position change captures the pre-drag project snapshot
  const notifyInteractionMoved = () => {
    if (isInteractionActiveRef.current && !hasInteractionMovedRef.current) {
      hasInteractionMovedRef.current = true;
      if (preInteractionSnapshotRef.current) {
        undoStackRef.current.push(preInteractionSnapshotRef.current);
        if (undoStackRef.current.length > MAX_UNDO_ENTRIES) {
          undoStackRef.current.shift();
        }
        redoStackRef.current = [];
      }
    }
  };

  // 3. Normal completion (pointer-up): commits the drag and its single undo snapshot
  const endTrackingInteraction = () => {
    if (!isInteractionActiveRef.current) return;
    isInteractionActiveRef.current = false;
    hasInteractionMovedRef.current = false;
    preInteractionSnapshotRef.current = null;
  };

  // 4. Cancellation (pointer-cancel, lost pointer capture, or interrupted drag):
  // Restores the project back to the pre-drag snapshot and removes the pending undo entry
  const cancelTrackingInteraction = () => {
    if (!isInteractionActiveRef.current) return;
    const snapshotToRestore = preInteractionSnapshotRef.current;
    const hadMoved = hasInteractionMovedRef.current;

    isInteractionActiveRef.current = false;
    hasInteractionMovedRef.current = false;
    preInteractionSnapshotRef.current = null;

    if (hadMoved && snapshotToRestore) {
      if (undoStackRef.current.length > 0) {
        undoStackRef.current.pop();
      }
      onUpdateProject((_prev) => ({
        ...snapshotToRestore,
        updatedAt: Date.now(),
      }));
    }
  };

  // Unconditionally captures a snapshot for a discrete completed user action.
  // Suppressed during an active drag interaction to prevent partial history pollution.
  const pushUndoSnapshot = () => {
    if (isInteractionActiveRef.current) return;

    // Capture complete immutable snapshot of project document
    const snapshot: MapProject = JSON.parse(JSON.stringify(projectRef.current));
    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > MAX_UNDO_ENTRIES) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
  };

  const handleUndo = () => {
    // Prevent Undo during an active drag interaction
    if (isInteractionActiveRef.current) return;
    if (undoStackRef.current.length === 0) return;
    const previousSnapshot: MapProject = undoStackRef.current.pop()!;
    const currentSnapshot: MapProject = JSON.parse(JSON.stringify(projectRef.current));
    redoStackRef.current.push(currentSnapshot);
    if (redoStackRef.current.length > MAX_UNDO_ENTRIES) {
      redoStackRef.current.shift();
    }

    onUpdateProject((_prev) => ({
      ...previousSnapshot,
      updatedAt: Date.now(),
    }));
  };

  const handleRedo = () => {
    // Prevent Redo during an active drag interaction
    if (isInteractionActiveRef.current) return;
    if (redoStackRef.current.length === 0) return;
    const nextSnapshot: MapProject = redoStackRef.current.pop()!;
    const currentSnapshot: MapProject = JSON.parse(JSON.stringify(projectRef.current));
    undoStackRef.current.push(currentSnapshot);
    if (undoStackRef.current.length > MAX_UNDO_ENTRIES) {
      undoStackRef.current.shift();
    }

    onUpdateProject((_prev) => ({
      ...nextSnapshot,
      updatedAt: Date.now(),
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
  const [destinationPreview, setDestinationPreview] = useState<DestinationPreview | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpTab, setHelpTab] = useState<'guide' | 'shortcuts' | 'heic'>('guide');
  const stageRef = useRef<HTMLDivElement>(null);

  const canonicalRoute = project.routes?.[0];
  const projectRoutes: Route[] = [getAdaptedCanonicalRoute(canonicalRoute)];

  // Quick Route Preview state
  const [quickPreviewState, setQuickPreviewState] = useState<QuickPreviewState>('idle');
  const [quickPreviewProgress, setQuickPreviewProgress] = useState<number>(0);
  const [quickPreviewSpeed, setQuickPreviewSpeed] = useState<QuickPreviewSpeed>('normal');

  const previewRafRef = useRef<number | null>(null);
  const previewLastTimeRef = useRef<number>(0);
  const previewProgressRef = useRef<number>(0);
  previewProgressRef.current = quickPreviewProgress;

  // Single consistent distance-normalized progress model derived from CatmullRom3DPath
  const previewPathEngine = useMemo(() => {
    const pts = canonicalRoute?.calculatedGeometry || projectRoutes[0]?.points || [];
    return new CatmullRom3DPath(pts);
  }, [canonicalRoute?.calculatedGeometry, projectRoutes]);

  const totalPreviewDistanceKm = previewPathEngine.getTotalDistanceKm();
  const remainingPreviewDistanceKm = previewPathEngine.getRemainingDistanceKm(quickPreviewProgress);

  const invalidateRouteAndStopPreview = () => {
    if (previewRafRef.current !== null) {
      cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = null;
    }
    setQuickPreviewState('idle');
    setQuickPreviewProgress(0);
  };

  const stopQuickPreview = () => {
    invalidateRouteAndStopPreview();
  };

  const pauseQuickPreview = () => {
    if (previewRafRef.current !== null) {
      cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = null;
    }
    setQuickPreviewState('paused');
  };

  const resumeQuickPreview = () => {
    if (totalPreviewDistanceKm <= 0) {
      setQuickPreviewState('finished');
      setQuickPreviewProgress(1);
      previewProgressRef.current = 1;
      return;
    }
    previewLastTimeRef.current = performance.now();
    setQuickPreviewState('playing');
  };

  const startQuickPreview = () => {
    if (totalPreviewDistanceKm <= 0) {
      setQuickPreviewState('finished');
      setQuickPreviewProgress(1);
      previewProgressRef.current = 1;
      return;
    }
    setQuickPreviewProgress(0);
    previewProgressRef.current = 0;
    previewLastTimeRef.current = performance.now();
    setQuickPreviewState('playing');
  };

  const restartQuickPreview = () => {
    setQuickPreviewProgress(0);
    previewProgressRef.current = 0;
    if (totalPreviewDistanceKm <= 0) {
      setQuickPreviewState('finished');
      return;
    }
    previewLastTimeRef.current = performance.now();
    setQuickPreviewState('playing');
  };

  // Quick Preview Animation Loop: constant geographic distance per second
  useEffect(() => {
    if (quickPreviewState !== 'playing') {
      if (previewRafRef.current !== null) {
        cancelAnimationFrame(previewRafRef.current);
        previewRafRef.current = null;
      }
      return;
    }

    const speedMultiplier = QUICK_PREVIEW_SPEED_MULTIPLIERS[quickPreviewSpeed] || 1.0;
    const speedKmh = QUICK_PREVIEW_BASE_SPEED_KMH * speedMultiplier;
    const durationSec = totalPreviewDistanceKm > 0 ? (totalPreviewDistanceKm * 3600) / speedKmh : 0;

    if (durationSec <= 0) {
      setQuickPreviewState('finished');
      setQuickPreviewProgress(1);
      previewProgressRef.current = 1;
      return;
    }

    previewLastTimeRef.current = performance.now();

    const tick = (now: number) => {
      const deltaSec = (now - previewLastTimeRef.current) / 1000;
      previewLastTimeRef.current = now;

      const progressDelta = deltaSec / durationSec;
      const nextProgress = Math.min(1, previewProgressRef.current + progressDelta);

      if (nextProgress >= 1) {
        previewProgressRef.current = 1;
        setQuickPreviewProgress(1);
        setQuickPreviewState('finished');
        previewRafRef.current = null;
      } else {
        previewProgressRef.current = nextProgress;
        setQuickPreviewProgress(nextProgress);
        previewRafRef.current = requestAnimationFrame(tick);
      }
    };

    previewRafRef.current = requestAnimationFrame(tick);

    return () => {
      if (previewRafRef.current !== null) {
        cancelAnimationFrame(previewRafRef.current);
        previewRafRef.current = null;
      }
    };
  }, [quickPreviewState, quickPreviewSpeed, totalPreviewDistanceKm]);

  // Automatically exit preview mode if stepping away from 'route'
  useEffect(() => {
    if (currentStep !== 'route' && quickPreviewState !== 'idle') {
      invalidateRouteAndStopPreview();
    }
  }, [currentStep, quickPreviewState]);

  const activeScene = project.scenes[activeSceneIndex] || project.scenes[0];
  const [activeRouteId, setActiveRouteId] = useState<string>(
    projectRoutes[0]?.id || 'route-1'
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
        if (currentStep === 'route') {
          if (quickPreviewState === 'playing') pauseQuickPreview();
          else if (quickPreviewState === 'paused') resumeQuickPreview();
          else if (quickPreviewState === 'finished') restartQuickPreview();
          else startQuickPreview();
        } else {
          setIsPlaying((p) => !p);
        }
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

  const uiMode = project.uiMode || 'simple';
  const activeRoute = projectRoutes[0];
  const handleSetUIMode = (mode: 'simple' | 'advanced') => {
    onUpdateProject((prev) => ({
      ...prev,
      uiMode: mode,
      updatedAt: Date.now(),
    }));
  };

  const steps: { id: StepId; label: string; num: number }[] = [
    { id: 'route', label: 'Route', num: 1 },
    { id: 'camera', label: 'Camera', num: 2 },
    { id: 'map', label: 'Map', num: 3 },
    { id: 'line', label: 'Line', num: 4 },
    { id: 'title', label: 'Title', num: 5 },
    { id: 'signs', label: 'Photos', num: 6 },
    { id: 'overlays', label: 'Info', num: 7 },
    { id: 'preview', label: 'Video', num: 8 },
  ];

  const updateActiveScene = (patch: Partial<typeof activeScene>) => {
    onUpdateProject((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      scenes: prev.scenes.map((s, idx) => (idx === activeSceneIndex ? { ...s, ...patch } : s)),
    }));
  };

  const handleAddScene = () => {
    pushUndoSnapshot();
    const newScene: Scene = {
      id: `scene-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: `Scene ${project.scenes.length + 1}`,
      duration: activeScene.duration || 15,
      holdStartSec: 0,
      holdEndSec: 0,
      mapThemeId: activeScene.mapThemeId || 'satellite-streets',
      mapLabels: activeScene.mapLabels,
      labelLang: activeScene.labelLang,
      regions: activeScene.regions,
      terrain: activeScene.terrain,
      camera: activeScene.camera ? { ...activeScene.camera } : undefined,
      signs: [],
      cameraBlocks: [],
      overlays: { ...activeScene.overlays },
    };
    onUpdateProject((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      scenes: [...prev.scenes, newScene],
    }));
    setActiveSceneIndex(project.scenes.length);
  };

  const handleDeleteScene = (indexToDelete: number) => {
    if (project.scenes.length <= 1) {
      alert('A project must contain at least one scene.');
      return;
    }
    pushUndoSnapshot();
    onUpdateProject((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      scenes: prev.scenes.filter((_, idx) => idx !== indexToDelete),
    }));
    if (activeSceneIndex >= indexToDelete) {
      setActiveSceneIndex(Math.max(0, activeSceneIndex - 1));
    }
  };

  const handleAddPoint = async (point: { lng: number; lat: number }) => {
    invalidateRouteAndStopPreview();
    pushUndoSnapshot();
    const targetRoute = projectRoutes[0];
    let newPoints: RoutePoint[] = [point];

    if (snapProfile !== 'off' && targetRoute && targetRoute.points.length > 0) {
      const lastPoint = targetRoute.points[targetRoute.points.length - 1];
      try {
        newPoints = await getRoadRoute(lastPoint, point, snapProfile, routingInterval, false);
      } catch (err) {
        console.warn('Road routing failed, falling back:', err);
        newPoints = await getRoadRoute(lastPoint, point, snapProfile, routingInterval, true);
      }
    }

    onUpdateProject((prev) => {
      const canonical = prev.routes?.[0];
      const mergedPoints = [...(canonical?.calculatedGeometry || targetRoute.points), ...newPoints];
      const updatedRoute: CanonicalRoute = {
        id: canonical?.id || targetRoute.id,
        name: canonical?.name || targetRoute.name,
        color: canonical?.color || targetRoute.color || '#ff4d2e',
        width: canonical?.width ?? targetRoute.width ?? 8,
        style: canonical?.style || targetRoute.style || 'solid',
        status: 'stale',
        stops: canonical?.stops ? [...canonical.stops] : [],
        segments: canonical?.segments ? [...canonical.segments] : [],
        calculatedGeometry: mergedPoints,
        stats: calculateTrackStats(mergedPoints),
      };
      return {
        ...prev,
        updatedAt: Date.now(),
        routes: [updatedRoute],
      };
    });
  };

  const handleAddRoute = () => {
    // Single canonical route model enforces exactly 1 route per project
    alert('Map Animator enforces a single continuous journey per project.');
  };

  const handleDuplicateRoute = (_route: Route) => {
    alert('Map Animator enforces a single continuous journey per project.');
  };

  const handleDeleteRoute = (_id: string) => {
    invalidateRouteAndStopPreview();
    pushUndoSnapshot();
    onUpdateProject((prev) => {
      const canonical = prev.routes?.[0];
      const clearedRoute: CanonicalRoute = {
        id: canonical?.id || `route-${Date.now()}`,
        name: canonical?.name || 'Main Journey',
        color: canonical?.color || '#ff4d2e',
        width: canonical?.width || 8,
        style: canonical?.style || 'solid',
        status: 'idle',
        stops: [],
        segments: [],
        calculatedGeometry: [],
        stats: { distanceKm: 0, elevationGainM: 0, elevationLossM: 0 },
      };
      return {
        ...prev,
        updatedAt: Date.now(),
        routes: [clearedRoute],
      };
    });
  };

  const handleUpdateCanonicalRoute = (updatedCanonical: CanonicalRoute, isCalculationResult?: boolean) => {
    if (isCalculationResult) {
      onUpdateProject((prev) => ({
        ...prev,
        updatedAt: Date.now(),
        routes: [updatedCanonical],
      }));
    } else {
      invalidateRouteAndStopPreview();
      pushUndoSnapshot();
      onUpdateProject((prev) => {
        const canonical = prev.routes?.[0];
        const staleCanonical: CanonicalRoute = {
          ...updatedCanonical,
          status: 'stale',
          calculatedGeometry:
            updatedCanonical.calculatedGeometry && updatedCanonical.calculatedGeometry.length > 0
              ? updatedCanonical.calculatedGeometry
              : (canonical?.calculatedGeometry || []),
        };
        return {
          ...prev,
          updatedAt: Date.now(),
          routes: [staleCanonical],
        };
      });
    }
  };

  const handleUpdateRoute = (updated: Route, skipUndo?: boolean) => {
    invalidateRouteAndStopPreview();
    if (!skipUndo) {
      pushUndoSnapshot();
    }
    onUpdateProject((prev) => {
      const canonical = prev.routes?.[0];
      const updatedRoute: CanonicalRoute = {
        id: updated.id || canonical?.id || `route-${Date.now()}`,
        name: updated.name || canonical?.name || 'Main Journey',
        color: updated.color || canonical?.color || '#ff4d2e',
        width: updated.width ?? (canonical?.width || 8),
        style: updated.style || canonical?.style || 'solid',
        hideLine: updated.hideLine,
        symbolScale: updated.symbolScale,
        startOffsetSec: updated.startOffsetSec,
        status: skipUndo ? (canonical?.status || 'idle') : 'stale',
        stops: canonical?.stops ? [...canonical.stops] : [],
        segments: canonical?.segments ? [...canonical.segments] : [],
        calculatedGeometry: [...updated.points],
        stats: updated.stats || calculateTrackStats(updated.points),
      };
      return {
        ...prev,
        updatedAt: Date.now(),
        routes: [updatedRoute],
      };
    });
  };

  // Signs handlers
  const handleAddSign = (sign: MapSign) => {
    pushUndoSnapshot();
    updateActiveScene({ signs: [...activeScene.signs, sign] });
  };
  const handleUpdateSign = (sign: MapSign) => {
    pushUndoSnapshot();
    updateActiveScene({
      signs: activeScene.signs.map((s) => (s.id === sign.id ? sign : s)),
    });
  };
  const handleDeleteSign = (id: string) => {
    pushUndoSnapshot();
    updateActiveScene({
      signs: activeScene.signs.filter((s) => s.id !== id),
    });
  };
  const handleReorderSigns = (newSigns: MapSign[]) => {
    pushUndoSnapshot();
    updateActiveScene({ signs: newSigns });
  };

  // Overlays handler
  const handleUpdateOverlays = (overlays: OverlayConfig) => {
    updateActiveScene({ overlays });
  };

  // Camera keyframe block handlers (Oct 20 changelog & 3D pipeline)
  const handleAddCameraBlock = (kind: 'follow' | 'still' | 'orbit' | 'tripod') => {
    pushUndoSnapshot();
    const pts = projectRoutes[0]?.points || [];
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
    pushUndoSnapshot();
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

  const cameraPreset: CameraModePreset = project.cameraPreset || 'fly_along';
  const aspectRatio: AspectRatioOption = (project.aspectRatio || project.aspect || '16:9') as AspectRatioOption;
  const durationPreset: DurationPreset = project.durationPreset || (duration === 20 ? 20 : duration === 40 ? 40 : duration === 60 ? 60 : 'custom');

  const handleSetCameraPreset = (preset: CameraModePreset) => {
    pushUndoSnapshot();
    const pts = projectRoutes[0]?.points || [];
    const newBlocks = mapPresetToCameraBlocks(preset, pts);

    onUpdateProject((prev) => ({
      ...prev,
      cameraPreset: preset,
      cameraSettings: {
        ...prev.cameraSettings,
        preset,
      },
      updatedAt: Date.now(),
      scenes: prev.scenes.map((s, idx) =>
        idx === activeSceneIndex
          ? {
              ...s,
              cameraBlocks: newBlocks,
            }
          : s
      ),
    }));

    if (preset === 'fly_along') {
      setCameraMode('follow');
      setFollowOrient('heading');
      setTilt(55);
      setFollowZoom(15);
    } else if (preset === 'follow_north_up') {
      setCameraMode('follow');
      setFollowOrient('north');
      setTilt(35);
      setFollowZoom(14);
      setRotateOffset(0);
    } else if (preset === 'whole_tour') {
      setCameraMode('still');
      setTilt(10);
    }
  };

  const handleSetAspectRatio = (newAspect: AspectRatioOption) => {
    pushUndoSnapshot();
    onUpdateProject((prev) => ({
      ...prev,
      aspect: newAspect,
      aspectRatio: newAspect,
      updatedAt: Date.now(),
    }));
  };

  const handleSetDuration = (newDuration: number, preset?: DurationPreset) => {
    pushUndoSnapshot();
    onUpdateProject((prev) => ({
      ...prev,
      duration: newDuration,
      durationPreset: preset || (newDuration === 20 ? 20 : newDuration === 40 ? 40 : newDuration === 60 ? 60 : 'custom'),
      updatedAt: Date.now(),
      scenes: prev.scenes.map((s, idx) =>
        idx === activeSceneIndex
          ? {
              ...s,
              duration: newDuration,
            }
          : s
      ),
    }));
  };

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

  const activeStepPanel = (
    <>
      {/* Step 1: Route ("Where are we going?") */}
      {currentStep === 'route' && (
        <RouteEditorPanel
          routes={projectRoutes}
          canonicalRoute={canonicalRoute}
          activeRouteId={activeRouteId}
          uiMode={uiMode}
          snapProfile={snapProfile}
          onSetSnapProfile={setSnapProfile}
          routingInterval={routingInterval}
          onSetRoutingInterval={setRoutingInterval}
          onSelectRoute={setActiveRouteId}
          onAddRoute={handleAddRoute}
          onDuplicateRoute={handleDuplicateRoute}
          onFitRoute={(r) => setFitRouteRequested({ ...r })}
          onUpdateRoute={handleUpdateRoute}
          onUpdateCanonicalRoute={handleUpdateCanonicalRoute}
          onDeleteRoute={handleDeleteRoute}
          onImportGPX={(file, opts) => onImportGPX(file, opts, activeSceneIndex)}
          onPreviewDestination={(dest) => setDestinationPreview(dest)}
          onNext={() => setCurrentStep('camera')}
          quickPreviewState={quickPreviewState}
          quickPreviewProgress={quickPreviewProgress}
          quickPreviewSpeed={quickPreviewSpeed}
          onStartQuickPreview={startQuickPreview}
          onPauseQuickPreview={pauseQuickPreview}
          onResumeQuickPreview={resumeQuickPreview}
          onRestartQuickPreview={restartQuickPreview}
          onStopQuickPreview={stopQuickPreview}
          onSetQuickPreviewSpeed={setQuickPreviewSpeed}
          onSeekQuickPreview={(p) => {
            const clamped = Math.max(0, Math.min(1, p));
            previewProgressRef.current = clamped;
            setQuickPreviewProgress(clamped);
          }}
          remainingDistanceKm={remainingPreviewDistanceKm}
        />
      )}

      {/* Step 3: Map ("What should the map look like?") */}
      {currentStep === 'map' && (
          <aside className="panel w-85 h-full overflow-y-auto p-5 flex flex-col space-y-5 text-xs bg-[#0f172a] border-r border-slate-800 text-slate-100">
            <div>
              <span className="text-[11px] font-bold tracking-wider text-teal-400 uppercase">
                STEP 3 · MAP
              </span>
              <h2 className="text-2xl font-extrabold text-slate-100 mt-1 mb-1 tracking-tight">
                What should the map look like?
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Pick a map style and view options for your travel video.
              </p>
            </div>

            {/* Map Style Theme Selector */}
            <div className="space-y-2.5">
              <span className="text-[11px] font-bold text-teal-400 uppercase tracking-wider block">
                MAP STYLE ?
              </span>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Map theme">
                {PRIMARY_THEMES.map((theme) => {
                  const isSelected = activeScene.mapThemeId === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => updateActiveScene({ mapThemeId: theme.id })}
                      title={theme.note}
                      className={`p-2 rounded-xl border flex flex-col items-center space-y-1.5 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-teal-500/15 border-teal-500 ring-2 ring-teal-500 text-teal-400 font-bold'
                          : 'bg-[#1e293b] border-slate-700 text-slate-300 hover:border-teal-400'
                      }`}
                    >
                      <div className="w-full rounded-lg overflow-hidden border border-black/30">
                        <ThemeSwatch info={theme} />
                      </div>
                      <span className="text-xs">{theme.name}</span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  role="radio"
                  aria-checked={!!selectedExtraTheme}
                  onClick={() => setMoreThemesOpen(true)}
                  title="21 more map themes"
                  className={`p-2 rounded-xl border flex flex-col items-center justify-center space-y-1.5 transition-all cursor-pointer ${
                    selectedExtraTheme
                      ? 'bg-teal-500/15 border-teal-500 ring-2 ring-teal-500 text-teal-400 font-bold'
                      : 'bg-[#1e293b] border-slate-700 text-slate-300 hover:border-teal-400'
                  }`}
                >
                  <div className="w-full aspect-[5/3] rounded-lg overflow-hidden border border-dashed border-slate-600 bg-[#0f172a] flex items-center justify-center relative">
                    {selectedExtraTheme && <ThemeSwatch info={selectedExtraTheme} />}
                    <span className="p-1.5 rounded-md bg-black/60 text-teal-400">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
                        <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
                        <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
                        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
                      </svg>
                    </span>
                  </div>
                  <span className="text-xs">
                    {selectedExtraTheme ? selectedExtraTheme.name : 'More Styles'}
                  </span>
                </button>
              </div>
            </div>

            {/* Map Details Visual Toggle Cards */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-teal-400 uppercase tracking-wider block">
                MAP DETAILS ?
              </span>
              {[
                {
                  label: 'Place names',
                  desc: 'Show city, town, and peak labels',
                  checked: mapLabels,
                  onToggle: () => updateActiveScene({ mapLabels: !mapLabels }),
                },
                {
                  label: 'Country & state borders',
                  desc: 'Draw political and regional boundaries',
                  checked: regions,
                  onToggle: () => updateActiveScene({ regions: !regions }),
                },
                {
                  label: '3D mountains',
                  desc: 'Elevate terrain and hillshading in 3D',
                  checked: terrain,
                  onToggle: () => updateActiveScene({ terrain: !terrain }),
                },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.onToggle}
                  className={`w-full p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                    item.checked
                      ? 'bg-teal-500/15 border-teal-500 ring-1 ring-teal-500'
                      : 'bg-[#1e293b] border-slate-700 hover:border-teal-400'
                  }`}
                >
                  <div className="text-left">
                    <strong className="text-xs text-slate-100 block">{item.label}</strong>
                    <span className="text-[10px] text-slate-400">{item.desc}</span>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center border text-xs font-bold shrink-0 ml-2 ${
                      item.checked
                        ? 'bg-teal-500 border-teal-500 text-slate-950'
                        : 'border-slate-600 bg-slate-800 text-transparent'
                    }`}
                  >
                    ✓
                  </div>
                </button>
              ))}

              {uiMode === 'advanced' && (mapLabels || regions) && (
                <div className="p-3 rounded-xl bg-[#1e293b] border border-slate-700 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">Names in</span>
                  <select
                    value={labelLang}
                    onChange={(e) =>
                      updateActiveScene({ labelLang: e.target.value || undefined })
                    }
                    className="bg-[#0f172a] border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5"
                  >
                    <option value="">Local names</option>
                    {LABEL_LANGUAGES.map((lang) => (
                      <option key={lang.id} value={lang.id}>
                        {lang.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="pt-4 mt-auto border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setCurrentStep('line')}
                className="px-6 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm shadow-lg shadow-teal-500/20 transition-all flex items-center space-x-2 cursor-pointer"
              >
                <span>Next: Line</span>
                <span>→</span>
              </button>
            </div>
          </aside>
        )}

        {/* Step 4: Line ("How should our journey look?") */}
        {currentStep === 'line' && activeRoute && (
          <aside className="panel w-85 h-full overflow-y-auto p-5 flex flex-col space-y-5 text-xs bg-[#0f172a] border-r border-slate-800 text-slate-100">
            <div>
              <span className="text-[11px] font-bold tracking-wider text-teal-400 uppercase">
                STEP 4 · LINE
              </span>
              <h2 className="text-2xl font-extrabold text-slate-100 mt-1 mb-1 tracking-tight">
                How should our journey look?
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Pick the color, thickness, and size of your route line and vehicle.
              </p>
            </div>

            {/* Color Swatches */}
            <div className="space-y-2.5">
              <span className="text-[11px] font-bold text-teal-400 tracking-wider uppercase block">
                LINE COLOR ?
              </span>
              <div className="grid grid-cols-4 gap-2.5">
                {[
                  { color: '#ff4d2e', name: 'Sunset Red' },
                  { color: '#ff9800', name: 'Amber' },
                  { color: '#14b8a6', name: 'Teal' },
                  { color: '#2196f3', name: 'Ocean Blue' },
                  { color: '#ffd600', name: 'Gold' },
                  { color: '#4caf50', name: 'Forest' },
                  { color: '#9c27b0', name: 'Purple' },
                  { color: '#ffffff', name: 'Snow White' },
                ].map((item) => {
                  const isSelected = activeRoute.color === item.color;
                  return (
                    <button
                      key={item.color}
                      type="button"
                      onClick={() => handleUpdateRoute({ ...activeRoute, color: item.color })}
                      className={`p-2.5 rounded-xl border flex flex-col items-center space-y-1.5 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-teal-500/15 border-teal-500 ring-2 ring-teal-500'
                          : 'bg-[#1e293b] border-slate-700 hover:border-teal-400'
                      }`}
                    >
                      <span
                        className="w-6 h-6 rounded-full border border-black/30 shadow-inner"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-[10px] font-medium text-slate-300">{item.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Line Thickness */}
            <div className="space-y-2.5">
              <span className="text-[11px] font-bold text-teal-400 tracking-wider uppercase block">
                LINE THICKNESS ?
              </span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { width: 3, label: 'Thin' },
                  { width: 6, label: 'Normal' },
                  { width: 10, label: 'Bold' },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => handleUpdateRoute({ ...activeRoute, width: opt.width })}
                    className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                      activeRoute.width === opt.width
                        ? 'bg-teal-500/15 border-teal-500 ring-2 ring-teal-500 text-teal-400 font-bold'
                        : 'bg-[#1e293b] border-slate-700 text-slate-200 hover:border-teal-400'
                    }`}
                  >
                    <div
                      className="w-full rounded-full mx-auto mb-2"
                      style={{
                        height: `${opt.width}px`,
                        backgroundColor: activeRoute.color || '#ff4d2e',
                      }}
                    />
                    <span className="text-xs">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Line Pattern */}
            <div className="space-y-2.5">
              <span className="text-[11px] font-bold text-teal-400 tracking-wider uppercase block">
                LINE PATTERN ?
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(['solid', 'dashed', 'dotted'] as const).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => handleUpdateRoute({ ...activeRoute, style })}
                    className={`p-2.5 rounded-xl border text-center capitalize font-semibold transition-all cursor-pointer ${
                      (activeRoute.style || 'solid') === style
                        ? 'bg-teal-500/15 border-teal-500 ring-2 ring-teal-500 text-teal-400'
                        : 'bg-[#1e293b] border-slate-700 text-slate-300 hover:border-teal-400'
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            {/* Vehicle Size */}
            <div className="space-y-2.5">
              <span className="text-[11px] font-bold text-teal-400 tracking-wider uppercase block">
                VEHICLE SIZE ?
              </span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { scale: 0.8, label: 'Small' },
                  { scale: 1.0, label: 'Normal' },
                  { scale: 1.4, label: 'Large' },
                ].map((sz) => (
                  <button
                    key={sz.label}
                    type="button"
                    onClick={() =>
                      handleUpdateRoute({ ...activeRoute, symbolScale: sz.scale })
                    }
                    className={`p-2.5 rounded-xl border text-center font-semibold transition-all cursor-pointer ${
                      (activeRoute.symbolScale || 1.0) === sz.scale
                        ? 'bg-teal-500/15 border-teal-500 ring-2 ring-teal-500 text-teal-400'
                        : 'bg-[#1e293b] border-slate-700 text-slate-300 hover:border-teal-400'
                    }`}
                  >
                    {sz.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 mt-auto border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setCurrentStep('title')}
                className="px-6 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm shadow-lg shadow-teal-500/20 transition-all flex items-center space-x-2 cursor-pointer"
              >
                <span>Next: Title</span>
                <span>→</span>
              </button>
            </div>
          </aside>
        )}

        {/* Step 5: Title ("What is the video called?") */}
        {currentStep === 'title' && (
          <OverlaysEditorPanel
            overlays={activeScene.overlays}
            mode="title"
            onUpdateOverlays={handleUpdateOverlays}
            onNext={() => setCurrentStep('signs')}
          />
        )}

        {/* Step 6: Photos ("Which photos should we show?") */}
        {currentStep === 'signs' && (
          <SignsEditorPanel
            signs={activeScene.signs}
            routePoints={projectRoutes[0]?.points || canonicalRoute?.calculatedGeometry || []}
            defaultCenter={
              projectRoutes[0]?.points?.length
                ? [
                    projectRoutes[0].points[Math.floor(projectRoutes[0].points.length / 2)].lng,
                    projectRoutes[0].points[Math.floor(projectRoutes[0].points.length / 2)].lat,
                  ]
                : [15, 50]
            }
            onAddSign={handleAddSign}
            onUpdateSign={handleUpdateSign}
            onDeleteSign={handleDeleteSign}
            onReorderSigns={handleReorderSigns}
            onNext={() => setCurrentStep('overlays')}
          />
        )}

        {/* Step 7: Info ("What information should appear?") */}
        {currentStep === 'overlays' && (
          <OverlaysEditorPanel
            overlays={activeScene.overlays}
            mode="info"
            onUpdateOverlays={handleUpdateOverlays}
            onNext={() => setCurrentStep('preview')}
          />
        )}

        {/* Step 2: Camera ("How does the camera fly?") */}
        {currentStep === 'camera' && (
          <CameraEditorPanel
            cameraPreset={cameraPreset}
            onSetCameraPreset={handleSetCameraPreset}
            aspectRatio={aspectRatio}
            onSetAspectRatio={handleSetAspectRatio}
            durationPreset={durationPreset}
            duration={duration}
            onSetDuration={handleSetDuration}
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
            onNext={() => setCurrentStep('map')}
          />
        )}
        {/* Step 8: Video ("Create my video!") */}
        {currentStep === 'preview' && (
              <aside className="panel w-85 h-full overflow-y-auto p-5 flex flex-col space-y-5 text-xs bg-[#0f172a] border-r border-slate-800 text-slate-100">
                <div>
                  <span className="text-[11px] font-bold tracking-wider text-teal-400 uppercase">
                    STEP 8 · VIDEO
                  </span>
                  <h2 className="text-2xl font-extrabold text-slate-100 mt-1 mb-1 tracking-tight">
                    Create my video!
                  </h2>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Your journey is ready! Press the button below to record and download your travel video.
                  </p>
                </div>

                {/* Simple Summary Card */}
                <div className="p-4 rounded-xl bg-[#1e293b]/80 border border-slate-700/80 space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Video Format</span>
                    <span className="font-mono font-bold text-teal-400">{aspectRatio}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Video Length</span>
                    <span className="font-mono font-bold text-slate-200">{duration} seconds</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Quality</span>
                    <span className="font-mono font-bold text-slate-200">
                      {project.size}p · {project.fps} fps
                    </span>
                  </div>
                </div>

                {/* Primary Create My Video CTA */}
                <button
                  type="button"
                  disabled={isRendering || projectRoutes.every((r) => r.points.length === 0)}
                  onClick={handleStartRender}
                  className="w-full py-3.5 px-5 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-slate-950 font-extrabold text-sm shadow-xl shadow-teal-500/25 transition-all flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>{isRendering ? 'Creating video...' : 'Create my video!'}</span>
                </button>

                {uiMode === 'advanced' && (
                  <div className="space-y-4 pt-3 border-t border-slate-800">
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
                      </div>
                    )}

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
                      <div className="p-2.5 rounded-lg bg-[#1e293b] border border-slate-700 space-y-1.5">
                        <div className="flex justify-between items-center text-[10px] text-slate-400">
                          <span>Publish Attribution Credit:</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(
                                'Map data © OpenStreetMap contributors, MapLibre'
                              );
                              setCreditCopied(true);
                              setTimeout(() => setCreditCopied(false), 2000);
                            }}
                            className="text-teal-400 font-semibold hover:underline"
                          >
                            {creditCopied ? 'Copied!' : 'Copy credit'}
                          </button>
                        </div>
                        <div className="p-1.5 bg-[#0f172a] rounded font-mono text-[10px] text-slate-300 select-all border border-slate-800">
                          Map data © OpenStreetMap contributors, MapLibre
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </aside>
            )}
    </>
  );

  const activeStepObj = steps.find((s) => s.id === currentStep);

  return (
    <div
      className="editor h-screen w-screen max-w-full flex flex-col bg-[var(--bg)] text-[var(--text)] overflow-hidden"
      data-experience={experience}
      data-tier={tier}
    >
      {/* 1. Top Bar (Adaptive for Mobile / Tablet / Desktop) */}
      {experience === 'mobile' ? (
        <header className="topbar h-12 border-b border-[var(--border)] bg-[var(--panel)] px-2.5 flex items-center justify-between gap-1.5 z-30 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <button
              type="button"
              onClick={onBackToHome}
              aria-label="Back to Projects"
              className="min-w-[36px] min-h-[36px] px-2 rounded-lg bg-[var(--panel-2)] border border-[var(--border)] text-xs font-bold text-[var(--text)] flex items-center justify-center shrink-0"
            >
              ←
            </button>
            <input
              className="project-title bg-transparent border border-transparent focus:border-[var(--accent)] font-bold text-xs text-[var(--text)] px-1.5 py-1 rounded min-w-0 flex-1 truncate"
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

          <div className="flex items-center gap-1 shrink-0">
            {/* Compact Simple / Advanced Toggle */}
            <div className="flex items-center bg-[#0f172a] border border-slate-700 rounded-lg p-0.5 text-[10px]">
              <button
                type="button"
                onClick={() => handleSetUIMode('simple')}
                className={`px-1.5 py-1 rounded font-bold transition-all min-h-[28px] ${
                  uiMode === 'simple'
                    ? 'bg-teal-500 text-slate-950'
                    : 'text-slate-400'
                }`}
              >
                Simple
              </button>
              <button
                type="button"
                onClick={() => handleSetUIMode('advanced')}
                className={`px-1.5 py-1 rounded font-bold transition-all min-h-[28px] ${
                  uiMode === 'advanced'
                    ? 'bg-teal-500 text-slate-950'
                    : 'text-slate-400'
                }`}
              >
                Adv
              </button>
            </div>

            {/* Compact Aspect Ratio */}
            <select
              value={project.aspect}
              aria-label="Video aspect ratio"
              onChange={(e) =>
                onUpdateProject((prev) => ({
                  ...prev,
                  aspect: e.target.value as any,
                  aspectRatio: e.target.value as any,
                  updatedAt: Date.now(),
                }))
              }
              className="bg-[var(--panel-2)] text-[var(--text)] text-[10px] font-bold border border-[var(--border)] rounded-lg px-1.5 py-1 min-h-[32px]"
            >
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
              <option value="1:1">1:1</option>
              <option value="4:5">4:5</option>
              <option value="21:9">21:9</option>
            </select>

            <button
              type="button"
              onClick={() => exportProjectFile(project)}
              aria-label="Export project file"
              title="Export .mapanim"
              className="min-w-[32px] min-h-[32px] p-1.5 rounded-lg bg-[var(--panel-2)] border border-[var(--border)] text-[var(--text)] flex items-center justify-center"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              aria-label="Help and documentation"
              title="Help"
              className="min-w-[32px] min-h-[32px] p-1.5 rounded-lg bg-[var(--panel-2)] border border-[var(--border)] text-[var(--muted)] flex items-center justify-center"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>
      ) : (
        <header className="topbar h-12 border-b border-[var(--border)] bg-[var(--panel)] px-3 xl:px-4 flex items-center justify-between gap-2 z-30 shrink-0">
          <div className="flex items-center space-x-2 min-w-0">
            <button
              type="button"
              className="back text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)] transition-colors flex items-center space-x-1 shrink-0 min-h-[36px] px-1.5"
              onClick={onBackToHome}
            >
              <span>← Projects</span>
            </button>
            <span className="text-[var(--border)]">/</span>
            <input
              className="project-title bg-transparent border-0 font-semibold text-sm text-[var(--text)] focus:ring-1 focus:ring-[var(--accent)] px-2 py-1 rounded w-36 lg:w-48 min-w-0 truncate"
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
          <div className="scene-tabs flex items-center space-x-1 overflow-x-auto no-scrollbar min-w-0">
            {project.scenes.map((s, idx) => (
              <div
                key={s.id}
                className={`flex items-center px-3 py-1 text-xs rounded-t font-medium transition-colors shrink-0 ${
                  idx === activeSceneIndex
                    ? 'border-b-2 border-[var(--accent)] bg-[var(--panel-2)] text-[var(--text)]'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveSceneIndex(idx);
                  }}
                  className="mr-1"
                >
                  Scene {idx + 1}
                </button>
                {project.scenes.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteScene(idx);
                    }}
                    className="ml-1 text-[var(--muted)] hover:text-red-400 font-bold text-xs"
                    title={`Delete Scene ${idx + 1}`}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={handleAddScene}
              className="px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)] font-medium shrink-0"
              title="Add a new scene"
            >
              +
            </button>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {/* Export .mapanim Project File */}
            <button
              type="button"
              onClick={async () => {
                const blob = await projectStorage.exportProjectFile(project.id);
                const url = URL.createObjectURL(blob);
                const safeName = project.name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'project';
                const a = document.createElement('a');
                a.href = url;
                a.download = `${safeName}.mapanim`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              className="text-xs px-2.5 py-1.5 rounded border border-[var(--border)] hover:bg-[var(--panel-2)] text-[var(--text)] flex items-center space-x-1 min-h-[34px]"
              title="Download project as .mapanim file"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export .mapanim</span>
            </button>

            <a
              className="donate-mini text-xs px-2.5 py-1.5 rounded border border-[var(--border)] hover:bg-[var(--panel-2)] text-[var(--text)] min-h-[34px] flex items-center"
              href="https://www.paypal.com/donate/?hosted_button_id=4Z34EYQP2T548"
              target="_blank"
              rel="noopener noreferrer"
            >
              ❤️ <span className="hidden lg:inline ml-1">Donate</span>
            </a>
          </div>
        </header>
      )}

      {/* 2. Step Bar (Desktop & Tablet 8-Step Workflow) */}
      {experience !== 'mobile' && (
        <nav
          aria-label="Editor workflow steps"
          className="stepbar h-11 border-b border-[var(--border)] bg-[var(--panel-2)] px-2.5 xl:px-4 flex items-center justify-between gap-2 z-20 shrink-0"
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {/* Tablet Collapsible Drawer Toggle Button */}
            {experience === 'tablet' && (
              <button
                type="button"
                onClick={() => setTabletDrawerOpen((v) => !v)}
                aria-expanded={tabletDrawerOpen}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-all shrink-0 min-h-[36px] cursor-pointer ${
                  tabletDrawerOpen
                    ? 'bg-teal-500/15 border-teal-500 text-teal-400'
                    : 'bg-[var(--panel)] border-[var(--border)] text-[var(--text)]'
                }`}
                title={tabletDrawerOpen ? 'Collapse editing panel' : 'Open editing panel'}
              >
                {tabletDrawerOpen ? (
                  <PanelLeftClose className="w-4 h-4" />
                ) : (
                  <PanelLeftOpen className="w-4 h-4" />
                )}
                <span className="hidden md:inline">Panel</span>
              </button>
            )}

            <div className="steps flex items-center space-x-1 overflow-x-auto no-scrollbar min-w-0 py-0.5">
              {steps.map((s) => {
                const isActive = currentStep === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setCurrentStep(s.id);
                      if (experience === 'tablet') setTabletDrawerOpen(true);
                    }}
                    className={`step px-2 xl:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1 xl:space-x-1.5 shrink-0 min-h-[34px] ${
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
          </div>

          <div className="stepbar-right flex items-center space-x-2 xl:space-x-3 shrink-0">
            {/* Simple Mode vs Advanced Mode Toggle */}
            <div className="flex items-center bg-[#0f172a] border border-slate-700 rounded-lg p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => handleSetUIMode('simple')}
                className={`px-2 xl:px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  uiMode === 'simple'
                    ? 'bg-teal-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Simple Mode: Easy travel video maker"
              >
                ✨ Simple
              </button>
              <button
                type="button"
                onClick={() => handleSetUIMode('advanced')}
                className={`px-2 xl:px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  uiMode === 'advanced'
                    ? 'bg-teal-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Advanced Mode: Full camera, route, map and rendering controls"
              >
                ⚙️ Advanced
              </button>
            </div>

            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="shortcuts-btn text-xs text-[var(--muted)] hover:text-[var(--text)] flex items-center space-x-1.5 px-2 py-1.5 rounded border border-[var(--border)] min-h-[32px]"
              title="Help & Keyboard shortcuts (?)"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span className="shortcuts-label hidden xl:inline">Help & Shortcuts</span>
            </button>

            <label className="aspect-pick flex items-center space-x-1.5 text-xs text-[var(--muted)] cursor-pointer">
              <span className="shape-icon hidden xl:inline-block w-3.5 h-2.5 border border-current rounded-sm"></span>
              <select
                value={project.aspect}
                aria-label="Aspect ratio"
                onChange={(e) =>
                  onUpdateProject((prev) => ({
                    ...prev,
                    aspect: e.target.value as any,
                    aspectRatio: e.target.value as any,
                    updatedAt: Date.now(),
                  }))
                }
                className="bg-[var(--panel)] text-[var(--text)] text-xs border border-[var(--border)] rounded px-2 py-1 focus:ring-1 focus:ring-[var(--accent)] min-h-[32px]"
              >
                <option value="16:9">16:9 Landscape</option>
                <option value="9:16">9:16 Portrait</option>
                <option value="1:1">1:1 Square</option>
                <option value="4:5">4:5 Instagram</option>
                <option value="21:9">21:9 Cinema</option>
              </select>
            </label>
          </div>
        </nav>
      )}

      {/* 3. Main Workspace (Preserves single MapViewer instance across all breakpoints) */}
      <div
        className={`workspace-wrap flex-1 flex relative overflow-hidden min-h-0 ${
          experience === 'mobile' ? 'flex-col' : 'flex-row'
        }`}
      >
        {/* Slot 0: Active Editor Panel Container (Desktop Sidebar / Tablet Collapsible Drawer / Mobile Bottom Sheet) */}
        <div
          key="panel-slot"
          className={
            experience === 'mobile'
              ? `mobile-sheet-wrap order-2 w-full flex flex-col bg-[#0f172a] overflow-hidden transition-all duration-200 ${
                  mobileSheetSnap === 'map'
                    ? 'h-auto shrink-0'
                    : mobileSheetSnap === 'full'
                    ? 'flex-1 min-h-0'
                    : 'h-[56%] shrink-0'
                }`
              : 'order-1 h-full shrink-0'
          }
        >
          {experience === 'desktop' && activeStepPanel}

          {experience === 'tablet' && (
            <TabletDrawerContainer
              isOpen={tabletDrawerOpen}
              onToggle={() => setTabletDrawerOpen((v) => !v)}
              isOverlayMode={tier === 'tablet-portrait'}
              activeStepLabel={activeStepObj?.label || 'Editor'}
            >
              {activeStepPanel}
            </TabletDrawerContainer>
          )}

          {experience === 'mobile' && (
            <>
              {/* Compact Mobile Playback & Timeline Strip */}
              <div className="h-10 px-2.5 bg-[#16191e] border-t border-slate-800 flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  className="w-7 h-7 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center shrink-0"
                >
                  {isPlaying ? (
                    <Pause className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.1}
                  value={currentTime}
                  onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
                  aria-label="Timeline scrubber"
                  className="flex-1 min-w-0 h-1.5 bg-[var(--panel-2)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
                />
                <span className="text-[10px] font-mono text-slate-400 shrink-0">
                  {currentTime.toFixed(1)}s/{duration}s
                </span>
                {currentStep === 'camera' && (
                  <button
                    type="button"
                    onClick={() => handleAddCameraBlock(cameraMode)}
                    className="px-2 py-1 rounded bg-teal-500 text-slate-950 font-bold text-[10px] shrink-0"
                    title="Add camera keyframe at playhead"
                  >
                    +Cam
                  </button>
                )}
              </div>

              <MobileSheetHeader
                currentStep={currentStep}
                onSelectStep={(s) => {
                  setCurrentStep(s);
                  if (mobileSheetSnap === 'map') setMobileSheetSnap('split');
                }}
                sheetSnap={mobileSheetSnap}
                onSetSheetSnap={setMobileSheetSnap}
              />

              {mobileSheetSnap !== 'map' && (
                <div className="mobile-panel-scroll flex-1 overflow-y-auto overflow-x-hidden">
                  {activeStepPanel}
                </div>
              )}
            </>
          )}
        </div>

        {/* Slot 1: 3D Map Stage (Always mounted in identical DOM position) */}
        <main
          key="stage-slot"
          ref={stageRef}
          className={`stage relative min-w-0 ${
            experience === 'mobile'
              ? mobileSheetSnap === 'full'
                ? 'order-1 h-[22%] min-h-[100px] w-full shrink-0'
                : 'order-1 flex-1 w-full min-h-[150px]'
              : 'order-2 flex-1 h-full'
          }`}
        >
          <MapViewer
            themeId={activeScene.mapThemeId}
            mapLabels={mapLabels}
            labelLang={labelLang || undefined}
            regions={regions}
            terrain={terrain}
            aspect={project.aspect}
            aspectRatio={aspectRatio}
            size={project.size}
            routes={projectRoutes}
            signs={activeScene.signs}
            currentStep={currentStep}
            currentTime={currentTime}
            duration={duration}
            overlays={activeScene.overlays}
            cameraMode={cameraMode}
            cameraPreset={cameraPreset}
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
            destinationPreview={destinationPreview}
            isQuickPreviewActive={quickPreviewState !== 'idle'}
            quickPreviewProgress={quickPreviewProgress}
            quickPreviewRemainingDistance={
              quickPreviewState !== 'idle'
                ? `${remainingPreviewDistanceKm.toFixed(1)} km`
                : undefined
            }
            canonicalRoute={canonicalRoute}
            onUpdateCanonicalRoute={handleUpdateCanonicalRoute}
            onUpdateOverlays={handleUpdateOverlays}
            onUpdateRoute={handleUpdateRoute}
            onAddPoint={handleAddPoint}
            onAddSign={handleAddSign}
            onUpdateSign={handleUpdateSign}
            onMapCameraChange={handleMapCameraChange}
            onStartInteraction={beginTrackingInteraction}
            onMoveInteraction={notifyInteractionMoved}
            onEndInteraction={endTrackingInteraction}
            onCancelInteraction={cancelTrackingInteraction}
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

      {/* 4. Bottom Navigation (Mobile 4-Stage Bar) OR Timeline Scrubber (Tablet / Desktop) */}
      {experience === 'mobile' ? (
        <MobileBottomStageBar
          currentStep={currentStep}
          onSelectStage={handleSelectMobileStage}
        />
      ) : (
        <footer className="timeline h-16 border-t border-[var(--border)] bg-[var(--panel)] px-4 xl:px-6 flex items-center space-x-4 xl:space-x-6 z-20 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (currentStep === 'route') {
                if (quickPreviewState === 'playing') {
                  pauseQuickPreview();
                } else if (quickPreviewState === 'paused') {
                  resumeQuickPreview();
                } else if (quickPreviewState === 'finished') {
                  restartQuickPreview();
                } else {
                  startQuickPreview();
                }
              } else {
                setIsPlaying(!isPlaying);
              }
            }}
            className="w-9 h-9 rounded-full bg-[var(--accent)] hover:bg-[#ff6930] text-[var(--accent-ink)] flex items-center justify-center shadow-md transition-transform active:scale-95 shrink-0"
            title={
              currentStep === 'route'
                ? (quickPreviewState === 'playing' ? 'Pause Route Preview' : 'Play Route Preview')
                : (isPlaying ? 'Pause (Space)' : 'Play (Space)')
            }
          >
            {(currentStep === 'route' ? quickPreviewState === 'playing' : isPlaying) ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          <div className="flex-1 flex flex-col space-y-1 relative min-w-0">
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

          <div className="flex items-center space-x-2 shrink-0">
            <select
              value={duration}
              onChange={(e) => updateActiveScene({ duration: Number(e.target.value) })}
              className="text-xs font-semibold text-[var(--text)] px-2 py-1 bg-[var(--panel-2)] rounded-md border border-[var(--border)] min-h-[32px]"
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
              className="speed-dial text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)] px-3 py-1 bg-[var(--panel-2)] rounded-md border border-[var(--border)] transition-colors min-h-[32px]"
              title="Click to cycle preview speed (0.5x / 1.0x / 2.0x)"
            >
              {playbackSpeed.toFixed(1)}x Speed
            </button>
          </div>
        </footer>
      )}

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
