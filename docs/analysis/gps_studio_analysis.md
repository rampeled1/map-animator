# GPS Studio (Reisezoom GPS Studio) — Deep Technical & Architectural Analysis

**Target Application:** [Reisezoom GPS Studio.app](file:///Applications/Reisezoom%20GPS%20Studio.app)  
**Bundle Identifier:** `com.reisezoom.gpsstudio`  
**Installed Version:** `0.9.856`  
**Platform:** macOS Universal (Apple Silicon & Intel)  
**Analysis Date:** November 9, 2026  
**Comparative Target:** [Map Animator](file:///Users/rampeled/developer/map-animator) (`/Users/rampeled/developer/map-animator`)

---

## 1. Executive Summary

**GPS Studio by reisezoom.com** is a desktop suite developed by Marc (Reisezoom, Germany) for travelers, motorcyclists, hikers, and video creators. It handles the complete lifecycle of GPS journey data:
1. **Interactive Travel Video Animation** (GPX to video)
2. **Photo Geotagging & Media Management** (matching DSLR/HEIC photos to GPS routes)
3. **GPX Track Diagnostics & Repair** (healing GPS drift, elevation fixing)
4. **Static & Interactive Map Exporting** (print-ready PNGs and embeddable Leaflet HTML maps)
5. **AI Semantic Photo Search** (local, on-device SigLIP 2 vision model)

---

## 2. System Architecture & Tech Stack

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Reisezoom GPS Studio (Desktop App)                   │
├──────────────────────────────────┬─────────────────────────────────────┤
│  Desktop Shell / Python 3.12     │  Frontend UI (WebKit / pywebview)   │
│  • pywebview native window       │  • MapLibre GL JS (Vector OSM tiles)│
│  • Local HTTP bridge             │  • Mapbox GL JS (Optional Token)    │
│  • CLI & MCP Server (gpsstudio)  │  • Three.js 3D Layer (Trails & Cars)│
├──────────────────────────────────┼─────────────────────────────────────┤
│  Media & Image Engine            │  Headless Video Recorder            │
│  • exiftool (EXIF read/write)    │  • Playwright + Chromium            │
│  • pillow-heif (Apple HEIC/HEIF) │  • imageio-ffmpeg + NumPy           │
│  • rawpy (DSLR Camera RAW)       │  • Frame-by-frame exact FPS render  │
├──────────────────────────────────┴─────────────────────────────────────┤
│  On-Device AI Engine (SigLIP 2 Semantic Image Search)                 │
│  • onnxruntime + tokenizers + Apple CoreML + Vision Framework          │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.1. Host Shell & Execution Container
- **Runtime:** Python 3.12 bundled into a native macOS Mach-O executable via PyInstaller.
- **Windowing:** `pywebview` wrapping native macOS `WKWebView` (WebKit).
- **Inter-Process Communication:** JavaScript-to-Python bridge via `window.pywebview.api`.

### 2.2. Frontend Map & 3D WebGL Layer
- **Dual Vector Engines:**
  - **MapLibre GL JS** (`ui/vendor/maplibre-gl.js`) as the primary open-source vector map engine with free OpenStreetMap/OpenMapTiles styles (`ofm-positron`, `ofm-liberty`).
  - **Mapbox GL JS** (`ui/vendor/mapbox-gl.js`) used optionally if the user inputs their personal Mapbox token.
  - **Leaflet** (`ui/vendor/leaflet/leaflet.js`) used specifically for lightweight HTML blog map exports.
- **Three.js Custom WebGL Layer:**
  - `ui/js/rz-line3d.js`: 3D extruded dynamic ribbon trails over DEM terrain.
  - `ui/js/rz-figur3d.js`: 3D procedural vehicle and character models.
  - `ui/js/rz-punkt3d.js`: 3D animated pinpoints and waypoints.
  - `ui/js/rz-feuer3d.js`: 3D particle animations.

### 2.3. Video Export Engine
- Unlike purely in-browser `MediaRecorder` implementations which can drop frames during heavy GPU load, GPS Studio integrates **Playwright** (`pw-browsers`) and **FFmpeg** (`imageio_ffmpeg`).
- Playwright drives a headless browser instance, stepping frame-by-frame (`requestAnimationFrame`) deterministically.
- Frames are blitted via **NumPy** directly into FFmpeg pipes to encode rock-solid, jitter-free 4K/60fps H.264 / HEVC / WebM videos.

### 2.4. On-Device AI Semantic Photo Search (SigLIP 2)
- Bundles `onnxruntime`, `tokenizers`, and Apple `CoreML`/`Vision` frameworks.
- Runs Google's **SigLIP 2** multi-modal vision-language model locally on Apple Silicon (NPU/GPU).
- Enables natural language search across imported photos (e.g. searching "waterfall", "mountain pass", "sunset") with 100% privacy and zero cloud dependencies.

### 2.5. Model Context Protocol (MCP) & CLI
- Contains a standalone CLI command: `gpsstudio`.
- Native **MCP Server** (`gpsstudio mcp`): Allows AI assistants (such as Antigravity or Claude) to search past tours, inspect tracks, and request background video rendering.

---

## 3. Modular Feature Breakdown

| Module | Directory | Description |
| :--- | :--- | :--- |
| **Animator** | `modules/animator` | Keyframe-based timeline video animator with camera follow/still/orbit, Earth rotation intro, vehicle choices, and telemetry HUD overlays. |
| **Travel Route** | `modules/web-karte` | Multi-stop road journey builder and route snapping engine. |
| **Geotagger** | `modules/geotagger` | Time-based photo-to-GPS synchronization, EXIF writing via `exiftool`, camera heading calculation, and RAW/HEIC support. |
| **GPX Inspector** | `modules/gpxinspect` | Track health diagnostic suite: detects GPS drift, fixes elevation using digital elevation models, joins tracks, and removes outlier waypoints. |
| **Tour Map** | `modules/web-karte` | Static high-resolution PNG map generator with custom typography and legends. |
| **Web Map** | `modules/web-karte` | GDPR-compliant interactive Leaflet maps with track toggles for travel blog embedding. |
| **Data Animator**| `modules/heightanim` | Elevation, speed, heart rate, and cadence telemetry animated video overlays. |
| **Library** | `modules/library` | Local database archiving all past trips and photos with deduplication and map clustering. |

---

## 4. File Storage & Local App Paths on macOS

When running GPS Studio on your Mac, user data is stored in the following locations:

- **Application Bundle:** `/Applications/Reisezoom GPS Studio.app`
- **Application Support & Logs:** `~/Library/Application Support/Reisezoom GPS Studio/`
  - Logs: `~/Library/Application Support/Reisezoom GPS Studio/logs/app.log`
  - Settings: `settings.json`
  - Tour Library / Archive: User-selected folder or `~/Library/Application Support/Reisezoom GPS Studio/library/`
- **Project Files:** `.rzproj` (ZIP archive containing `project.json`, GPX coordinates, media thumbnails, and keyframe state).
- **Default Video Output:** `~/Movies/Reisezoom/` or user-defined export directory.

---

## 5. Architectural Comparison with Map Animator

| Dimension | GPS Studio (`0.9.856`) | Map Animator (`3.0.0`) | Synergy & Takeaways |
| :--- | :--- | :--- | :--- |
| **Runtime** | Desktop Python 3.12 + WebKit shell | Browser-native React 18 + Vite | Map Animator runs zero-install in any browser; GPS Studio has native OS file access. |
| **3D Engine** | MapLibre GL JS + Three.js | MapLibre GL JS + Three.js | Both share the exact same modern 3D map stack. |
| **Routing** | OSRM + Road Snapping (`einrasten.js`) | OSRM Multi-Mirror + 100m Densification | Identical road-following principles. |
| **Video Recording**| Playwright + Headless Chromium + FFmpeg | MediaStream Recording API (Canvas capture) | GPS Studio's Playwright approach provides guaranteed frame pacing for 4K. |
| **Project Format** | `.rzproj` (Zip container with GPX + JSON) | `.mapanim` / LocalStorage state | Packaging `.mapanim` as a zip with assets would enhance portability. |
| **AI Integration** | Local on-device SigLIP 2 + MCP server | Antigravity AI pair programming | Integrating photo semantic search and an MCP server offers great future potential. |
