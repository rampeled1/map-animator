# Changelog

All notable changes to the Map Animator project are documented in this file.

## [0.4.0] - 2026-11-07

### Added
- **Unified 3D WebGL Map Integration (`ThreeMapLayer`)**:
  - Integrated Three.js into MapLibre GL JS using a shared WebGL context and projection matrix synchronization via `CustomLayerInterface`.
  - Realistic 3D PBR vehicle models (Tank, Armored APC, Sedan, Fighter Jet, Quadcopter Drone) with dynamic ground projection and pitch/yaw banking.
  - Extruded dual-ribbon trail geometry (inner vibrant route core with dark outer edge outline).
- **Continuous Snake Path Engine (`snakePathInterpolation.ts`)**:
  - Distance-based arc-length continuous interpolation eliminating stepped and jerky waypoint transitions.
  - Catmull-Rom 3D spline tangent derivative calculation for smooth heading vectors.
- **Road Routing & 0.1 km Curvature-Preserving Densifier (`roadRouter.ts`)**:
  - Failover multi-mirror OSRM routing (`router.project-osrm.org` + `routing.openstreetmap.de`).
  - Road densification algorithm that preserves 100% of natural road vertices (roundabouts, hairpin bends) while subdividing long straight segments at 0.1 km (100 m) intervals.
- **Studio Director Camera Panel UI (`CameraEditorPanel.tsx`)**:
  - Rebuilt camera step UI matching modern cinematic travel map studio workflows.
  - Dedicated sub-panels for **Follow** (Same direction up / Direction of travel, Zoom, Tilt, Rotate), **Still** (Tilt slider, pan to view), **Tripod** (Distance km, Height km), and **Orbit** (Clockwise/Anticlockwise, Zoom, Tilt).
  - Timeline keyframe block slicing with playhead `+` button and `'N'` keyboard shortcut, plus block deletion `×`.
- **Studio-Grade 2-Column Camera Tab (v2.4)**:
  - Added two-column studio layout: Left 60% Cinematic Live Preview with aspect-ratio responsive viewport, resolution badge, and dedicated playback timeline; Right 40% Configuration Panel.
  - Three simplified presets: **Fly Along** (cinematic travel direction chase), **Follow (North Up)**, and **Whole Tour** (automatic route bounding-box overview framing via `map.fitBounds()`).
  - Format selector: **Landscape (16:9)**, **Vertical (9:16 Reels/Shorts)**, and **Square (1:1)** with dynamic container reflow and `map.resize()`.
  - Duration selector with proportional trajectory speed scaling: **Short (20s)**, **Normal (40s)**, **Long (60s)**, and **Custom (5–300s)**.
  - Added `cameraPresetMapper.ts` and comprehensive system design document (`DESIGN.md`).
- **Non-Destructive Undo/Redo Engine**:
  - Global `⌘Z` / `Ctrl+Z` (and `⌘⇧Z` / `Ctrl+Y`) action history stack rewinding full project mutations (routes, points, cameras, signs, settings).


### Added
- **Auto-Routing Point Spacing (0.1 km – 20 km or Auto)**:
  - Added geodesic (Haversine) resampling engine `resampleRouteByDistance` in [`src/utils/roadRouter.ts`](file:///Users/rampeled/developer/map-animator/src/utils/roadRouter.ts).
  - Users can configure point placement intervals from `0.1 km` (100 m) to `20.0 km` when auto-routing (Car, Bike, Walk).
  - One-click `Auto` mode to retain OSRM's native road curve coordinates.
  - Interactive slider and real-time frequency badge inside the **Snap to roads** panel.
- **Interactive Route Canvas Interactions**:
  - Live route point dragging with smooth map pan release.
  - Click on any route line segment to insert an interpolated waypoint in between.
  - Double-click on any waypoint to toggle `sharpCorner` styling.
  - Route waypoint options dialog supporting pause (`0.5s`–`20s`), sharp corners, delete (`del`), and mid-route transport mode changes (`leg:<transport>`).
- **Multi-Leg Route Editing & Dynamic Symbol Switching**:
  - Full leg manager with transport picker, starting point number (`pt#`), and delete button.
  - Dynamic vehicle shape and route line color switching during playback as the playhead passes each leg's starting index.
- **Persistent Photo Signs & Drag-and-Drop Reordering**:
  - Uploaded photos are now stored as persistent Data URLs inside projects, surviving browser storage reloads and export to `.mapanim` files.
  - HTML5 drag-and-drop list reordering with visual drag preview.
  - Support for `whilePassing` proximity visibility trigger mode alongside `always` and `onPassed`.
- **Composite Video Recording Engine**:
  - Offscreen canvas compositor combines MapLibre WebGL canvas with high-resolution SVG route lines, vehicle symbols, signs, photos, and HUD overlays into sharp MP4/WebM exports.
  - Auto-strips editor framing chrome and anchor handles from exported video.
- **Telemetry HUD Upgrades**:
  - Live animated elevation profile chart inside video frame with animated playhead cursor.
  - Units of measurement conversion: Metric (`km`, `m`, `km/h`), Imperial (`mi`, `ft`, `mph`), and Nautical (`nm`, `ft`, `kn`).
  - Overlay aesthetic themes: Dark Glass, Crisp Light, Vintage Parchment, Bold Sport, Outdoor Topo, Minimalist Monochrome.
- **Timeline & UI Controls**:
  - Configurable scene duration selector (`5s`–`120s`).
  - Preview playback speed toggle (`0.5x`, `1.0x`, `2.0x`).
  - Direct keyboard shortcut `?` opening to the **Shortcuts** guide tab.
  - Camera keyframe markers displayed on the timeline scrubber.
- **Multi-Scene GPX Import Fix**:
  - GPX/KML/KMZ files imported into a specific scene index without overwriting other scenes.

## [0.2.0] - 2026-11-01

### Added
- **59 Transport Modes across 6 Categories**:
  - *Road*: Plain line, Car, Car with caravan, Motor home, Bus, Truck, Tuk-tuk, Motorcycle, 4WD, ATV, Snowmobile, Bicycle.
  - *Foot & Bike*: Walking, Running, Alpine skiing, Cross-country skiing, Winter hiker (with snowshoes and bobble hat), Horse.
  - *Water & Surf*: White-water raft (with 6 paddlers and guide), Surfer (carving board with spray), Boat, Sailboat, Catamaran, Trimaran, Car ferry, Kayak, Swimming, Cruise ship, Old sail ship.
  - *Aviation*: Plane, Helicopter, Drone, Hot-air balloon, Paraglider, Hang glider, Paramotor.
  - *Mountains & Rail*: Steam train, Speed train, Gondola, Cable car, Funicular, Chairlift, Cog railway.
  - *Military Transports*: Patrol of three soldiers, Tank, Army truck, Battleship, Aircraft carrier, Submarine, Fighter jet, WWII bomber.

- **Timeline Camera System (4 Camera Kinds)**:
  - *Follow*: Stays locked with the moving symbol.
  - *Still*: Holds one panoramic view.
  - *Tripod*: Stands in one spot and turns smoothly to watch the symbol pass by.
  - *Orbit*: Circles smoothly 360° around the active point of interest.
  - *Low-tilt flyover*: Up to 80° pitch angle.
  - *North-up rotation*: Continuous -180° to +180° bearing rotation control.

- **Signs & Photos**:
  - Multi-style map signs: Map pin, Campsite tent, Start arch, Finish checkered flag, Hotel, and Photo signs.
  - Side-by-side photo layout: Concurrent photos pop up on individual leader strings without overlapping.
  - Sign reordering: Drag-and-drop handles and manual ordering controls.
  - Pause points: Waypoints and signs support customizable pause durations from ½s up to 20s with map canvas `⏸` indicators.
  - Automated GPS Photo Placement: Phone photos with EXIF metadata automatically placed where taken.

- **Telemetry & Overlays**:
  - Dynamic telemetry overlays: Distance, Speed, and Altitude (with negative elevation support for places like the Dead Sea at -430m).
  - Cumulative Climb & Descent counters: Real-time accumulation of meters climbed and descended along the route.
  - Interactive Elevation Profile chart with live tracking marker.
  - Customizable title and subtitle overlays with typography controls.

- **Route Creation & Universal Importer**:
  - Universal route parsing for `.gpx`, `.kml`, `.kmz`, and `.igc` formats.
  - Multi-track auto-signs: Automatic placement of signs at each day's end for multi-day trips.
  - Detail retention: Slider retaining up to 15,000 points on long multi-week journeys.
  - Legs box with mid-route transport changes (`+ New leg`).
  - Active route `⋯` action menu: *Rename*, *Duplicate as new route*, *Make it smooth* (Chaikin's algorithm), *Reverse route*, *Clear route*, and *Show route* (zoom to fit).
  - Simultaneous multi-route support (up to 3 routes).

- **Map Themes & 3D Terrain**:
  - 1930s Military map theme (aged paper, outlined woods, blue rivers, inked roads).
  - Classic, Light, Dark, Satellite (EOX Sentinel-2), Offroad, Treasure, Arctic, Old Atlas, Swiss Topo, Blueprint, Neon Night.
  - 3D relief terrain elevation with MapLibre GL raster-dem.
  - Multi-language label controls (over 40 languages supported).

- **Export & Video Rendering**:
  - Video export resolutions: 480p, 720p, 1080p Full HD, 2K, 4K Ultra HD.
  - Frame rates: 24, 25, 30, 50, and 60 fps.
  - Multi-scene export: *"All scenes in one video"* toggle to render all project scenes continuously into one MP4.
  - Optional map credit watermark: Credit can be omitted in the video with a one-click copyable attribution snippet for publishing.

- **Help, Shortcuts & Guidance**:
  - Keyboard shortcuts modal (`1`–`6` for steps, `Space` for play/pause, `⌘/Ctrl+Z` for undo, `?` for help, `Esc` to close).
  - iPhone HEIC photo conversion guide for macOS and Windows.
  - Interactive FAQ and Changelog modals on home page and editor.

- **Local-Only Privacy**:
  - Client-side storage via browser IndexedDB.
  - `.mapanim` backup export and import for seamless project transfer.

---

## [0.1.0] - 2026-10-15
### Added
- Initial project scaffolding with Vite, React 19, TypeScript, and MapLibre GL.
- Basic route drawing and GPX loading.
- Canvas animation recorder for MP4 video generation via MediaBunny.
