import type { MapTheme } from '../types/index.ts';

export interface ShadeConfig {
  shadow: string;
  highlight: string;
  accent: string;
  exaggeration: number;
}

export interface CustomThemePaint {
  land: string;
  water: string;
  waterway?: string;
  coast?: { color: string; width: number; opacity?: number };
  ice?: string;
  park?: string;
  wood?: string;
  areaEdge?: { color: string; width: number };
  building?: string;
  minor: string;
  major: string;
  motorway: string;
  casing?: string;
  minorOpacity?: number;
  roadFade?: number;
  rail?: string;
  glow?: boolean;
  blur?: number;
  border: string;
  borderDash?: number[];
  text: string;
  countryText?: string;
  halo: string;
  haloWidth?: number;
  waterText: string;
  font?: string;
  caps?: boolean;
  shade?: ShadeConfig;
  alwaysShade?: boolean;
  depths?: {
    bands: [number, string][];
    line: string;
  };
}

export interface ExtraThemeDef {
  id: string;
  name: string;
  note: string;
  swatch: [string, string, string];
  dark?: boolean;
  paint: CustomThemePaint;
}

const makeShade = (shadow: string, highlight: string, exaggeration = 0.45): ShadeConfig => ({
  shadow,
  highlight,
  accent: shadow,
  exaggeration,
});

const defaultShade = makeShade('#4a4a4a', '#ffffff', 0.4);

function blendHex(hexA: string, hexB: string, t: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return (
    '#' +
    [0, 1, 2]
      .map((i) =>
        Math.round(ch(hexA, i) + (ch(hexB, i) - ch(hexA, i)) * t)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  );
}

export const EXTRA_THEMES: ExtraThemeDef[] = [
  {
    id: 'atlas',
    name: 'Old Atlas',
    note: 'Engraved coasts and red roads, like a 19th-century atlas',
    swatch: ['#f3e9cf', '#bcd3d6', '#b5492f'],
    paint: {
      land: '#f3e9cf',
      water: '#c4d8d8',
      waterway: '#6f9aa0',
      coast: { color: '#4f7f88', width: 1 },
      park: '#e2e4c2',
      wood: '#d3d9ad',
      minor: '#c9a27a',
      major: '#b5492f',
      motorway: '#9c2f22',
      minorOpacity: 0.7,
      rail: '#3b3b3b',
      border: '#a2583c',
      borderDash: [4, 2, 1, 2],
      text: '#2f2a22',
      halo: '#f3e9cf',
      waterText: '#3d6870',
      font: 'Italic',
      caps: true,
      shade: makeShade('#5a4630', '#fff8e6', 0.4),
      alwaysShade: true,
    },
  },
  {
    id: 'nautical',
    name: 'Sea Chart',
    note: 'Buff land, sea in depth bands and navy coastlines',
    swatch: ['#f1e6b8', '#d6ebf2', '#8c7a45'],
    paint: {
      land: '#f1e6b8',
      water: '#d6ebf2',
      waterway: '#7fb0c8',
      coast: { color: '#1c3d5a', width: 1.1 },
      wood: '#e3d79f',
      park: '#e8dda9',
      building: '#d9c98f',
      minor: '#b8a46a',
      major: '#8c7a45',
      motorway: '#6b5a2e',
      minorOpacity: 0.6,
      border: '#c0392b',
      borderDash: [6, 3],
      text: '#1c3d5a',
      halo: '#f1e6b8',
      waterText: '#1c3d5a',
      font: 'Italic',
      caps: true,
      shade: makeShade('#6b5f3a', '#fffbea', 0.4),
      depths: {
        bands: [
          [-6000, '#eaf4f7'],
          [-1000, '#dcedf3'],
          [-200, '#c9e3ee'],
          [-50, '#b3d6e6'],
          [-20, '#98c6dc'],
        ],
        line: '#86afc4',
      },
    },
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    note: 'White lines on drafting blue, like a technical drawing',
    swatch: ['#1d4f91', '#163d73', '#e6efff'],
    dark: true,
    paint: {
      land: '#1d4f91',
      water: '#163d73',
      waterway: '#6f9bd6',
      coast: { color: '#cfe0ff', width: 0.9, opacity: 0.8 },
      wood: '#21569b',
      park: '#21569b',
      building: '#2a63a8',
      minor: '#9fbde6',
      major: '#e6efff',
      motorway: '#ffffff',
      minorOpacity: 0.55,
      rail: '#cfe0ff',
      border: '#cfe0ff',
      borderDash: [3, 2],
      text: '#f2f6ff',
      halo: '#1d4f91',
      waterText: '#9fbde6',
      caps: true,
      shade: makeShade('#0d2c55', '#4a7cc0', 0.35),
    },
  },
  {
    id: 'inkwash',
    name: 'Ink Wash',
    note: 'Brush-black ink on paper, with a red seal for countries',
    swatch: ['#f4f1ea', '#d9d9d6', '#2a2a28'],
    paint: {
      land: '#f4f1ea',
      water: '#dcdcd8',
      waterway: '#8a8a86',
      coast: { color: '#2b2b2b', width: 1.3, opacity: 0.85 },
      wood: '#e4e2da',
      park: '#e9e7df',
      minor: '#9a9a96',
      major: '#3a3a38',
      motorway: '#1a1a1a',
      minorOpacity: 0.6,
      blur: 0.6,
      border: '#b23a2e',
      borderDash: [5, 3],
      text: '#1f1f1f',
      countryText: '#b23a2e',
      halo: '#f4f1ea',
      waterText: '#55554f',
      caps: true,
      shade: makeShade('#3a3a36', '#ffffff', 0.35),
    },
  },
  {
    id: 'neon',
    name: 'Neon Night',
    note: 'Glowing cyan and pink roads on black',
    swatch: ['#0b0b1a', '#05050d', '#ff2fd6'],
    dark: true,
    paint: {
      land: '#0b0b1a',
      water: '#05050d',
      waterway: '#007f99',
      coast: { color: '#00e5ff', width: 1.1 },
      wood: '#0d0d20',
      building: '#15152c',
      minor: '#3b2a66',
      major: '#ff2fd6',
      motorway: '#00e5ff',
      glow: true,
      border: '#7a5cff',
      borderDash: [3, 2],
      text: '#e9e5ff',
      halo: '#0b0b1a',
      waterText: '#00a9c0',
      shade: makeShade('#000000', '#2a2a4a', 0.4),
    },
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    note: 'Purple dusk with hot pink roads and a gold motorway',
    swatch: ['#2a1046', '#13072a', '#ff6ad5'],
    dark: true,
    paint: {
      land: '#2a1046',
      water: '#13072a',
      waterway: '#94d0ff',
      coast: { color: '#ff6ad5', width: 1.2 },
      wood: '#30134f',
      park: '#30134f',
      building: '#3a1a5c',
      minor: '#5b2a86',
      major: '#ff6ad5',
      motorway: '#ffd319',
      glow: true,
      border: '#94d0ff',
      borderDash: [3, 2],
      text: '#ffe9ff',
      halo: '#2a1046',
      waterText: '#94d0ff',
      caps: true,
      shade: makeShade('#12051f', '#6a3a9a', 0.4),
    },
  },
  {
    id: 'pastel',
    name: 'Pastel',
    note: 'Soft pink land, mint water and lilac roads',
    swatch: ['#fbeff2', '#cdeee8', '#c5b3e6'],
    paint: {
      land: '#fbeff2',
      water: '#cdeee8',
      waterway: '#9fd8ce',
      park: '#e2f2d9',
      wood: '#d8edd0',
      building: '#f3dde4',
      minor: '#e9c8d8',
      major: '#c5b3e6',
      motorway: '#a79bd9',
      border: '#c9a3c0',
      borderDash: [3, 2],
      text: '#6d5a7a',
      halo: '#fbeff2',
      waterText: '#5a9c94',
      shade: makeShade('#a0849a', '#ffffff', 0.3),
    },
  },
  {
    id: 'desert',
    name: 'Desert',
    note: 'Sand and terracotta with turquoise water',
    swatch: ['#ecd3a5', '#3fb3c4', '#a6512a'],
    paint: {
      land: '#ecd3a5',
      water: '#3fb3c4',
      waterway: '#3fb3c4',
      coast: { color: '#e9f6f2', width: 1.4, opacity: 0.85 },
      wood: '#cfc48c',
      park: '#d9cb93',
      minor: '#c79568',
      major: '#a6512a',
      motorway: '#8a3a1c',
      border: '#8a5a3a',
      borderDash: [4, 2],
      text: '#5a3418',
      halo: '#ecd3a5',
      waterText: '#0f5f6b',
      caps: true,
      shade: makeShade('#6b3f1c', '#fff4dc', 0.5),
      alwaysShade: true,
    },
  },
  {
    id: 'arctic',
    name: 'Arctic',
    note: 'Ice white and steel blue, crisp and cold',
    swatch: ['#f4f8fb', '#b9d4e6', '#5d7a93'],
    paint: {
      land: '#f4f8fb',
      water: '#b9d4e6',
      waterway: '#8db4cf',
      coast: { color: '#7fa6c2', width: 0.9 },
      ice: '#ffffff',
      wood: '#e2ebf0',
      park: '#e6eef3',
      minor: '#c4d3de',
      major: '#8aa3b8',
      motorway: '#5d7a93',
      border: '#9fb6c8',
      borderDash: [3, 2],
      text: '#3c5568',
      halo: '#f4f8fb',
      waterText: '#4f7590',
      caps: true,
      shade: { shadow: '#5a7690', highlight: '#ffffff', accent: '#7f9ab2', exaggeration: 0.5 },
      alwaysShade: true,
    },
  },
  {
    id: 'forest',
    name: 'Ranger',
    note: 'Deep forest green with cream roads, like a park map',
    swatch: ['#2f4a33', '#1f3a44', '#e9dfc4'],
    dark: true,
    paint: {
      land: '#2f4a33',
      water: '#1f3a44',
      waterway: '#4f7f8a',
      coast: { color: '#a8c4a0', width: 0.7, opacity: 0.7 },
      wood: '#28412c',
      park: '#355238',
      building: '#3b553e',
      minor: '#8a9b74',
      major: '#e9dfc4',
      motorway: '#f2c46d',
      minorOpacity: 0.7,
      border: '#c9b98a',
      borderDash: [4, 2],
      text: '#efe8d2',
      halo: '#2f4a33',
      waterText: '#8fb3b8',
      shade: makeShade('#132016', '#6f8f6a', 0.5),
      alwaysShade: true,
    },
  },
  {
    id: 'autumn',
    name: 'Autumn',
    note: 'Ochre fields, rust woods and burgundy roads',
    swatch: ['#f3dfc0', '#9fb7b0', '#8e2c1f'],
    paint: {
      land: '#f3dfc0',
      water: '#9fb7b0',
      waterway: '#7d9a92',
      coast: { color: '#6f8c84', width: 0.8 },
      wood: '#dca46a',
      park: '#e6bb80',
      minor: '#c98b5a',
      major: '#8e2c1f',
      motorway: '#6b1e14',
      border: '#8e5a3a',
      borderDash: [4, 2],
      text: '#4a2a16',
      halo: '#f3dfc0',
      waterText: '#3f5f58',
      shade: makeShade('#5a3418', '#fff1dc', 0.4),
    },
  },
  {
    id: 'topo',
    name: 'Swiss Topo',
    note: 'Classic topographic map: blue water, green woods, strong relief',
    swatch: ['#fbfaf5', '#a8d4f0', '#e8742f'],
    paint: {
      land: '#fbfaf5',
      water: '#a8d4f0',
      waterway: '#3a8fd0',
      coast: { color: '#3a8fd0', width: 0.9 },
      wood: '#cfe5b4',
      park: '#e0eecd',
      building: '#9c9c9c',
      minor: '#ffffff',
      major: '#f6d25d',
      motorway: '#e8742f',
      casing: '#6b5a3a',
      rail: '#333333',
      border: '#a0458c',
      borderDash: [5, 2, 1, 2],
      text: '#222222',
      halo: '#fbfaf5',
      waterText: '#1b6fb0',
      shade: { shadow: '#474a52', highlight: '#ffffff', accent: '#5f6370', exaggeration: 0.6 },
      alwaysShade: true,
    },
  },
  {
    id: 'roadatlas',
    name: 'Road Atlas',
    note: 'A 1970s road atlas: mustard land and orange highways',
    swatch: ['#f6e8b8', '#8fc1d6', '#d2572a'],
    paint: {
      land: '#f6e8b8',
      water: '#8fc1d6',
      waterway: '#6aa6c0',
      wood: '#d9d48a',
      park: '#d1d69a',
      minor: '#e0a24a',
      major: '#d2572a',
      motorway: '#7a2f1a',
      casing: '#5b3a1a',
      border: '#7a5a8a',
      borderDash: [4, 2],
      text: '#3a2a1a',
      halo: '#f6e8b8',
      waterText: '#2f5f74',
      font: 'Bold',
      caps: true,
      shade: makeShade('#6b5a2a', '#fffbe6', 0.35),
    },
  },
  {
    id: 'field',
    name: 'Field Map',
    note: 'Olive and khaki with stencil-like capitals',
    swatch: ['#c9c19a', '#7f9a8f', '#4a3f24'],
    paint: {
      land: '#c9c19a',
      water: '#7f9a8f',
      waterway: '#5f7a70',
      coast: { color: '#3e4a3a', width: 0.9 },
      wood: '#a3a876',
      park: '#b4b183',
      building: '#8a8566',
      minor: '#7a6f4a',
      major: '#4a3f24',
      motorway: '#2e2a1c',
      border: '#3e3a2a',
      borderDash: [6, 2],
      text: '#2b2a1f',
      halo: '#c9c19a',
      waterText: '#2f4740',
      font: 'Bold',
      caps: true,
      shade: makeShade('#3a3520', '#ece4bc', 0.5),
      alwaysShade: true,
    },
  },
  {
    id: 'military',
    name: 'Military',
    note: 'A 1930s army map: aged paper, olive woods, grey-blue water, inked roads and red-brown relief',
    swatch: ['#ebe0bd', '#a3bfc6', '#2a2620'],
    paint: {
      land: '#ebe0bd',
      water: '#a3bfc6',
      waterway: '#3f7aa3',
      coast: { color: '#3a6b8f', width: 0.9 },
      wood: '#b8cb8a',
      park: '#c9d49c',
      areaEdge: { color: '#4f7a3c', width: 1 },
      building: '#2a2620',
      minor: '#3a342c',
      major: '#ebe0bd',
      motorway: '#d9ab62',
      casing: '#1f1c18',
      minorOpacity: 0.9,
      roadFade: 0,
      rail: '#1f1c18',
      border: '#a3472f',
      borderDash: [5, 2, 1, 2],
      text: '#221f1a',
      halo: '#ebe0bd',
      waterText: '#2f5d82',
      blur: 0.3,
      shade: makeShade('#8c4a32', '#fff4dc', 0.32),
      alwaysShade: true,
    },
  },
  {
    id: 'mars',
    name: 'Red Planet',
    note: 'Rust-red land and dark seas, like a map of Mars',
    swatch: ['#7a2e1c', '#2a0f0a', '#f2b38a'],
    dark: true,
    paint: {
      land: '#7a2e1c',
      water: '#2a0f0a',
      waterway: '#4a1a10',
      coast: { color: '#e8a07a', width: 0.8, opacity: 0.7 },
      wood: '#6e2818',
      park: '#86361f',
      building: '#8b3a24',
      minor: '#b4583a',
      major: '#f2b38a',
      motorway: '#ffd7b0',
      border: '#f2b38a',
      borderDash: [3, 2],
      text: '#ffe6d6',
      halo: '#5a1f12',
      waterText: '#d98a66',
      caps: true,
      shade: makeShade('#2a0c06', '#d9785a', 0.6),
      alwaysShade: true,
    },
  },
  {
    id: 'ocean',
    name: 'Deep Ocean',
    note: 'Navy sea and pale coasts, for crossings',
    swatch: ['#2f5d63', '#0a2a43', '#bfe6e6'],
    dark: true,
    paint: {
      land: '#2f5d63',
      water: '#0a2a43',
      waterway: '#1d4a66',
      coast: { color: '#8fd3e0', width: 1 },
      wood: '#2a565c',
      park: '#336268',
      building: '#3a6b70',
      minor: '#5b8a8f',
      major: '#bfe6e6',
      motorway: '#eaffff',
      border: '#8fd3e0',
      borderDash: [3, 2],
      text: '#e6fbff',
      halo: '#0a2a43',
      waterText: '#6fb6d0',
      font: 'Italic',
      shade: makeShade('#0d2a2e', '#7fb0b4', 0.45),
    },
  },
  {
    id: 'popart',
    name: 'Pop Art',
    note: 'Bold yellow, cyan and pink with black outlines',
    swatch: ['#ffe14d', '#36c5f0', '#ff3d8b'],
    paint: {
      land: '#ffe14d',
      water: '#36c5f0',
      waterway: '#111111',
      coast: { color: '#111111', width: 2.2 },
      wood: '#b6e05a',
      park: '#c4ea6a',
      building: '#ff9fc6',
      minor: '#ffffff',
      major: '#ff3d8b',
      motorway: '#ff3d8b',
      casing: '#111111',
      border: '#111111',
      borderDash: [3, 2],
      text: '#111111',
      halo: '#ffffff',
      haloWidth: 2,
      waterText: '#0b3b5a',
      font: 'Bold',
      caps: true,
      shade: makeShade('#1a1a1a', '#ffffff', 0.4),
    },
  },
  {
    id: 'chalk',
    name: 'Chalkboard',
    note: 'Soft chalk lines on a green board',
    swatch: ['#2e3b33', '#25302a', '#e8efe6'],
    dark: true,
    paint: {
      land: '#2e3b33',
      water: '#25302a',
      waterway: '#9fb8c8',
      coast: { color: '#e8efe6', width: 1.2, opacity: 0.85 },
      wood: '#2b372f',
      park: '#2b372f',
      minor: '#a9b5ac',
      major: '#e8efe6',
      motorway: '#f5e9a8',
      minorOpacity: 0.5,
      blur: 1,
      border: '#e8efe6',
      borderDash: [3, 2],
      text: '#f2f5ef',
      halo: '#2e3b33',
      waterText: '#bcd6e8',
      font: 'Italic',
      shade: makeShade('#141b16', '#5a6b5f', 0.4),
    },
  },
  {
    id: 'newsprint',
    name: 'Newsprint',
    note: 'Black ink on grey paper',
    swatch: ['#e9e6df', '#cfcac0', '#2a2a2a'],
    paint: {
      land: '#e9e6df',
      water: '#d3cec4',
      waterway: '#6a6a6a',
      coast: { color: '#2a2a2a', width: 0.9 },
      wood: '#dcd8cf',
      park: '#dedad1',
      building: '#d3cfc6',
      minor: '#9a968e',
      major: '#2a2a2a',
      motorway: '#111111',
      border: '#2a2a2a',
      borderDash: [4, 2],
      text: '#111111',
      halo: '#e9e6df',
      waterText: '#3a3a3a',
      font: 'Bold',
      caps: true,
      shade: makeShade('#2a2a2a', '#ffffff', 0.35),
    },
  },
  {
    id: 'golden',
    name: 'Golden Hour',
    note: 'Peach land and lavender water in warm evening light',
    swatch: ['#fbe3c6', '#b9b4e0', '#e07a3f'],
    paint: {
      land: '#fbe3c6',
      water: '#b9b4e0',
      waterway: '#9c95d4',
      coast: { color: '#8c83c9', width: 0.7 },
      wood: '#f2c99a',
      park: '#f6d3a6',
      minor: '#f0b27a',
      major: '#e07a3f',
      motorway: '#c4532a',
      border: '#c48a6a',
      borderDash: [4, 2],
      text: '#6a3a2a',
      halo: '#fbe3c6',
      waterText: '#5b52a0',
      shade: makeShade('#7a3f2a', '#fff3e0', 0.4),
      alwaysShade: true,
    },
  },
];

export const PRIMARY_THEMES: MapTheme[] = [
  {
    id: 'liberty',
    credit: '© OpenStreetMap contributors · OpenMapTiles · OpenFreeMap',
    name: 'Classic',
    note: 'Colourful, with terrain shading',
    swatch: ['#f2efe9', '#9fc4e7', '#f7c873'],
  },
  {
    id: 'offroad',
    credit: '© OpenStreetMap contributors · OpenMapTiles · OpenFreeMap · Terrain: AWS Terrain Tiles',
    name: 'Offroad',
    note: 'Tracks, gravel roads and trails stand out, with shaded hills',
    swatch: ['#efeadf', '#c9dbb4', '#7a4a1e'],
  },
  {
    id: 'positron',
    credit: '© OpenStreetMap contributors · OpenMapTiles · OpenFreeMap',
    name: 'Light',
    note: 'Soft grey, lets the line stand out',
    swatch: ['#f5f5f3', '#d4dadc', '#ffffff'],
  },
  {
    id: 'dark',
    dark: true,
    credit: '© OpenStreetMap contributors · OpenMapTiles · OpenFreeMap',
    name: 'Dark',
    note: 'Night look for bright lines',
    swatch: ['#1e1e1e', '#0c0c0c', '#3a3a3a'],
  },
  {
    id: 'fiord',
    dark: true,
    credit: '© OpenStreetMap contributors · OpenMapTiles · OpenFreeMap',
    name: 'Fiord',
    note: 'Deep blue, calm and moody',
    swatch: ['#45516e', '#38435c', '#6b7a99'],
  },
  {
    id: 'satellite',
    dark: true,
    credit:
      'EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016) · © OpenStreetMap contributors',
    name: 'Satellite',
    note: 'Cloud-free imagery. Best from region zoom out',
    swatch: ['#6b7b4f', '#1d3b5c', '#a89a78'],
  },
  {
    id: 'vintage',
    credit: '© OpenStreetMap contributors · OpenMapTiles · OpenFreeMap · Terrain: AWS Terrain Tiles',
    name: 'Treasure',
    note: 'Old parchment map with ink lines and shaded hills',
    swatch: ['#e3cc9a', '#aab496', '#5a3b1f'],
  },
];

const BASE_CREDIT = '© OpenStreetMap contributors · OpenMapTiles · OpenFreeMap';

export const MORE_THEMES_LIST: MapTheme[] = EXTRA_THEMES.map((e) => ({
  id: e.id,
  name: e.name,
  note: e.note,
  swatch: e.swatch,
  dark: e.dark,
  credit:
    e.paint.alwaysShade || e.paint.depths
      ? `${BASE_CREDIT} · Terrain: AWS Terrain Tiles`
      : BASE_CREDIT,
}));

export const ALL_MAP_THEMES: MapTheme[] = [...PRIMARY_THEMES, ...MORE_THEMES_LIST];

export const getThemeInfo = (id: string): MapTheme | undefined =>
  ALL_MAP_THEMES.find((t) => t.id === id);

const findExtraTheme = (id: string): ExtraThemeDef | undefined =>
  EXTRA_THEMES.find((t) => t.id === id);

export const LABEL_LANGUAGES = [
  { id: 'en', name: 'English' },
  { id: 'sq', name: 'Albanian' },
  { id: 'eu', name: 'Basque' },
  { id: 'bg', name: 'Bulgarian' },
  { id: 'ca', name: 'Catalan' },
  { id: 'zh', name: 'Chinese' },
  { id: 'hr', name: 'Croatian' },
  { id: 'cs', name: 'Czech' },
  { id: 'da', name: 'Danish' },
  { id: 'nl', name: 'Dutch' },
  { id: 'et', name: 'Estonian' },
  { id: 'fi', name: 'Finnish' },
  { id: 'fr', name: 'French' },
  { id: 'de', name: 'German' },
  { id: 'el', name: 'Greek' },
  { id: 'he', name: 'Hebrew' },
  { id: 'hu', name: 'Hungarian' },
  { id: 'is', name: 'Icelandic' },
  { id: 'id', name: 'Indonesian' },
  { id: 'ga', name: 'Irish' },
  { id: 'it', name: 'Italian' },
  { id: 'ja', name: 'Japanese' },
  { id: 'ko', name: 'Korean' },
  { id: 'la', name: 'Latin' },
  { id: 'lv', name: 'Latvian' },
  { id: 'lt', name: 'Lithuanian' },
  { id: 'no', name: 'Norwegian' },
  { id: 'pl', name: 'Polish' },
  { id: 'pt', name: 'Portuguese' },
  { id: 'ro', name: 'Romanian' },
  { id: 'ru', name: 'Russian' },
  { id: 'sr', name: 'Serbian' },
  { id: 'sk', name: 'Slovak' },
  { id: 'sl', name: 'Slovenian' },
  { id: 'es', name: 'Spanish' },
  { id: 'sv', name: 'Swedish' },
  { id: 'tr', name: 'Turkish' },
  { id: 'uk', name: 'Ukrainian' },
  { id: 'vi', name: 'Vietnamese' },
  { id: 'cy', name: 'Welsh' },
];

const OPENFREEMAP_BASE = 'https://tiles.openfreemap.org/styles/';
const styleCache = new Map<string, Promise<any>>();

function fetchBaseStyle(styleName: string): Promise<any> {
  let cached = styleCache.get(styleName);
  if (!cached) {
    cached = fetch(OPENFREEMAP_BASE + styleName).then((res) => {
      if (!res.ok) throw new Error(`Map style ${styleName} failed to load (${res.status})`);
      return res.json();
    });
    cached.catch(() => styleCache.delete(styleName));
    styleCache.set(styleName, cached);
  }
  return cached;
}

const EOX_SATELLITE_SOURCE = {
  type: 'raster',
  tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg'],
  tileSize: 256,
  maxzoom: 15,
  attribution:
    '<a href="https://cloudless.eox.at" target="_blank">EOxCloudless</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)',
};

export const AWS_TERRARIUM_SOURCE = {
  type: 'raster-dem',
  tiles: ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'],
  encoding: 'terrarium',
  tileSize: 256,
  maxzoom: 15,
  attribution: '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank">Terrain Tiles</a>',
};

const DEPTHS_DEM_SOURCE = {
  type: 'raster-dem',
  tiles: ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'],
  encoding: 'terrarium',
  tileSize: 256,
  maxzoom: 9,
};

const CORE_SHADES: Record<string, ShadeConfig> = {
  liberty: { shadow: '#3d3423', highlight: '#fffdf5', accent: '#6b5b3e', exaggeration: 0.45 },
  offroad: { shadow: '#43392c', highlight: '#fffdf5', accent: '#6b5b3e', exaggeration: 0.42 },
  positron: { shadow: '#6b6b6b', highlight: '#ffffff', accent: '#8a8a8a', exaggeration: 0.35 },
  dark: { shadow: '#000000', highlight: '#4a4a4a', accent: '#000000', exaggeration: 0.55 },
  fiord: { shadow: '#1b2233', highlight: '#7d8cab', accent: '#2a3348', exaggeration: 0.5 },
  vintage: { shadow: '#4a2f16', highlight: '#f6e7c4', accent: '#6b4a2b', exaggeration: 0.5 },
};

const zoomOpacity = (mult = 1) => [
  'interpolate',
  ['linear'],
  ['zoom'],
  4,
  0.3 * mult,
  8,
  0.45 * mult,
  12,
  0.65 * mult,
  15,
  0.8 * mult,
];

const zoomWidth = (z4: number, z10: number, z16: number) => [
  'interpolate',
  ['linear'],
  ['zoom'],
  4,
  z4,
  10,
  z10,
  16,
  z16,
];

function buildDepthsLayer(depths: { bands: [number, string][]; line: string }) {
  const expr: any[] = ['interpolate', ['linear'], ['elevation']];
  depths.bands.forEach(([elev, color], idx) => {
    if (!idx) {
      expr.push(elev, color);
      return;
    }
    const step = Math.max(0.8, Math.abs(elev) * 0.012);
    expr.push(
      elev - step - 0.3,
      depths.bands[idx - 1][1],
      elev - step,
      depths.line,
      elev - 0.3,
      depths.line,
      elev,
      color
    );
  });
  const lastColor = depths.bands[depths.bands.length - 1][1];
  expr.push(-8.3, lastColor, -8, 'rgba(0,0,0,0)');
  return {
    id: 'depths',
    type: 'color-relief',
    source: 'depths',
    paint: { 'color-relief-color': expr },
  };
}

function buildCustomPaintedStyle(baseStyle: any, t: CustomThemePaint) {
  const layers: any[] = [];
  const hide = (layer: any) =>
    layers.push({ ...layer, layout: { ...layer.layout, visibility: 'none' } });
  const blurProp = t.blur ? { 'line-blur': t.blur } : {};
  const addGlow = (layer: any, color: string, width: any) => {
    if (t.glow) {
      layers.push({
        ...layer,
        id: layer.id + '_glow',
        paint: {
          'line-color': color,
          'line-width': width,
          'line-blur': ['interpolate', ['linear'], ['zoom'], 4, 3, 10, 6, 16, 10],
          'line-opacity': zoomOpacity(0.5),
        },
      });
    }
  };
  const addLine = (layer: any, color: string, extraPaint: Record<string, any> = {}) => {
    const { 'line-dasharray': _dash, ...restPaint } = layer.paint ?? {};
    layers.push({
      ...layer,
      paint: {
        ...restPaint,
        'line-color': color,
        'line-opacity': 1,
        ...blurProp,
        ...extraPaint,
      },
    });
  };
  const addFill = (layer: any, color: string, opacity = 1) =>
    layers.push({
      ...layer,
      paint: { 'fill-color': color, 'fill-opacity': opacity, 'fill-antialias': true },
    });
  const fadeRoad = (color: string) => blendHex(color, t.land, t.roadFade ?? 0.35);
  const addAreaEdge = (layer: any) => {
    if (!t.areaEdge) return;
    const { color, width } = t.areaEdge;
    layers.push({
      ...layer,
      id: layer.id + '_edge',
      type: 'line',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': color, 'line-width': width, ...blurProp },
    });
  };
  const fontFor = (fallback: string) => [`Noto Sans ${t.font ?? fallback}`];

  for (const d of baseStyle.layers) {
    const srcLayer = 'source-layer' in d ? d['source-layer'] : undefined;
    const id: string = d.id;
    if (d.type === 'background') {
      layers.push({ ...d, paint: { 'background-color': t.land } });
    } else if (id === 'park') {
      addFill(d, t.park ?? t.land, 0.8);
      addAreaEdge(d);
    } else if (id === 'water') {
      addFill(d, t.water);
      if (t.depths) layers.push(buildDepthsLayer(t.depths));
      if (t.coast) {
        const coast = t.coast;
        const coastLine = { ...d, type: 'line', layout: { 'line-join': 'round' } };
        addGlow(coastLine, coast.color, zoomWidth(2, 4, 8));
        const opacity = coast.opacity ?? 1;
        layers.push({
          ...coastLine,
          id: 'coast',
          paint: {
            'line-color': coast.color,
            'line-width': coast.width,
            'line-opacity': opacity,
            ...blurProp,
          },
        });
      }
    } else if (/ice_shelf|glacier/.test(id)) {
      addFill(d, t.ice ?? t.land, 0.8);
    } else if (id === 'landuse_residential') {
      hide(d);
    } else if (id === 'landcover_wood') {
      addFill(d, t.wood ?? t.land, 0.8);
      addAreaEdge(d);
    } else if (id === 'waterway') {
      addLine(d, t.waterway ?? t.water);
    } else if (id === 'building') {
      if (t.building) {
        layers.push({
          ...d,
          paint: {
            'fill-color': t.building,
            'fill-outline-color': t.building,
            'fill-antialias': true,
          },
        });
      } else {
        hide(d);
      }
    } else if (srcLayer === 'aeroway' || /pier/.test(id)) {
      hide(d);
    } else if (id === 'tunnel_motorway_casing') {
      hide(d);
    } else if (id === 'tunnel_motorway_inner') {
      addLine(d, fadeRoad(t.motorway), { 'line-opacity': zoomOpacity(0.6) });
    } else if (id === 'highway_path') {
      addLine(d, fadeRoad(t.minor), {
        'line-dasharray': [2, 2],
        'line-opacity': zoomOpacity((t.minorOpacity ?? 0.85) * 0.8),
      });
    } else if (id === 'highway_minor') {
      addLine(d, fadeRoad(t.minor), { 'line-opacity': zoomOpacity(t.minorOpacity ?? 0.85) });
    } else if (/_casing$/.test(id)) {
      if (t.casing) {
        addLine(d, fadeRoad(t.casing), { 'line-opacity': zoomOpacity() });
      } else {
        hide(d);
      }
    } else if (/^highway_major/.test(id)) {
      addGlow(d, t.major, zoomWidth(1.5, 4, 10));
      addLine(d, fadeRoad(t.major), { 'line-opacity': zoomOpacity() });
    } else if (/^highway_motorway/.test(id)) {
      addGlow(d, t.motorway, zoomWidth(2, 6, 14));
      addLine(d, fadeRoad(t.motorway), { 'line-opacity': zoomOpacity() });
    } else if (/^railway/.test(id)) {
      if (t.rail) {
        if (/dashline/.test(id)) {
          layers.push({ ...d, paint: { ...d.paint, 'line-color': t.land } });
        } else {
          addLine(d, t.rail);
        }
      } else {
        hide(d);
      }
    } else if (srcLayer === 'boundary') {
      addLine(
        d,
        t.border,
        t.borderDash
          ? { 'line-dasharray': t.borderDash, 'line-opacity': 0.85 }
          : { 'line-opacity': 0.85 }
      );
    } else if (d.type === 'symbol' && (srcLayer === 'water_name' || srcLayer === 'waterway')) {
      layers.push({
        ...d,
        layout: { ...d.layout, 'text-font': ['Noto Sans Italic'] },
        paint: {
          'text-color': t.waterText,
          'text-halo-color': t.water,
          'text-halo-width': 1,
        },
      });
    } else if (d.type === 'symbol' && srcLayer === 'place') {
      const isCountry = id.startsWith('label_country');
      const isCountryOrState = isCountry || id === 'label_state';
      const weight =
        isCountry || id === 'label_city_capital'
          ? 'Bold'
          : id === 'label_other' || id === 'label_state'
          ? 'Italic'
          : 'Regular';
      layers.push({
        ...d,
        layout: {
          ...d.layout,
          'text-font': fontFor(weight),
          ...(t.caps && isCountryOrState
            ? { 'text-transform': 'uppercase', 'text-letter-spacing': 0.18 }
            : {}),
        },
        paint: {
          'text-color': (isCountry && t.countryText) || t.text,
          'text-halo-color': t.halo,
          'text-halo-width': t.haloWidth ?? 1.3,
          'text-halo-blur': 0.4,
        },
      });
    } else if (d.type === 'symbol') {
      hide(d);
    } else {
      layers.push(d);
    }
  }

  return {
    ...baseStyle,
    layers,
    sources: {
      ...baseStyle.sources,
      ...(t.depths ? { depths: DEPTHS_DEM_SOURCE } : {}),
    },
  };
}

function buildVintageStyle(positronStyle: any) {
  const hide = (layer: any) => ({
    ...layer,
    layout: { ...layer.layout, visibility: 'none' },
  });
  const inkMajor = '#5a3b1f';
  const inkMinor = '#8a6a45';
  const parchment = '#e6d1a3';
  const vintageWater = '#aab496';

  const layers = positronStyle.layers.map((layer: any) => {
    const srcLayer = 'source-layer' in layer ? layer['source-layer'] : undefined;
    const id: string = layer.id;
    if (layer.type === 'background') {
      return { ...layer, paint: { 'background-color': parchment } };
    }
    if (layer.type === 'fill') {
      if (srcLayer === 'water') {
        return { ...layer, paint: { 'fill-color': vintageWater, 'fill-antialias': true } };
      }
      if (srcLayer === 'landcover' || srcLayer === 'landuse' || srcLayer === 'park') {
        return { ...layer, paint: { 'fill-color': '#d6bf8c', 'fill-opacity': 0.45 } };
      }
      return hide(layer);
    }
    if (layer.type === 'line') {
      if (srcLayer === 'waterway') {
        return { ...layer, paint: { ...layer.paint, 'line-color': '#8e9a7f' } };
      }
      if (srcLayer === 'boundary') {
        return {
          ...layer,
          paint: {
            ...layer.paint,
            'line-color': '#7a4f2a',
            'line-dasharray': [4, 2],
            'line-opacity': 0.8,
          },
        };
      }
      if (srcLayer === 'transportation') {
        if (/casing|tunnel|rail|pier|path|aeroway/.test(id)) return hide(layer);
        const isMinor = /minor|service|track|subtle/.test(id);
        return {
          ...layer,
          paint: {
            ...layer.paint,
            'line-color': isMinor ? inkMinor : inkMajor,
            'line-opacity': zoomOpacity(isMinor ? 0.6 : 1),
          },
        };
      }
      return hide(layer);
    }
    if (layer.type === 'symbol') {
      if (srcLayer === 'place') {
        return {
          ...layer,
          layout: { ...layer.layout, 'text-font': ['Noto Sans Italic'] },
          paint: {
            'text-color': inkMajor,
            'text-halo-color': parchment,
            'text-halo-width': 1.4,
            'text-halo-blur': 0.5,
          },
        };
      }
      if (srcLayer === 'water_name' || srcLayer === 'waterway') {
        return {
          ...layer,
          layout: { ...layer.layout, 'text-font': ['Noto Sans Italic'] },
          paint: {
            'text-color': '#56644f',
            'text-halo-color': vintageWater,
            'text-halo-width': 1,
          },
        };
      }
      return hide(layer);
    }
    return layer;
  });

  return { ...positronStyle, layers };
}

const OFFROAD_OVERRIDES: Record<string, Record<string, any>> = {
  background: { 'background-color': '#eee8db' },
  landcover_wood: { 'fill-color': '#8fbf6f', 'fill-opacity': 0.55 },
  landcover_grass: { 'fill-color': '#b3d492', 'fill-opacity': 0.45 },
  park: { 'fill-color': '#cae0b1', 'fill-opacity': 0.6 },
  water: { 'fill-color': '#86b4e6' },
  waterway_river: { 'line-color': '#6a9fd8' },
  waterway_other: { 'line-color': '#6a9fd8' },
};

const isUnpaved = ['==', ['get', 'surface'], 'unpaved'];
const offroadCasingColor = ['case', isUnpaved, '#6b4a26', '#4f473c'];
const offroadInnerColor = ['case', isUnpaved, '#f0d49c', '#ffffff'];
const expZoom = (...stops: number[]) => ['interpolate', ['exponential', 1.3], ['zoom'], ...stops];
const classFilter = (existing: any, cls: string) => ['all', existing ?? true, ['==', ['get', 'class'], cls]];

function buildOffroadStyle(libertyStyle: any) {
  const layers: any[] = [];
  const makeRoad = (base: any, isCasing: boolean, minzoom: number, casingStops: number[], innerStops: number[]) => ({
    ...base,
    minzoom,
    paint: isCasing
      ? { 'line-color': offroadCasingColor, 'line-width': expZoom(...casingStops) }
      : { 'line-color': offroadInnerColor, 'line-width': expZoom(...innerStops) },
  });

  for (const n of libertyStyle.layers) {
    const srcLayer = 'source-layer' in n ? n['source-layer'] : undefined;
    if (OFFROAD_OVERRIDES[n.id]) {
      layers.push({ ...n, paint: { ...n.paint, ...OFFROAD_OVERRIDES[n.id] } });
      continue;
    }
    if (n.type !== 'line' || srcLayer !== 'transportation' || /rail/.test(n.id)) {
      layers.push(n);
      continue;
    }
    const isCasing = n.id.endsWith('_casing');
    const { minzoom: _mz, ...rest } = n;
    const defaultRoad = {
      ...n,
      paint: { ...n.paint, 'line-color': isCasing ? '#a39a8b' : '#f7f4ee' },
    };

    if (/_minor|_street/.test(n.id)) {
      layers.push(
        makeRoad(rest, isCasing, 12, [12, 2.8, 13, 3.8, 14, 5.4, 20, 22], [12, 1.4, 13, 2.1, 14, 3.6, 20, 18])
      );
    } else if (/_secondary_tertiary/.test(n.id)) {
      layers.push(
        {
          ...n,
          filter: classFilter(n.filter, 'secondary'),
          paint: { ...n.paint, 'line-color': isCasing ? '#8a8174' : '#fbf8f2' },
        },
        makeRoad(
          {
            ...rest,
            id: n.id.replace('secondary_tertiary', 'tertiary'),
            filter: classFilter(n.filter, 'tertiary'),
          },
          isCasing,
          8,
          [8, 1.1, 10, 2.2, 11, 3, 12, 3.6, 14, 6, 20, 24],
          [8, 0.4, 10, 1, 11, 1.5, 12, 1.9, 14, 4, 20, 19]
        )
      );
    } else if (/_service_track/.test(n.id)) {
      layers.push(
        makeRoad(
          { ...rest, filter: classFilter(n.filter, 'service') },
          isCasing,
          12,
          [12, 1.8, 14, 3.6, 20, 12],
          [12, 0.8, 14, 2.2, 20, 8]
        )
      );
      if (!isCasing) {
        const trackFilter = classFilter(n.filter, 'track');
        layers.push(
          {
            ...rest,
            id: n.id.replace('service_track', 'track_halo'),
            minzoom: 12,
            filter: trackFilter,
            paint: {
              'line-color': '#fbf8f1',
              'line-opacity': 0.9,
              'line-width': expZoom(12, 3, 14, 5.5, 20, 13),
            },
          },
          {
            ...rest,
            id: n.id.replace('service_track', 'track'),
            minzoom: 12,
            filter: trackFilter,
            paint: {
              'line-color': '#6b3a10',
              'line-dasharray': [3, 1.1],
              'line-width': expZoom(12, 1.7, 14, 2.6, 20, 6.5),
            },
          }
        );
      }
    } else if (/_path_pedestrian/.test(n.id)) {
      if (isCasing) continue;
      layers.push(
        {
          ...rest,
          id: n.id + '_halo',
          minzoom: 12,
          paint: {
            'line-color': '#fbf8f1',
            'line-opacity': 0.9,
            'line-width': expZoom(12, 2.6, 14, 4, 20, 9.5),
          },
        },
        {
          ...rest,
          minzoom: 12,
          paint: {
            'line-color': '#c0291d',
            'line-dasharray': [2, 1.3],
            'line-width': expZoom(12, 1.3, 14, 1.9, 20, 4.8),
          },
        }
      );
    } else {
      layers.push(defaultRoad);
    }
  }

  return { ...libertyStyle, layers };
}

async function buildSatelliteStyle(showLabels: boolean) {
  const liberty = await fetchBaseStyle('liberty');
  const isLabel = (l: any) =>
    l.type === 'symbol' && /^(label_|water_name|waterway_line_label)/.test(l.id);
  const isBoundary = (l: any) => l.type === 'line' && l.id.startsWith('boundary');
  const overlayLayers = showLabels
    ? liberty.layers.filter((l: any) => isBoundary(l) || isLabel(l))
    : liberty.layers.filter(isBoundary);

  return {
    ...liberty,
    sources: {
      imagery: EOX_SATELLITE_SOURCE,
      openmaptiles: liberty.sources.openmaptiles,
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#1d2b3a' } },
      { id: 'imagery', type: 'raster', source: 'imagery' },
      ...overlayLayers,
    ],
  };
}

async function loadThemeStyle(themeId: string, showLabels: boolean) {
  const extra = findExtraTheme(themeId);
  if (extra) {
    const positron = await fetchBaseStyle('positron');
    const built = buildCustomPaintedStyle(positron, extra.paint);
    return showLabels
      ? built
      : { ...built, layers: built.layers.filter((l: any) => l.type !== 'symbol') };
  }
  if (themeId === 'satellite') {
    return buildSatelliteStyle(showLabels);
  }
  if (themeId === 'vintage') {
    const positron = await fetchBaseStyle('positron');
    const built = buildVintageStyle(positron);
    return showLabels
      ? built
      : { ...built, layers: built.layers.filter((l: any) => l.type !== 'symbol') };
  }
  const base =
    themeId === 'offroad'
      ? buildOffroadStyle(await fetchBaseStyle('liberty'))
      : await fetchBaseStyle(themeId);
  return showLabels
    ? base
    : { ...base, layers: base.layers.filter((l: any) => l.type !== 'symbol') };
}

function getRegionsColors(themeId: string) {
  if (themeId === 'vintage') {
    return { line: 'rgba(122,79,42,0.7)', text: '#6b4a2b', halo: '#e6d1a3' };
  }
  const extra = findExtraTheme(themeId);
  if (extra) {
    return { line: extra.paint.border, text: extra.paint.text, halo: extra.paint.halo };
  }
  return getThemeInfo(themeId)?.dark
    ? {
        line: 'rgba(235,240,248,0.5)',
        text: 'rgba(235,240,248,0.85)',
        halo: 'rgba(10,14,20,0.8)',
      }
    : {
        line: 'rgba(96,88,120,0.55)',
        text: '#5f5a70',
        halo: 'rgba(255,255,255,0.85)',
      };
}

function injectRegions(style: any, themeId: string) {
  if (!style.sources?.openmaptiles) return style;
  const colors = getRegionsColors(themeId);
  const isStateSymbol = (l: any) =>
    l.type === 'symbol' &&
    'source-layer' in l &&
    l['source-layer'] === 'place' &&
    JSON.stringify(l.filter ?? '').includes('"state"');

  const borderLayer = {
    id: 'regions-border',
    type: 'line',
    source: 'openmaptiles',
    'source-layer': 'boundary',
    minzoom: 3,
    filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': colors.line,
      'line-dasharray': [3, 2],
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 6, 1.1, 10, 1.6],
    },
  };

  const samplePlace =
    style.layers.find(isStateSymbol) ??
    style.layers.find((l: any) => l.type === 'symbol' && l['source-layer'] === 'place');
  const sampleLayout = samplePlace?.layout ?? {};

  const labelLayer = {
    id: 'regions-label',
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': 'place',
    minzoom: 3,
    filter: ['in', ['get', 'class'], ['literal', ['state', 'province']]],
    layout: {
      'text-field': sampleLayout['text-field'] ?? [
        'coalesce',
        ['get', 'name:latin'],
        ['get', 'name'],
      ],
      'text-font': sampleLayout['text-font'] ?? ['Noto Sans Regular'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 3, 9, 6, 12, 8, 14],
      'text-transform': 'uppercase',
      'text-letter-spacing': 0.15,
      'text-max-width': 8,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': colors.text,
      'text-halo-color': colors.halo,
      'text-halo-width': 1.2,
    },
  };

  const filtered = style.layers.filter((l: any) => !isStateSymbol(l));
  const firstSymbolIdx = filtered.findIndex((l: any) => l.type === 'symbol');
  filtered.splice(firstSymbolIdx < 0 ? filtered.length : firstSymbolIdx, 0, borderLayer);
  const firstPlaceIdx = filtered.findIndex(
    (l: any) => l.type === 'symbol' && l['source-layer'] === 'place'
  );
  filtered.splice(firstPlaceIdx < 0 ? filtered.length : firstPlaceIdx, 0, labelLayer);

  return { ...style, layers: filtered };
}

function applyLabelLanguage(style: any, lang: string) {
  const fieldExpr = ['coalesce', ['get', `name:${lang}`], ['get', 'name:latin'], ['get', 'name']];
  const layers = style.layers.map((l: any) => {
    if (
      l.type !== 'symbol' ||
      !l.layout?.['text-field'] ||
      !/"name/.test(JSON.stringify(l.layout['text-field']))
    ) {
      return l;
    }
    return {
      ...l,
      layout: {
        ...l.layout,
        'text-field': fieldExpr,
      },
    };
  });
  return { ...style, layers };
}

const HILLSHADE_BEFORE_REGEX =
  /^(building|tunnel|road|highway|aeroway|bridge|railway|transportation|boundary|label|place|poi)/;

export interface BuildMapStyleOptions {
  mapStyle: string;
  mapLabels?: boolean;
  terrain?: boolean;
  regions?: boolean;
  labelLang?: string;
}

/**
 * Exact port of `qr()` from mapanimator.baldinger.se:
 * Fetches the base OpenFreeMap vector style, rewrites all layers for the selected theme,
 * applies language/region overrides, and injects AWS Terrarium hillshading + 3D terrain.
 */
export async function buildMapStyle({
  mapStyle,
  mapLabels = true,
  terrain = false,
  regions = false,
  labelLang,
}: BuildMapStyleOptions): Promise<any> {
  const rawStyle = await loadThemeStyle(mapStyle, mapLabels);
  const withRegions = regions ? injectRegions(rawStyle, mapStyle) : rawStyle;
  const withLang = labelLang ? applyLabelLanguage(withRegions, labelLang) : withRegions;

  const isDark = getThemeInfo(mapStyle)?.dark;
  const sky = isDark
    ? {
        'sky-color': '#0b1018',
        'horizon-color': '#1e2733',
        'sky-horizon-blend': 0.6,
        'horizon-fog-blend': 0.5,
        'fog-color': '#141a22',
        'fog-ground-blend': 0.6,
      }
    : {
        'sky-color': '#8fb8e8',
        'horizon-color': '#dfe9f3',
        'sky-horizon-blend': 0.6,
        'horizon-fog-blend': 0.5,
        'fog-color': '#e8eef4',
        'fog-ground-blend': 0.6,
      };

  const extraPaint = findExtraTheme(mapStyle)?.paint;
  const shadeConfig: ShadeConfig | undefined = extraPaint
    ? terrain || extraPaint.alwaysShade
      ? extraPaint.shade ?? defaultShade
      : undefined
    : terrain || mapStyle === 'vintage' || mapStyle === 'offroad' || mapStyle === 'liberty'
    ? CORE_SHADES[mapStyle]
    : undefined;

  if (!terrain && !shadeConfig) {
    return { ...withLang, sky };
  }

  const layers = withLang.layers.slice();
  if (shadeConfig) {
    const hillshadeLayer = {
      id: 'hillshade-3d',
      type: 'hillshade',
      source: 'hillshade',
      paint: {
        'hillshade-shadow-color': shadeConfig.shadow,
        'hillshade-highlight-color': shadeConfig.highlight,
        'hillshade-accent-color': shadeConfig.accent,
        'hillshade-exaggeration': shadeConfig.exaggeration,
        'hillshade-illumination-anchor': 'map',
      },
    };
    const waterIdx = layers.findIndex(
      (l: any) => l.type === 'fill' && 'source-layer' in l && l['source-layer'] === 'water'
    );
    const insertIdx =
      waterIdx >= 0
        ? waterIdx
        : layers.findIndex(
            (l: any) => l.type === 'symbol' || HILLSHADE_BEFORE_REGEX.test(l.id)
          );
    layers.splice(insertIdx < 0 ? layers.length : insertIdx, 0, hillshadeLayer);
  }

  return {
    ...withLang,
    sky,
    layers,
    sources: {
      ...withLang.sources,
      ...(terrain ? { terrain: AWS_TERRARIUM_SOURCE } : {}),
      ...(shadeConfig ? { hillshade: AWS_TERRARIUM_SOURCE } : {}),
    },
    ...(terrain ? { terrain: { source: 'terrain', exaggeration: 1.4 } } : {}),
  };
}
