import type {
  CanonicalRoute,
  Scene,
  MapProject,
  ProjectSummary,
  IProjectStorage,
  StoredBackup,
  BackupPayload,
} from '../types/index';
import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';

const DB_NAME = 'map_animator_db';
const DB_VERSION = 1;
const LEGACY_STORAGE_KEY = 'mapanimator_projects_v1';

export function getNextUntitledProjectName(existingProjects: ProjectSummary[]): string {
  const pattern = /^Untitled Project (\d+)$/;
  const usedNumbers = new Set<number>();

  for (const p of existingProjects) {
    const match = p.name.trim().match(pattern);
    if (match) {
      usedNumbers.add(parseInt(match[1], 10));
    }
  }

  let candidate = 1;
  while (usedNumbers.has(candidate)) {
    candidate++;
  }
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
    status: 'idle',
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
    routes: [initialRoute],
    scenes: [initialScene],
  };
}

export class IndexedDBProjectStorage implements IProjectStorage {
  private dbPromise: Promise<IDBPDatabase> | null = null;

  private async getDB(): Promise<IDBPDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('projects')) {
            const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
            projectStore.createIndex('by_updatedAt', 'updatedAt');
          }
          if (!db.objectStoreNames.contains('assets')) {
            const assetStore = db.createObjectStore('assets', { keyPath: 'id' });
            assetStore.createIndex('by_projectId', 'projectId');
          }
          if (!db.objectStoreNames.contains('backups')) {
            const backupStore = db.createObjectStore('backups', { keyPath: 'id' });
            backupStore.createIndex('by_projectId', 'projectId');
          }
          if (!db.objectStoreNames.contains('deviceInfo')) {
            db.createObjectStore('deviceInfo', { keyPath: 'key' });
          }
        },
      });
    }
    return this.dbPromise;
  }

  async initialize(): Promise<void> {
    const db = await this.getDB();

    // Asynchronous Self-Test Round-Trip
    const testKey = `__test_${Date.now()}_${crypto.randomUUID()}`;
    const testRecord = { id: testKey, timestamp: Date.now() };

    try {
      await db.put('projects', testRecord as any);
      const readBack = await db.get('projects', testKey);
      if (!readBack || (readBack as any).id !== testKey) {
        throw new Error('Self-test validation failed: read record did not match written record.');
      }
      await db.delete('projects', testKey);
    } catch (err: any) {
      throw new Error(`IndexedDB self-test failed: ${err?.message || err}`);
    }

    // Surgical Decommissioning of Legacy Storage
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    } catch (err) {
      console.warn('Could not remove legacy localStorage key:', err);
    }
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const db = await this.getDB();
    const rawProjects = (await db.getAllFromIndex('projects', 'by_updatedAt')) as MapProject[];
    // Order descending by updatedAt
    rawProjects.reverse();

    return rawProjects.map((p) => {
      const canonicalRoute = p.routes?.[0];
      return {
        id: p.id,
        name: p.name,
        updatedAt: p.updatedAt,
        createdAt: p.createdAt,
        stopCount: canonicalRoute?.stops?.length || 0,
        distanceKm: canonicalRoute?.stats?.distanceKm || 0,
      };
    });
  }

  async loadProject(id: string): Promise<MapProject | null> {
    const db = await this.getDB();
    const proj = (await db.get('projects', id)) as MapProject | undefined;
    if (!proj) return null;

    if (!Array.isArray(proj.routes) || proj.routes.length !== 1) {
      throw new Error(`Invalid project state for ${id}: project must contain exactly one canonical route.`);
    }
    return proj;
  }

  async saveProject(project: MapProject): Promise<void> {
    if (!Array.isArray(project.routes) || project.routes.length !== 1) {
      throw new Error('Save rejected: project must contain exactly one canonical route.');
    }
    const db = await this.getDB();
    const toSave: MapProject = {
      ...project,
      updatedAt: Date.now(),
    };
    await db.put('projects', toSave);
  }

  async deleteProject(id: string): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(['projects', 'assets', 'backups'], 'readwrite');
    
    // Delete project
    await tx.objectStore('projects').delete(id);

    // Delete associated assets
    const assetStore = tx.objectStore('assets');
    const assetIndex = assetStore.index('by_projectId');
    let assetCursor = await assetIndex.openKeyCursor(IDBKeyRange.only(id));
    while (assetCursor) {
      await assetStore.delete(assetCursor.primaryKey);
      assetCursor = await assetCursor.continue();
    }

    // Delete associated backups
    const backupStore = tx.objectStore('backups');
    const backupIndex = backupStore.index('by_projectId');
    let backupCursor = await backupIndex.openKeyCursor(IDBKeyRange.only(id));
    while (backupCursor) {
      await backupStore.delete(backupCursor.primaryKey);
      backupCursor = await backupCursor.continue();
    }

    await tx.done;
  }

  async saveAsset(projectId: string, assetId: string, blob: Blob): Promise<void> {
    const db = await this.getDB();
    await db.put('assets', { id: assetId, projectId, blob });
  }

  async getAsset(assetId: string): Promise<Blob | null> {
    const db = await this.getDB();
    const record = await db.get('assets', assetId);
    return record?.blob || null;
  }

  async deleteAsset(assetId: string): Promise<void> {
    const db = await this.getDB();
    await db.delete('assets', assetId);
  }

  async createBackup(projectId: string, reason: string): Promise<string> {
    const db = await this.getDB();
    const project = await this.loadProject(projectId);
    if (!project) throw new Error(`Cannot backup non-existent project "${projectId}".`);

    // Fetch all assets
    const assetIndex = db.transaction('assets').store.index('by_projectId');
    const assetRecords = await assetIndex.getAll(IDBKeyRange.only(projectId));
    const assetBase64Map: Record<string, string> = {};

    for (const record of assetRecords) {
      if (record.blob) {
        assetBase64Map[record.id] = await blobToBase64(record.blob);
      }
    }

    const snapshot: BackupPayload = {
      version: 2,
      createdAt: Date.now(),
      projectId,
      project,
      assets: assetBase64Map,
    };

    const jsonBytes = new TextEncoder().encode(JSON.stringify(snapshot));
    const compressedBytes = await compressGzip(jsonBytes);

    const backupId = `backup-${Date.now()}-${crypto.randomUUID()}`;
    const storedBackup: StoredBackup = {
      id: backupId,
      projectId,
      createdAt: Date.now(),
      reason,
      data: compressedBytes,
    };

    await db.put('backups', storedBackup);
    return backupId;
  }

  async restoreBackup(backupId: string): Promise<MapProject> {
    const db = await this.getDB();
    const stored = (await db.get('backups', backupId)) as StoredBackup | undefined;
    if (!stored) throw new Error(`Backup record "${backupId}" not found.`);

    const decompressedBytes = await decompressGzip(stored.data);
    const snapshot: BackupPayload = JSON.parse(new TextDecoder().decode(decompressedBytes));

    if (snapshot.version !== 2 || !snapshot.project) {
      throw new Error('Corrupt backup snapshot: invalid schema.');
    }

    const projectId = snapshot.projectId;
    const restoredProject = snapshot.project;

    // Multi-store readwrite transaction spanning projects and assets
    const tx = db.transaction(['projects', 'assets'], 'readwrite');
    const projectStore = tx.objectStore('projects');
    const assetStore = tx.objectStore('assets');
    const assetIndex = assetStore.index('by_projectId');

    // Delete currently stored assets for this project
    let cursor = await assetIndex.openKeyCursor(IDBKeyRange.only(projectId));
    while (cursor) {
      await assetStore.delete(cursor.primaryKey);
      cursor = await cursor.continue();
    }

    // Write assets captured in snapshot
    for (const [assetId, base64] of Object.entries(snapshot.assets || {})) {
      const blob = base64ToBlob(base64);
      await assetStore.put({ id: assetId, projectId, blob });
    }

    // Restore project document
    await projectStore.put(restoredProject);
    await tx.done;

    return restoredProject;
  }

  async listBackups(projectId: string): Promise<Array<{ id: string; createdAt: number; reason: string }>> {
    const db = await this.getDB();
    const backups = (await db.getAllFromIndex('backups', 'by_projectId', IDBKeyRange.only(projectId))) as StoredBackup[];
    return backups
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((b) => ({ id: b.id, createdAt: b.createdAt, reason: b.reason }));
  }

  async getDeviceId(): Promise<string> {
    const db = await this.getDB();
    const record = await db.get('deviceInfo', 'deviceId');
    if (record?.value) return record.value;

    const newId = crypto.randomUUID();
    await db.put('deviceInfo', { key: 'deviceId', value: newId });
    return newId;
  }

  async getHomeView(projectId: string): Promise<{ center: [number, number]; zoom: number; pitch: number; bearing: number } | null> {
    const db = await this.getDB();
    const record = await db.get('deviceInfo', `homeView_${projectId}`);
    return record?.view || null;
  }

  async setHomeView(projectId: string, view: { center: [number, number]; zoom: number; pitch: number; bearing: number }): Promise<void> {
    const db = await this.getDB();
    await db.put('deviceInfo', { key: `homeView_${projectId}`, view });
  }

  async exportProjectFile(id: string): Promise<Blob> {
    const db = await this.getDB();
    const project = await this.loadProject(id);
    if (!project) throw new Error(`Project "${id}" not found.`);

    const assetIndex = db.transaction('assets').store.index('by_projectId');
    const assetRecords = await assetIndex.getAll(IDBKeyRange.only(id));
    const assetBase64Map: Record<string, string> = {};

    for (const record of assetRecords) {
      if (record.blob) {
        assetBase64Map[record.id] = await blobToBase64(record.blob);
      }
    }

    const payload = {
      schemaVersion: 2,
      project,
      assets: assetBase64Map,
    };

    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  }

  async importProjectFile(file: File): Promise<MapProject> {
    const db = await this.getDB();
    const text = await file.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Invalid project file: The selected file is not valid JSON.');
    }

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

    const rawAssets = parsed.assets || {};
    if (typeof rawAssets !== 'object' || Array.isArray(rawAssets)) {
      throw new Error('Malformed project file: The asset bundle must be an object dictionary.');
    }

    // Scan all referenced assets
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

    for (const refId of referencedAssetIds) {
      if (!(refId in rawAssets)) {
        throw new Error(`Corrupt project file: Referenced asset "${refId}" is missing from the asset dictionary.`);
      }
    }

    const newProjectId = `proj-${Date.now()}-${crypto.randomUUID()}`;
    const assetIdMap = new Map<string, string>();
    const remappedAssets: Array<{ id: string; projectId: string; blob: Blob }> = [];

    for (const [oldAssetId, base64Str] of Object.entries(rawAssets)) {
      if (typeof base64Str !== 'string' || !base64Str.startsWith('data:')) {
        throw new Error(`Malformed asset data for "${oldAssetId}": expected a valid data URL.`);
      }
      const newAssetId = `asset-${Date.now()}-${crypto.randomUUID()}`;
      assetIdMap.set(oldAssetId, newAssetId);

      const blob = base64ToBlob(base64Str);
      remappedAssets.push({ id: newAssetId, projectId: newProjectId, blob });
    }

    // Remap asset references in project
    const updatedScenes = (rawProject.scenes || []).map((scene: Scene) => {
      const updatedSigns = (scene.signs || []).map((sign) => {
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

    // Atomic multi-store write
    const tx = db.transaction(['projects', 'assets'], 'readwrite');
    await tx.objectStore('projects').put(importedProject);
    for (const asset of remappedAssets) {
      await tx.objectStore('assets').put(asset);
    }
    await tx.done;

    return importedProject;
  }
}

// Helpers
export function checkGzipStreamsSupported(): boolean {
  try {
    if (typeof CompressionStream !== 'function' || typeof DecompressionStream !== 'function') {
      return false;
    }
    new CompressionStream('gzip');
    new DecompressionStream('gzip');
    return true;
  } catch {
    return false;
  }
}

async function compressGzip(inputBytes: Uint8Array): Promise<Uint8Array> {
  if (!checkGzipStreamsSupported()) {
    throw new Error('Your browser does not support native gzip compression streams required for backups. Please use a modern browser.');
  }
  const stream = new Response(inputBytes).body!.pipeThrough(new CompressionStream('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function decompressGzip(compressedBytes: Uint8Array): Promise<Uint8Array> {
  if (!checkGzipStreamsSupported()) {
    throw new Error('Your browser does not support native gzip compression streams required for backups. Please use a modern browser.');
  }
  const stream = new Response(compressedBytes).body!.pipeThrough(new DecompressionStream('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string): Blob {
  const parts = base64.split(';base64,');
  const contentType = parts[0].replace('data:', '') || 'application/octet-stream';
  const raw = atob(parts[1] || parts[0]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);
  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  return new Blob([uInt8Array], { type: contentType });
}

export const projectStorage = new IndexedDBProjectStorage();
