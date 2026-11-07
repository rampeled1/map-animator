export type StepId = 'route' | 'camera' | 'map' | 'line' | 'title' | 'signs' | 'overlays' | 'preview';
export type UIMode = 'simple' | 'advanced';

export type TransportType =
  | 'motorcycle'
  | 'dualsport'
  | 'car'
  | 'car_caravan'
  | 'motorhome'
  | 'tuktuk'
  | 'pickup'
  | 'minibus'
  | 'vwbus'
  | 'car_trailer'
  | 'semitruck'
  | 'bicycle'
  | 'mountainbike'
  | 'walking'
  | 'hiker'
  | 'winterhike'
  | 'running'
  | 'swimming'
  | '4wd'
  | 'atv'
  | 'snowmobile'
  | 'train'
  | 'steam_train'
  | 'speed_train'
  | 'funicular'
  | 'cablecar'
  | 'chairlift'
  | 'ferry'
  | 'boat'
  | 'sailboat'
  | 'catamaran'
  | 'trimaran'
  | 'kayak'
  | 'cruiseship'
  | 'tallship'
  | 'raft'
  | 'surf'
  | 'plane'
  | 'sportsplane'
  | 'floatplane'
  | 'sailplane'
  | 'helicopter'
  | 'drone'
  | 'balloon'
  | 'paraglider'
  | 'hangglider'
  | 'paramotor'
  | 'bus'
  | 'ski'
  | 'xcski'
  | 'horse'
  // Military transports (Oct 21 changelog)
  | 'trooper'
  | 'tank'
  | 'armytruck'
  | 'battleship'
  | 'carrier'
  | 'submarine'
  | 'fighter'
  | 'bomber';

export interface RoutePoint {
  lng: number;
  lat: number;
  ele?: number; // Elevation in meters (supports negative values, e.g. Dead Sea -430m)
  time?: number; // Epoch timestamp in ms
  pauseSec?: number; // Pause duration in seconds (0.5 - 20s)
  sharpCorner?: boolean;
}

export interface RouteLeg {
  id: string;
  fromPointIndex: number;
  transportType: TransportType;
  use3dSymbol: boolean;
  color?: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
}

export interface RouteStats {
  distanceKm: number;
  elevationGainM?: number;
  elevationLossM?: number;
  minEleM?: number;
  maxEleM?: number;
  durationSec?: number;
  avgSpeedKmh?: number;
}

export interface Route {
  id: string;
  name: string;
  color: string;
  width: number;
  style: 'solid' | 'dashed' | 'dotted';
  transportType?: TransportType;
  hideLine?: boolean; // Oct 8: No line, just the symbol
  symbolScale?: number; // Oct 8: Symbols bigger or smaller (0.5 to 2.0)
  startOffsetSec?: number; // Oct 15: Drag route bar on timeline to start later
  legs: RouteLeg[];
  points: RoutePoint[];
  stats?: RouteStats;
}

export interface MapSign {
  id: string;
  lng: number;
  lat: number;
  style: 'pin' | 'text' | 'photo' | 'roadSign' | 'camp' | 'start' | 'finish' | 'hotel';
  text: string;
  photoUrl?: string;
  triggerMode: 'always' | 'onPassed' | 'whilePassing';
  pauseSec?: number; // up to 20s
  size: number;
}

export interface CameraBlock {
  id: string;
  tRatio: number; // 0.0 to 1.0 along the animation
  kind: 'still' | 'follow' | 'tripod' | 'orbit';
  center: [number, number];
  zoom: number;
  pitch: number; // 0 - 80 degrees (Oct 20 changelog: tilt up to 80 deg)
  bearing: number; // 0 - 360 degrees
  followOrient?: 'north' | 'heading';
  rotateOffset?: number; // -180 to +180 deg
  distanceKm?: number; // 0.1 to 20 km for tripod
  heightKm?: number; // 0.1 to 10 km for tripod
  orbitDirection?: 'clockwise' | 'anticlockwise'; // for orbit
  easing?: 'linear' | 'easeInOutQuad' | 'smooth';
}

export interface OverlayConfig {
  title?: string;
  subtitle?: string;
  showDistance: boolean;
  showAltitude: boolean;
  showSpeed: boolean;
  showClimbDescent?: boolean; // Oct 21 changelog: Climb & descent counters
  showElevationProfile: boolean;
  showCompass: boolean;
  unit: 'metric' | 'imperial' | 'nautical';
  theme: 'dark' | 'light' | 'vintage' | 'minimal' | 'bold' | 'outdoor';
}

export interface SceneCamera {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
  rotateOffset?: number; // Oct 17: Rotate slider (-180 to +180 deg) for follow camera
}

export interface Scene {
  id: string;
  name: string;
  duration: number; // in seconds
  holdStartSec: number;
  holdEndSec: number;
  mapThemeId: string;
  mapLabels?: boolean;
  labelLang?: string;
  regions?: boolean;
  terrain?: boolean;
  camera?: SceneCamera;
  routes: Route[];
  signs: MapSign[];
  cameraBlocks: CameraBlock[];
  overlays: OverlayConfig;
}

// New simplified preset type — maps to existing CameraMode under the hood
export type CameraMode = 'follow' | 'still' | 'tripod' | 'orbit';
export type CameraModePreset = 'fly_along' | 'follow_north_up' | 'whole_tour';
export type AspectRatioOption = '16:9' | '9:16' | '1:1';
export type DurationPreset = 20 | 40 | 60 | 'custom';

// Thin overlay — extend MapProject instead of replacing it
export interface CameraSettings {
  preset: CameraModePreset;
  // Advanced overrides (optional — only written when user changes them)
  zoom?: number;
  pitch?: number;
  bearing?: number;
  smoothness?: number; // 0–1, default 0.5
}

export interface MapProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  uiMode?: UIMode; // 'simple' (default) or 'advanced'
  aspect: '16:9' | '9:16' | '1:1' | '4:5' | '4:3' | '21:9';
  aspectRatio?: AspectRatioOption; // NEW — studio camera format
  duration?: number; // Overall project duration in seconds
  cameraPreset?: CameraModePreset; // NEW — defaults to 'fly_along'
  cameraSettings?: CameraSettings; // NEW — optional advanced overrides
  durationPreset?: DurationPreset; // NEW — tracks which button is active
  size: 480 | 720 | 1080 | 1440 | 2160;
  fps: 24 | 25 | 30 | 50 | 60; // Oct 18: 50 fps export
  includeMapCredit?: boolean; // Oct 30: Toggle map credit in video
  scenes: Scene[];
}

export interface MapTheme {
  id: string;
  name: string;
  note: string;
  swatch: [string, string, string];
  dark?: boolean;
  credit: string;
}
