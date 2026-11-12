import * as THREE from 'three';
import maplibregl from 'maplibre-gl';
import type { RoutePoint } from '../types/index.ts';
import { CatmullRom3DPath, type PathSample3D } from './catmullRom3DPath.ts';
import { Vehicle3DManager, type ModelKind3D } from './vehicle3DManager.ts';

export class ThreeMapLayer implements maplibregl.CustomLayerInterface {
  public id: string = 'three-vehicle-layer';
  public type: 'custom' = 'custom';
  public renderingMode: '3d' = '3d';

  private map: maplibregl.Map | null = null;
  private camera: THREE.Camera = new THREE.Camera();
  private scene: THREE.Scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer | null = null;

  private pathEngine: CatmullRom3DPath = new CatmullRom3DPath([]);
  private vehicleManager: Vehicle3DManager = new Vehicle3DManager();
  private vehicleGroup: THREE.Group | null = null;

  // Ribbon Trail Meshes
  private ribbonOuterMesh: THREE.Mesh | null = null;
  private ribbonInnerMesh: THREE.Mesh | null = null;
  private tipTargetMesh: THREE.Mesh | null = null;
  private static readonly MAX_RIBBON_STEPS = 250;
  private ribbonIndexBuffer: THREE.BufferAttribute | null = null;

  private currentProgress: number = 0;
  private currentSplineU: number = 0;
  private routeColorHex: string = '#ff4d2e';
  private modelKind: ModelKind3D = 'tank';
  private customModelFile?: File;
  private isModelLoading: boolean = false;
  private modelLoadRequestId: number = 0;
  private loadedModelKind: ModelKind3D | null = null;
  private loadedColorHex: string | null = null;
  private loadedCustomFile?: File;

  // Route geometry fingerprint cache to skip redundant CatmullRom3DPath rebuilds
  private lastRoutePointsRef: RoutePoint[] | null = null;
  private lastRouteFingerprint: string = '';
  private hasRouteElevation: boolean = false;

  constructor(options?: {
    modelKind?: ModelKind3D;
    colorHex?: string;
    customModelFile?: File;
  }) {
    if (options?.modelKind) this.modelKind = options.modelKind;
    if (options?.colorHex) this.routeColorHex = options.colorHex;
    if (options?.customModelFile) this.customModelFile = options.customModelFile;
  }

  public onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    this.renderer.autoClear = false;

    // Lighting setup for 3D map environment
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
    sunLight.position.set(0.5, -1.0, 1.5).normalize();
    this.scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0x90b0e0, 0.8);
    fillLight.position.set(-0.5, 1.0, 0.8).normalize();
    this.scene.add(fillLight);

    this.initRibbonMeshes();
    this.initTipTargetMesh();
    this.loadVehicleModel();
  }

  private getSharedRibbonIndexBuffer(): THREE.BufferAttribute {
    if (!this.ribbonIndexBuffer) {
      const maxSteps = ThreeMapLayer.MAX_RIBBON_STEPS;
      const indices = new Uint16Array((maxSteps - 1) * 6);
      let offset = 0;
      for (let i = 0; i < maxSteps - 1; i++) {
        const v0 = i * 2;
        const v1 = i * 2 + 1;
        const v2 = (i + 1) * 2;
        const v3 = (i + 1) * 2 + 1;
        indices[offset++] = v0;
        indices[offset++] = v1;
        indices[offset++] = v2;
        indices[offset++] = v2;
        indices[offset++] = v1;
        indices[offset++] = v3;
      }
      this.ribbonIndexBuffer = new THREE.BufferAttribute(indices, 1);
    }
    return this.ribbonIndexBuffer;
  }

  private initRibbonMeshes() {
    const maxVertices = ThreeMapLayer.MAX_RIBBON_STEPS * 2;
    const sharedIndex = this.getSharedRibbonIndexBuffer();

    // Outer border ribbon (dark contrast casing)
    const outerGeo = new THREE.BufferGeometry();
    const outerPosAttr = new THREE.BufferAttribute(new Float32Array(maxVertices * 3), 3);
    outerPosAttr.setUsage(THREE.DynamicDrawUsage);
    outerGeo.setAttribute('position', outerPosAttr);
    outerGeo.setIndex(sharedIndex);
    outerGeo.setDrawRange(0, 0);

    const outerMat = new THREE.MeshBasicMaterial({
      color: 0x11161d,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      transparent: true,
      opacity: 0.85,
    });
    this.ribbonOuterMesh = new THREE.Mesh(outerGeo, outerMat);
    this.ribbonOuterMesh.frustumCulled = false;
    this.scene.add(this.ribbonOuterMesh);

    // Inner core ribbon (semi-translucent vibrant overlay)
    const innerGeo = new THREE.BufferGeometry();
    const innerPosAttr = new THREE.BufferAttribute(new Float32Array(maxVertices * 3), 3);
    innerPosAttr.setUsage(THREE.DynamicDrawUsage);
    innerGeo.setAttribute('position', innerPosAttr);
    innerGeo.setIndex(sharedIndex);
    innerGeo.setDrawRange(0, 0);

    const innerMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.routeColorHex),
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      transparent: true,
      opacity: 0.75,
    });
    this.ribbonInnerMesh = new THREE.Mesh(innerGeo, innerMat);
    this.ribbonInnerMesh.frustumCulled = false;
    this.scene.add(this.ribbonInnerMesh);
  }

  private initTipTargetMesh() {
    // Green-rimmed circular target ring at active vehicle tip (observed in snapshots)
    const ringGeo = new THREE.RingGeometry(0.8, 1.15, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x55aa44,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
    });
    this.tipTargetMesh = new THREE.Mesh(ringGeo, ringMat);
    this.tipTargetMesh.visible = false;
    this.scene.add(this.tipTargetMesh);
  }

  private disposeObject3D(root: THREE.Object3D | null) {
    if (!root) return;
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      }
    });
  }

  private async loadVehicleModel() {
    const reqKind = this.modelKind;
    const reqColor = this.routeColorHex;
    const reqFile = this.customModelFile;

    // Skip if already loaded with the exact same configuration
    if (
      !this.isModelLoading &&
      this.vehicleGroup !== null &&
      this.loadedModelKind === reqKind &&
      this.loadedColorHex === reqColor &&
      this.loadedCustomFile === reqFile
    ) {
      return;
    }

    const requestId = ++this.modelLoadRequestId;
    this.isModelLoading = true;

    try {
      const model = await this.vehicleManager.loadModel(reqKind, reqColor, reqFile);
      // Stale request check: a newer load request was issued while awaiting
      if (requestId !== this.modelLoadRequestId) {
        this.disposeObject3D(model);
        return;
      }

      const oldGroup = this.vehicleGroup;
      if (oldGroup) {
        this.scene.remove(oldGroup);
        this.disposeObject3D(oldGroup);
      }

      this.vehicleGroup = model;
      this.loadedModelKind = reqKind;
      this.loadedColorHex = reqColor;
      this.loadedCustomFile = reqFile;
      this.scene.add(this.vehicleGroup);
      this.map?.triggerRepaint();
    } catch (err) {
      if (requestId !== this.modelLoadRequestId) {
        return;
      }
      console.warn('ThreeMapLayer: Failed to load 3D vehicle, using fallback procedural tank', err);
      const fallbackModel = this.vehicleManager.createProceduralModel('tank', reqColor);
      const oldGroup = this.vehicleGroup;
      if (oldGroup) {
        this.scene.remove(oldGroup);
        this.disposeObject3D(oldGroup);
      }
      this.vehicleGroup = fallbackModel;
      this.loadedModelKind = 'tank';
      this.loadedColorHex = reqColor;
      this.loadedCustomFile = undefined;
      this.scene.add(this.vehicleGroup);
      this.map?.triggerRepaint();
    } finally {
      if (requestId === this.modelLoadRequestId) {
        this.isModelLoading = false;
      }
    }
  }

  private computeRouteFingerprint(points: RoutePoint[]): string {
    const len = points.length;
    if (len === 0) return '0';
    const first = points[0];
    const q1 = points[len >> 2];
    const mid = points[len >> 1];
    const q3 = points[(len * 3) >> 2];
    const last = points[len - 1];
    return `${len}:${first.lng},${first.lat},${first.ele || 0}|${q1.lng},${q1.lat},${q1.ele || 0}|${mid.lng},${mid.lat},${mid.ele || 0}|${q3.lng},${q3.lat},${q3.ele || 0}|${last.lng},${last.lat},${last.ele || 0}`;
  }

  public setRoute(points: RoutePoint[], colorHex?: string) {
    if (colorHex && colorHex !== this.routeColorHex) {
      this.routeColorHex = colorHex;
      if (this.ribbonInnerMesh) {
        (this.ribbonInnerMesh.material as THREE.MeshBasicMaterial).color.set(colorHex);
      }
      this.loadVehicleModel();
    }

    const nextFingerprint = this.computeRouteFingerprint(points);
    if (this.lastRoutePointsRef === points && this.lastRouteFingerprint === nextFingerprint) {
      return;
    }
    // Even if the array reference is new (e.g., adapted route), skip spline rebuild if fingerprint & all points match
    if (
      this.lastRouteFingerprint === nextFingerprint &&
      this.lastRoutePointsRef !== null &&
      this.lastRoutePointsRef.length === points.length
    ) {
      let identical = true;
      for (let i = 0; i < points.length; i++) {
        const a = this.lastRoutePointsRef[i];
        const b = points[i];
        if (a.lng !== b.lng || a.lat !== b.lat || (a.ele || 0) !== (b.ele || 0)) {
          identical = false;
          break;
        }
      }
      if (identical) {
        this.lastRoutePointsRef = points;
        return;
      }
    }

    this.lastRoutePointsRef = points;
    this.lastRouteFingerprint = nextFingerprint;
    this.hasRouteElevation = points.some((p) => (p.ele || 0) > 0);
    this.pathEngine.updatePoints(points);
    this.currentSplineU = this.pathEngine.getSplineParameterAtDistanceProgress(this.currentProgress);
  }

  public setModelKind(kind: ModelKind3D, customFile?: File) {
    if (
      this.modelKind === kind &&
      this.customModelFile === customFile &&
      (this.vehicleGroup !== null || this.isModelLoading)
    ) {
      return;
    }
    this.modelKind = kind;
    this.customModelFile = customFile;
    this.loadVehicleModel();
  }

  private continuousRepaintActive: boolean = false;

  public setContinuousRepaint(active: boolean) {
    if (this.continuousRepaintActive !== active) {
      this.continuousRepaintActive = active;
      if (active) {
        this.map?.triggerRepaint();
      }
    }
  }

  public setProgress(distanceProgress: number) {
    const clamped = Math.max(0, Math.min(1, distanceProgress));
    if (this.currentProgress !== clamped) {
      this.currentProgress = clamped;
      this.currentSplineU = this.pathEngine.getSplineParameterAtDistanceProgress(this.currentProgress);
      this.map?.triggerRepaint();
    }
  }

  /**
   * Returns current 3D position & vector kinematics for Chase Camera
   */
  public getKinematics(distanceProgress?: number): PathSample3D | null {
    const u = distanceProgress !== undefined
      ? this.pathEngine.getSplineParameterAtDistanceProgress(distanceProgress)
      : this.currentSplineU;
    return this.pathEngine.sample(u);
  }

  public getRemainingDistanceKm(distanceProgress?: number): number {
    const p = distanceProgress !== undefined ? distanceProgress : this.currentProgress;
    return this.pathEngine.getRemainingDistanceKm(p);
  }

  public getTotalDistanceKm(): number {
    return this.pathEngine.getTotalDistanceKm();
  }

  public render(_gl: WebGLRenderingContext | WebGL2RenderingContext, options: maplibregl.CustomRenderMethodInput) {
    if (!this.map || !this.renderer) return;

    // Synchronize Three.js camera projection matrix with MapLibre's modelViewProjectionMatrix
    this.camera.projectionMatrix.fromArray(options.modelViewProjectionMatrix);

    const sample = this.pathEngine.sample(this.currentSplineU);

    if (sample && this.vehicleGroup) {
      this.vehicleGroup.visible = true;

      // Calculate Mercator scale factor so vehicle dimensions remain realistic in 3D
      // meterInMercatorCoordinateUnits at this latitude
      const lat = sample.worldPoint[1];
      const mercatorScale = maplibregl.MercatorCoordinate.fromLngLat({
        lng: sample.worldPoint[0],
        lat,
      }).meterInMercatorCoordinateUnits();

      // Vehicle length ~ 7 meters in world units
      const vehicleWorldLength = 8.5;
      const scaleInMercator = mercatorScale * vehicleWorldLength;

      this.vehicleManager.updateTransform(this.vehicleGroup, sample, scaleInMercator);

      // Update Tip Target Ring position
      if (this.tipTargetMesh) {
        this.tipTargetMesh.visible = true;
        this.tipTargetMesh.position.copy(sample.position);
        this.tipTargetMesh.position.z += 0.0000003;
        const ringScale = scaleInMercator * 1.8;
        this.tipTargetMesh.scale.set(ringScale, ringScale, ringScale);
      }

      // Update 3D Ribbon Trail ONLY for Air transport modes or elevated 3D routes.
      // Ground routes are already rendered by the crisp 2D SVG route overlay.
      const isAirOrElevatedRoute =
        this.hasRouteElevation || this.modelKind === 'fighter' || this.modelKind === 'drone';

      if (isAirOrElevatedRoute && this.ribbonOuterMesh && this.ribbonInnerMesh) {
        // Half width ~ 3.5 meters
        const ribbonHalfWidth = mercatorScale * 3.5;
        const ribbonData = this.pathEngine.generateRibbonGeometry(
          this.currentSplineU,
          ribbonHalfWidth,
          ThreeMapLayer.MAX_RIBBON_STEPS
        );

        if (ribbonData.count >= 2) {
          this.ribbonOuterMesh.visible = true;
          this.ribbonInnerMesh.visible = true;

          this.updateRibbonGeometry(this.ribbonOuterMesh, ribbonData.outerPositions, ribbonData.count);
          this.updateRibbonGeometry(this.ribbonInnerMesh, ribbonData.innerPositions, ribbonData.count);
        } else {
          this.ribbonOuterMesh.visible = false;
          this.ribbonInnerMesh.visible = false;
        }
      } else {
        if (this.ribbonOuterMesh) this.ribbonOuterMesh.visible = false;
        if (this.ribbonInnerMesh) this.ribbonInnerMesh.visible = false;
      }
    } else {
      if (this.vehicleGroup) this.vehicleGroup.visible = false;
      if (this.tipTargetMesh) this.tipTargetMesh.visible = false;
      if (this.ribbonOuterMesh) this.ribbonOuterMesh.visible = false;
      if (this.ribbonInnerMesh) this.ribbonInnerMesh.visible = false;
    }

    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    if (this.continuousRepaintActive) {
      this.map.triggerRepaint();
    }
  }

  private updateRibbonGeometry(mesh: THREE.Mesh, positions: Float32Array, count: number) {
    const geo = mesh.geometry;
    let posAttr = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
    const requiredFloats = count * 2 * 3;

    if (!posAttr || (posAttr.array as Float32Array).length < requiredFloats) {
      const capacity = Math.max(requiredFloats, ThreeMapLayer.MAX_RIBBON_STEPS * 2 * 3);
      posAttr = new THREE.BufferAttribute(new Float32Array(capacity), 3);
      posAttr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', posAttr);
    }

    (posAttr.array as Float32Array).set(positions.subarray(0, requiredFloats), 0);
    posAttr.needsUpdate = true;

    if (!geo.index) {
      geo.setIndex(this.getSharedRibbonIndexBuffer());
    }
    geo.setDrawRange(0, Math.max(0, (count - 1) * 6));
  }

  public onRemove() {
    this.disposeObject3D(this.vehicleGroup);
    this.vehicleGroup = null;
    this.disposeObject3D(this.ribbonOuterMesh);
    this.ribbonOuterMesh = null;
    this.disposeObject3D(this.ribbonInnerMesh);
    this.ribbonInnerMesh = null;
    this.disposeObject3D(this.tipTargetMesh);
    this.tipTargetMesh = null;
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    this.map = null;
  }
}
