# Phase 1 Clean-Start & Storage Initialization Plan – Map Animator

**Repository:** `map-animator`  
**Generated:** 2026-11-11T12:45:00+02:00  
**Baseline References:** Architecture 3.1 (`Map_Animator_Architecture_3.1.md`), Map Animator v4.0.0 Specification, Approved Clean-Start & Simplicity Directives.

---

## 1. Guiding Principles & Product Decisions

1. **Completely Ignore Old Projects:**
   - Zero legacy migration, zero legacy conversion, zero legacy import compatibility.
   - On application startup, the old Map Animator data key (`mapanimator_projects_v1`) is removed from `localStorage`.
   - The application starts with an empty project list. New projects will be created using Schema v2.
2. **Simple, Reliable Local-First Storage:**
   - Reliable save, load, and list operations using IndexedDB (`idb`).
   - Standard `.mapanim` portable export/import in plain JSON.
   - Basic project backup snapshots and exact restoration.
   - Asset isolation preventing ID collisions across projects.
   - Atomic multi-store transactions so failed saves, imports, or restores never leave partial data.
3. **Avoid Overengineering:**
   - Rely strictly on standard modern browser capabilities (native IndexedDB and native `CompressionStream('gzip')` / `DecompressionStream('gzip')`).
   - No fallback codecs, polyfills, or additional dependencies. If either `CompressionStream('gzip')` or `DecompressionStream('gzip')` is unsupported, display a clear compatibility notice.
   - Zero unnecessary dependencies.

---

## 2. Storage Architecture (`map_animator_db`)

### 2.1 Database Specification
- **Database Name:** `map_animator_db`
- **Database Version:** `1`
- **Library:** `idb` (v8.0.2, already installed in `package.json`).

### 2.2 Object Stores

| Store Name | Key Path | Index | Purpose |
| :--- | :--- | :--- | :--- |
| **`projects`** | `id` (string) | `by_updatedAt` (`updatedAt`) | Stores Schema v2 `MapProject` documents. |
| **`assets`** | `id` (string) | `by_projectId` (`projectId`) | Stores binary media blobs (photo markers, custom icons) decoupled from project documents. |
| **`backups`** | `id` (string) | `by_projectId` (`projectId`) | Stores compressed snapshot backups (project JSON + assets). |
| **`deviceInfo`** | `key` (string) | None | Stores device-local UUID and Home View coordinates (never exported). |

### 2.3 Storage Interface (`IProjectStorage`)
```typescript
export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
  createdAt: number;
  stopCount: number;
  distanceKm: number;
}

export interface IProjectStorage {
  // Database Lifecycle
  initialize(): Promise<void>;

  // Project CRUD
  listProjects(): Promise<ProjectSummary[]>;
  loadProject(id: string): Promise<MapProject | null>;
  saveProject(project: MapProject): Promise<void>;
  deleteProject(id: string): Promise<void>;

  // Asset CRUD
  saveAsset(projectId: string, assetId: string, blob: Blob): Promise<void>;
  getAsset(assetId: string): Promise<Blob | null>;
  deleteAsset(assetId: string): Promise<void>;

  // Basic Backups
  createBackup(projectId: string, reason: string): Promise<string>;
  restoreBackup(backupId: string): Promise<MapProject>;
  listBackups(projectId: string): Promise<Array<{ id: string; createdAt: number; reason: string }>>;

  // Device-Local Info
  getDeviceId(): Promise<string>;
  getHomeView(projectId: string): Promise<{ center: [number, number]; zoom: number; pitch: number; bearing: number } | null>;
  setHomeView(projectId: string, view: { center: [number, number]; zoom: number; pitch: number; bearing: number }): Promise<void>;

  // Portable Interchange
  exportProjectFile(id: string): Promise<Blob>;
  importProjectFile(file: File): Promise<MapProject>;
}
```

---

## 3. Clean-Start Sequence

When Map Animator boots:
1. **Initialize Database:** Open `map_animator_db` (v1) with the 4 object stores using `idb`.
2. **Storage Verification:** Perform a quick write/read/delete check using a temporary record (`__test_${Date.now()}_${crypto.randomUUID()}`).
   - If IndexedDB is blocked or unsupported: Display an inline banner (*"IndexedDB is required to run Map Animator. Please ensure local storage is enabled in your browser."*). Do not proceed.
3. **Surgically Remove Old Data:** Once IndexedDB is verified operational, execute:
   ```typescript
   localStorage.removeItem('mapanimator_projects_v1');
   ```
   *Only this specific key is removed. No other keys or browser data are touched.*
4. **Display Clean State:** `listProjects()` returns `[]`. The Home Page presents an empty state ready for the user to create a new journey.

---

## 4. Schema v2 New Project Factory

Every new project is initialized with **exactly one canonical route**. All entities use composite unique IDs combining timestamp and UUID (`prefix-${Date.now()}-${crypto.randomUUID()}`):

```typescript
export function getNextUntitledProjectName(existingProjects: ProjectSummary[]): string {
  const pattern = /^Untitled Project (\d+)$/;
  const usedNumbers = new Set<number>();

  for (const p of existingProjects) {
    const match = p.name.trim().match(pattern);
    if (match) usedNumbers.add(parseInt(match[1], 10));
  }

  let candidate = 1;
  while (usedNumbers.has(candidate)) candidate++;
  return `Untitled Project ${candidate}`;
}

export function createNewProject(existingProjects: ProjectSummary[] = []): MapProject {
  const now = Date.now();
  const projectId = `proj-${now}-${crypto.randomUUID()}`;
  const routeId = `route-${now}-${crypto.randomUUID()}`;
  const sceneId = `scene-${now}-${crypto.randomUUID()}`;

  const initialRoute: CanonicalRoute = {
    id: routeId,
    name: 'Main Journey',
    status: 'idle', // Idle; no calculation triggered for an empty route
    color: '#ff4d2e',
    width: 8,
    style: 'solid',
    stops: [],
    segments: [],
    calculatedGeometry: [],
    stats: {
      distanceKm: 0,
      elevationGainM: 0,
      elevationLossM: 0,
    },
  };

  const initialScene: Scene = {
    id: sceneId,
    name: 'Scene 1',
    duration: 40,
    holdStartSec: 1,
    holdEndSec: 2,
    mapThemeId: 'liberty',
    signs: [],
    cameraBlocks: [],
    overlays: {
      showDistance: true,
      showAltitude: true,
      showSpeed: true,
      showElevationProfile: true,
      showCompass: true,
      unit: 'metric',
      theme: 'dark',
    },
  };

  return {
    schemaVersion: 2,
    id: projectId,
    name: getNextUntitledProjectName(existingProjects),
    createdAt: now,
    updatedAt: now,
    aspect: '16:9',
    aspectRatio: '16:9',
    duration: 40,
    durationPreset: 40,
    cameraPreset: 'fly_along',
    cameraSettings: {
      preset: 'fly_along',
      smoothness: 0.5,
    },
    size: 1080,
    fps: 30,
    includeMapCredit: true,
    routes: [initialRoute], // Strictly 1 canonical route
    scenes: [initialScene], // No routes property on scenes
  };
}
```

### Invariants:
- Exactly 1 route in `project.routes`.
- `stops: []`, `segments: []`, `calculatedGeometry: []`, `status: 'idle'`.
- 6 approved transport modes: `car`, `walking`, `bike`, `train`, `boat`, `plane`.
- `Scene` objects never have a `routes` property.
- All IDs generated via `${Date.now()}-${crypto.randomUUID()}` to avoid collision risks.

---

## 5. Basic Backup & Exact Restoration

### 5.1 Native Compression Verification & Snapshot Creation
Snapshots are created immediately prior to destructive operations (e.g. Clear Route, Delete Project, Pre-Restore Overwrite):

1. **Verify Native Gzip Support:**
   ```typescript
   export function checkGzipStreamsSupported(): boolean {
     try {
       new CompressionStream('gzip');
       new DecompressionStream('gzip');
       return true;
     } catch {
       return false;
     }
   }
   ```
   If either `CompressionStream('gzip')` or `DecompressionStream('gzip')` is unsupported, abort and display:  
   *"Your browser does not support native gzip compression streams required for backups. Please use a modern browser."*  
   *(No fallback codecs, polyfills, or extra dependencies).*

2. **Gather Snapshot Data:** Load `MapProject` and all its assets from `assets` where `projectId === targetId`.
3. **Assemble Snapshot:** Convert asset blobs to base64 strings into an in-memory snapshot payload:
   ```typescript
   interface BackupPayload {
     version: 2;
     createdAt: number;
     projectId: string;
     project: MapProject;
     assets: Record<string, string>;
   }
   ```
4. **Compress & Store:** Pipe UTF-8 JSON through `new CompressionStream('gzip')` and store in `backups`:
   ```typescript
   interface StoredBackup {
     id: string; // `backup-${Date.now()}-${crypto.randomUUID()}`
     projectId: string;
     createdAt: number;
     reason: string;
     data: Uint8Array; // gzip bytes
   }
   ```

### 5.2 Exact Restoration Protocol
Restoration must leave no orphaned assets that were added to the project after the backup was created:
1. Verify `DecompressionStream('gzip')` support.
2. Decompress `record.data` using `DecompressionStream('gzip')`. Parse JSON and verify `version === 2`.
3. Open a single `readwrite` transaction spanning `['projects', 'assets']`.
4. Query the `by_projectId` index in `assets` and delete all existing assets for this project.
5. Put all assets from the backup snapshot into `assets` with `projectId` assigned.
6. Put the restored `MapProject` into `projects`.
7. Await `tx.done`. If any step fails, the entire transaction rolls back automatically.

---

## 6. Portable File Interchange (.mapanim) & Atomic Import

### 6.1 Portable Format (.mapanim)
- Plain JSON file.
- Contains Schema v2 `MapProject` and a bundled asset dictionary (`assets: Record<string, string>`).
- Excludes device UUID, device Home View, and local backup history.

### 6.2 Complete Asset-Reference Identification in Schema v2
Inspection of the approved Schema v2 interfaces confirms the complete catalog of potential asset ID references:
- **`MapSign.photoUrl`**: References an image asset ID for photo markers and callouts (`signs: MapSign[]` in each `Scene`).

*(Note: Audio tracks, custom model URLs, and elevation raster assets, when introduced, will reference asset IDs through analogous asset properties. The remapping engine systematically remaps all defined asset references).*

### 6.3 Asset Dictionary Validation & Collision-Free Atomic Import
The import process validates all asset data, ensures referential integrity, and remaps all asset IDs **before** opening the IndexedDB transaction:

```typescript
export async function importProjectFile(file: File, db: IDBPDatabase): Promise<MapProject> {
  const text = await file.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid project file: The selected file is not valid JSON.');
  }

  // 1. Strict Schema v2 Validation
  if (parsed.schemaVersion !== 2 || !parsed.project) {
    throw new Error('Legacy project files are not supported. Please create a new project.');
  }

  const rawProject = parsed.project;
  if (!Array.isArray(rawProject.routes) || rawProject.routes.length !== 1) {
    throw new Error('Invalid project format: Exactly one canonical route is required.');
  }

  if (Array.isArray(rawProject.scenes)) {
    for (const sc of rawProject.scenes) {
      if ('routes' in sc) {
        throw new Error('Invalid project format: Scenes must not contain routes.');
      }
    }
  }

  // 2. Validate Asset Dictionary Format
  const rawAssets = parsed.assets || {};
  if (typeof rawAssets !== 'object' || Array.isArray(rawAssets)) {
    throw new Error('Malformed project file: The asset bundle must be an object dictionary.');
  }

  // 3. Scan & Verify All Asset References Exist in the Dictionary
  // Identify every asset ID referenced by the project document
  const referencedAssetIds = new Set<string>();
  if (Array.isArray(rawProject.scenes)) {
    for (const scene of rawProject.scenes) {
      if (Array.isArray(scene.signs)) {
        for (const sign of scene.signs) {
          if (sign.photoUrl) {
            referencedAssetIds.add(sign.photoUrl);
          }
        }
      }
    }
  }

  // Reject immediately if any referenced asset is missing from the dictionary
  for (const refId of referencedAssetIds) {
    if (!(refId in rawAssets)) {
      throw new Error(`Corrupt project file: Referenced asset "${refId}" is missing from the asset dictionary.`);
    }
  }

  // 4. Validate Asset Data & Build Remapped Entries
  const newProjectId = `proj-${Date.now()}-${crypto.randomUUID()}`;
  const assetIdMap = new Map<string, string>(); // oldAssetId -> newAssetId
  const remappedAssets: Array<{ id: string; projectId: string; blob: Blob }> = [];

  for (const [oldAssetId, base64Str] of Object.entries(rawAssets)) {
    if (typeof base64Str !== 'string' || !base64Str.startsWith('data:')) {
      throw new Error(`Malformed asset data for "${oldAssetId}": expected a valid data URL.`);
    }
    const newAssetId = `asset-${Date.now()}-${crypto.randomUUID()}`;
    assetIdMap.set(oldAssetId, newAssetId);

    let blob: Blob;
    try {
      blob = base64ToBlob(base64Str);
    } catch {
      throw new Error(`Failed to decode asset data for "${oldAssetId}".`);
    }

    remappedAssets.push({ id: newAssetId, projectId: newProjectId, blob });
  }

  // 5. Complete Asset-Reference Remapping in Project Document
  const updatedScenes = (rawProject.scenes || []).map((scene: Scene) => {
    const updatedSigns = (scene.signs || []).map((sign: MapSign) => {
      if (sign.photoUrl && assetIdMap.has(sign.photoUrl)) {
        return { ...sign, photoUrl: assetIdMap.get(sign.photoUrl)! };
      }
      return sign;
    });
    return { ...scene, signs: updatedSigns };
  });

  const importedProject: MapProject = {
    ...rawProject,
    id: newProjectId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    scenes: updatedScenes,
  };

  // 6. Single Multi-Store Readwrite Transaction
  // Await transaction completion to ensure atomicity
  const tx = db.transaction(['projects', 'assets'], 'readwrite');
  await tx.objectStore('projects').put(importedProject);
  for (const asset of remappedAssets) {
    await tx.objectStore('assets').put(asset);
  }
  await tx.done;

  return importedProject;
}
```

---

## 7. Storage Reliability & Simple Quota Handling

- **Autosave:** Edits to stops, settings, and styles trigger a debounced save (1000ms delay). Pointer drags update transient React state and write to storage only on pointer release.
- **Quota Management:** If a write throws `QuotaExceededError`:
  1. The storage engine deletes the oldest backup for that project from `backups`.
  2. Retries the save once.
  3. If still full, aborts the write and notifies the user: *"Storage limit reached. Project could not be saved to this device."*
  4. Active project data is never truncated or compromised.

---
*Clean-Start Plan finalized for Phase 1.*
