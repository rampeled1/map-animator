import { ALL_TRANSPORTS, TRANSPORT_CATEGORIES } from './src/constants/transports.ts';
import { ALL_MAP_THEMES } from './src/utils/mapStyleBuilder.ts';
import { calculateTrackStats, generateDayEndSigns, haversineDistance } from './src/utils/gpxParser.ts';
import { resampleRouteByDistance } from './src/utils/roadRouter.ts';
import type { RoutePoint } from './src/types/index.ts';
import { mapPresetToCameraBlocks, computeRouteBounds } from './src/utils/cameraPresetMapper.ts';
import { migrateProjectDefaults } from './src/utils/projectStorage.ts';

console.log('=== MAP ANIMATOR COMPREHENSIVE VERIFICATION ===\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, desc: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${desc}`);
  } else {
    console.error(`  ✗ FAIL: ${desc}`);
    process.exitCode = 1;
  }
}

// 1. Verify Transports (Oct 17, 18, 19, 21, 22, 27 changelogs)
console.log('1. Checking Transport Modes & Categories:');
assert(TRANSPORT_CATEGORIES.length === 6, 'Has 6 distinct categories including Military Transports');
assert(ALL_TRANSPORTS.length >= 40, `Loaded ${ALL_TRANSPORTS.length} transport modes`);

const expectedIds = [
  'raft', 'surf', 'winterhike', 'dualsport', 'chairlift', 'funicular',
  'trooper', 'tank', 'armytruck', 'battleship', 'carrier', 'submarine', 'fighter', 'bomber',
  'sportsplane', 'floatplane', 'sailplane', 'mountainbike', 'pickup', 'minibus', 'vwbus', 'semitruck',
  // Official FAQ transport modes
  'car_caravan', 'motorhome', 'tuktuk', 'xcski', 'steam_train', 'trimaran', 'kayak', 'swimming',
  'cruiseship', 'tallship', 'paraglider', 'hangglider', 'paramotor'
];

expectedIds.forEach((id) => {
  const found = ALL_TRANSPORTS.find((t) => t.id === id);
  assert(!!found, `Transport mode '${id}' is defined with label "${found?.label}"`);
});

const militaryModes = ALL_TRANSPORTS.filter((t) => t.category === 'military');
assert(militaryModes.length === 8, `Military category contains all 8 vehicles (found: ${militaryModes.length})`);

// 2. Verify Map Themes (Oct 21 changelog: Military map)
console.log('\n2. Checking Map Themes:');
assert(ALL_MAP_THEMES.length === 28, `All 28 map themes registered (found ${ALL_MAP_THEMES.length})`);
const militaryTheme = ALL_MAP_THEMES.find((t) => t.id === 'military');
assert(!!militaryTheme, `Military map theme (1930s army map) exists: "${militaryTheme?.name}"`);

// 3. Verify Elevation & Below-Sea-Level Telemetry (Oct 18 changelog: Dead Sea)
console.log('\n3. Checking Elevation Telemetry & Below Sea Level:');
const deadSeaRoute: RoutePoint[] = [
  { lng: 35.5, lat: 31.5, ele: -390 },
  { lng: 35.51, lat: 31.51, ele: -430 }, // Dead Sea lowest point
  { lng: 35.52, lat: 31.52, ele: -410 },
];
const deadSeaStats = calculateTrackStats(deadSeaRoute);
assert(deadSeaStats.minEleM === -430, `Supports negative elevations below sea level: ${deadSeaStats.minEleM} m`);
assert(deadSeaStats.elevationGainM === 20, `Calculated correct elevation gain from negative altitudes: ${deadSeaStats.elevationGainM} m`);
assert(deadSeaStats.elevationLossM === 40, `Calculated correct elevation loss: ${deadSeaStats.elevationLossM} m`);

// 4. Verify Route Reversal (Oct 6 changelog)
console.log('\n4. Checking Route Reversal Logic:');
const originalRoute: RoutePoint[] = [
  { lng: 12.0, lat: 41.0, ele: 100 },
  { lng: 12.1, lat: 41.1, ele: 250 },
  { lng: 12.2, lat: 41.2, ele: 500 },
];
const reversedRoute = [...originalRoute].reverse();
assert(reversedRoute[0].ele === 500 && reversedRoute[2].ele === 100, 'Reversed points array inverts start and end coordinates');
const revStats = calculateTrackStats(reversedRoute);
assert(revStats.elevationLossM === 400, `Reversed route accurately swaps gain/loss (loss: ${revStats.elevationLossM} m)`);

// 5. Verify Day-End Signs for Multi-Day Tracks (Oct 29 changelog)
console.log('\n5. Checking Multi-Track Day-End Signs:');
const mockTracks = [
  {
    name: 'Day 1: Alpine Pass',
    kind: 'track' as const,
    points: [{ lng: 10.0, lat: 46.0 }, { lng: 10.5, lat: 46.5 }],
    stats: { distanceKm: 45 },
    originalCount: 2,
  },
  {
    name: 'Day 2: Valley Run',
    kind: 'track' as const,
    points: [{ lng: 10.5, lat: 46.5 }, { lng: 11.0, lat: 47.0 }],
    stats: { distanceKm: 55 },
    originalCount: 2,
  },
];
const daySigns = generateDayEndSigns(mockTracks);
assert(daySigns.length === 2, `Generated 2 end-of-day signs for 2 tracks (found: ${daySigns.length})`);
assert(daySigns[0].text === 'Day 1: Alpine Pass' && daySigns[0].style === 'camp', `First day ends at campsite sign ('${daySigns[0].style}')`);
assert(daySigns[1].text === 'Day 2: Valley Run' && daySigns[1].style === 'finish', `Last day ends at finish sign ('${daySigns[1].style}')`);

// 6. Verify Distance Metric
console.log('\n6. Checking Haversine Distance Calculation:');
const dist = haversineDistance({ lng: 12.4964, lat: 41.9028 }, { lng: 12.5000, lat: 41.9050 });
assert(dist > 0 && Math.round(dist) === 385, `Accurate geodesic distance: ${Math.round(dist)} meters`);

// 7. Verify Auto-Routing Point Spacing (0.1 to 20 km)
console.log('\n7. Checking Auto-Routing Point Spacing Resampling:');
// Create a straight 10 km route from lat 45.0, lng 10.0 to approx 10 km north
const route10Km = [
  { lng: 10.0, lat: 45.0 },
  { lng: 10.0, lat: 45.09 }, // ~10.0 km
];
const resampled1Km = resampleRouteByDistance(route10Km, 1.0);
assert(resampled1Km.length >= 9 && resampled1Km.length <= 11, `Resampled every 1.0 km produces ~10 points (got ${resampled1Km.length})`);

const resampled5Km = resampleRouteByDistance(route10Km, 5.0);
assert(resampled5Km.length === 2 || resampled5Km.length === 3, `Resampled every 5.0 km produces ~2-3 points (got ${resampled5Km.length})`);

const resampled01Km = resampleRouteByDistance(route10Km, 0.1);
assert(resampled01Km.length >= 90 && resampled01Km.length <= 110, `Resampled every 0.1 km produces ~100 points (got ${resampled01Km.length})`);

const resampled20Km = resampleRouteByDistance(route10Km, 20.0);
assert(resampled20Km.length === 1, `Resampled every 20.0 km on a 10km route keeps destination point (got ${resampled20Km.length})`);

// 8. Verify Camera Presets & Studio Pipeline (v2.4)
console.log('\n8. Checking Camera Presets & Studio Pipeline:');
const samplePts: RoutePoint[] = [
  { lng: 10.0, lat: 45.0, ele: 100 },
  { lng: 10.5, lat: 45.5, ele: 200 },
  { lng: 11.0, lat: 46.0, ele: 300 },
];

const flyBlocks = mapPresetToCameraBlocks('fly_along', samplePts);
assert(flyBlocks.length === 1, 'fly_along generates 1 CameraBlock');
assert(flyBlocks[0].kind === 'follow' && flyBlocks[0].followOrient === 'heading', 'fly_along maps to follow + heading');
assert(flyBlocks[0].pitch === 55 && flyBlocks[0].zoom === 15, 'fly_along defaults to pitch 55° and zoom 15');

const northBlocks = mapPresetToCameraBlocks('follow_north_up', samplePts);
assert(northBlocks[0].kind === 'follow' && northBlocks[0].followOrient === 'north', 'follow_north_up maps to follow + north');
assert(northBlocks[0].pitch === 35 && northBlocks[0].bearing === 0, 'follow_north_up defaults to pitch 35° and bearing 0°');

const tourBlocks = mapPresetToCameraBlocks('whole_tour', samplePts);
assert(tourBlocks[0].kind === 'still', 'whole_tour maps to still mode');
const bounds = computeRouteBounds(samplePts);
assert(bounds !== null && bounds.minLng === 10.0 && bounds.maxLng === 11.0, 'Route bounds correctly computed for whole_tour');

const migrated = migrateProjectDefaults({});
assert(migrated.cameraPreset === 'fly_along', 'Migrated project defaults to fly_along preset');
assert(migrated.aspectRatio === '16:9', 'Migrated project defaults to 16:9 aspect ratio');
assert(migrated.durationPreset === 40, 'Migrated project defaults to 40s duration preset');

console.log(`\n========================================`);
console.log(`RESULTS: ${passedTests} / ${totalTests} tests passed successfully.`);
console.log(`========================================\n`);
