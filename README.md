# Map Animator

Animated map videos for travel films. Turn your trip into an animated map video right in your browser.

Draw your route or drop in a GPX, KML, KMZ, or IGC file, add signs, photos, overlays, and camera moves, and export high-definition MP4 videos up to 4K at 60 fps, ready for your video editor.

---

## Features

### 1. Route Creation & Multi-Leg Trips
- **Interactive Route Editor**: Click on the map to plot points or drop in GPS files (`.gpx`, `.kml`, `.kmz`, `.igc`).
- **59 Ways of Travelling**: 6 categories covering Road, Foot & Bike, Water & Surf, Aviation, Mountains & Rail, and Military transports.
- **Mid-Route Mode Changes**: Transition seamlessly between different vehicles with the Legs box (`+ New leg`).
- **Route Actions Menu**: *Rename*, *Duplicate as new route*, *Make it smooth* (Chaikin's smoothing algorithm), *Reverse route*, and *Clear route*.
- **Pause Points**: Add pauses from ½s to 20s with map canvas `⏸` indicators.
- **Multi-Route Projects**: Support up to three independent, simultaneous routes.

### 2. Map Themes & 3D Terrain
- **Predefined & Specialty Themes**: Classic, Light, Dark, Satellite (EOX Sentinel-2), Offroad, Treasure, Arctic, 1930s Military army map, Old Atlas, Swiss Topo, and more.
- **3D Relief Elevation**: High-resolution raster DEM 3D mountains and valleys.
- **Multi-Language Controls**: Place names in over 40 languages.

### 3. Signs, Geo-Tagged Photos & Overlays
- **Interactive Map Signs**: Map pins, Campsite tents, Start arches, Finish checkered flags, and Hotels.
- **Side-by-Side Photos**: Simultaneous photos stand side by side on individual leader strings without overlapping.
- **Automated EXIF Placement**: Phone photos with GPS metadata are placed automatically on the map.
- **Telemetry Overlays**: Distance, Speed, Altitude (with support for below-sea-level locations like the Dead Sea at -430m), cumulative Climb & Descent counters, and dynamic elevation profile chart.

### 4. Dynamic Timeline Camera
- **4 Camera Kinds**:
  - `Follow`: Locks onto the moving transport symbol.
  - `Still`: Panoramic stationary framing.
  - `Tripod`: Stands in one spot and turns to follow the traveler as they pass.
  - `Orbit`: Smoothly rotates 360° around the subject.
- **Low-Tilt Flyovers**: Tilt up to 80° for dramatic aerial perspectives.
- **North-Up Rotation**: Continuous bearing control from -180° to +180°.

### 5. Video Preview & Export
- **Video Resolutions**: 480p, 720p, 1080p Full HD, 2K, and 4K Ultra HD.
- **Frame Rates**: 24, 25, 30, 50, and 60 fps.
- **Multi-Scene Video**: Export individual scenes or all scenes in one continuous video.
- **Map Attribution**: Toggleable on-video map credit with ready-to-copy attribution snippet for publishing.

### 6. Privacy & Offline Processing
- **100% Client-Side**: No user account, no cloud servers. All projects and photos stay in local browser IndexedDB.
- **`.mapanim` Files**: Export and import complete projects between computers and browsers.

---

## Keyboard Shortcuts
- `1` – `6`: Switch steps (Route, Map, Signs, Overlays, Camera, Preview)
- `Space`: Play or pause the preview animation
- `⌘ / Ctrl + Z`: Undo last point placed on route
- `Hold ⌘ / Ctrl + drag`: Turn and tilt the 3D map view
- `/`: Search places and geographical features
- `?`: Show Help & Shortcuts guide
- `Esc`: Close open dialogs

---

## Tech Stack
- **Framework**: React 19, TypeScript
- **Styling**: Tailwind CSS
- **Map Engine**: MapLibre GL JS (Vector tiles & 3D Terrain)
- **Video Encoding**: MediaBunny (H.264 MP4 export)
- **Local Storage**: IndexedDB (`idb`)
- **Metadata**: ExifReader, toGeoJSON

---

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run feature verification test suite
node --experimental-strip-types verify_features.ts

# Build for production
npm run build
```

---

## License & Credits
© 2026 Baldinger Works AB. All rights reserved.  
Maps © OpenStreetMap contributors, OpenMapTiles, OpenFreeMap, and EOX IT Services GmbH.
