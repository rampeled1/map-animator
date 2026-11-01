# Changelog

All notable changes to the Map Animator project are documented in this file.

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
