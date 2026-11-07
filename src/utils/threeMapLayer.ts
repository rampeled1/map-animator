import * as THREE from 'three';
import maplibregl from 'maplibre-gl';
import type { RoutePoint } from '../types';
import { CatmullRom3DPath, PathSample3D } from './catmullRom3DPath';
import { Vehicle3DManager, ModelKind3D } from './vehicle3DManager';

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

  private currentProgress: number = 0;
  private routeColorHex: string = '#ff4d2e';
  private modelKind: ModelKind3D = 'tank';
  private customModelFile?: File;
  private isModelLoading: boolean = false;

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

  private initRibbonMeshes() {
    // Outer border ribbon (dark contrast casing)
    const outerGeo = new THREE.BufferGeometry();
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0x11161d,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      transparent: true,
      opacity: 0.85,
    });
    this.ribbonOuterMesh = new THREE.Mesh(outerGeo, outerMat);
    this.scene.add(this.ribbonOuterMesh);

    // Inner core ribbon (semi-translucent vibrant overlay)
    const innerGeo = new THREE.BufferGeometry();
    const innerMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.routeColorHex),
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      transparent: true,
      opacity: 0.75,
    });
    this.ribbonInnerMesh = new THREE.Mesh(innerGeo, innerMat);
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

  private async loadVehicleModel() {
    if (this.isModelLoading) return;
    this.isModelLoading = true;
    try {
      if (this.vehicleGroup) {
        this.scene.remove(this.vehicleGroup);
      }
      const model = await this.vehicleManager.loadModel(
        this.modelKind,
        this.routeColorHex,
        this.customModelFile
      );
      this.vehicleGroup = model;
      this.scene.add(this.vehicleGroup);
    } catch (err) {
      console.warn('ThreeMapLayer: Failed to load 3D vehicle, using fallback procedural tank', err);
      this.vehicleGroup = this.vehicleManager.createProceduralModel('tank', this.routeColorHex);
      this.scene.add(this.vehicleGroup);
    } finally {
      this.isModelLoading = false;
    }
  }

  public setRoute(points: RoutePoint[], colorHex?: string) {
    if (colorHex && colorHex !== this.routeColorHex) {
      this.routeColorHex = colorHex;
      if (this.ribbonInnerMesh) {
        (this.ribbonInnerMesh.material as THREE.MeshBasicMaterial).color.set(colorHex);
      }
      this.loadVehicleModel();
    }
    this.pathEngine.updatePoints(points);
  }

  public setModelKind(kind: ModelKind3D, customFile?: File) {
    this.modelKind = kind;
    this.customModelFile = customFile;
    this.loadVehicleModel();
  }

  public setProgress(progress: number) {
    this.currentProgress = Math.max(0, Math.min(1, progress));
  }

  /**
   * Returns current 3D position & vector kinematics for Chase Camera
   */
  public getKinematics(t?: number): PathSample3D | null {
    const sampleT = t !== undefined ? t : this.currentProgress;
    return this.pathEngine.sample(sampleT);
  }

  public render(_gl: WebGLRenderingContext | WebGL2RenderingContext, options: maplibregl.CustomRenderMethodInput) {
    if (!this.map || !this.renderer) return;

    // Synchronize Three.js camera projection matrix with MapLibre's modelViewProjectionMatrix
    this.camera.projectionMatrix = new THREE.Matrix4().fromArray(options.modelViewProjectionMatrix);

    const sample = this.pathEngine.sample(this.currentProgress);

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

      // Update 3D Ribbon Trail
      // Half width ~ 3.5 meters
      const ribbonHalfWidth = mercatorScale * 3.5;
      const ribbonData = this.pathEngine.generateRibbonGeometry(
        this.currentProgress,
        ribbonHalfWidth,
        250
      );

      if (ribbonData.count >= 2 && this.ribbonOuterMesh && this.ribbonInnerMesh) {
        this.ribbonOuterMesh.visible = true;
        this.ribbonInnerMesh.visible = true;

        this.updateRibbonGeometry(this.ribbonOuterMesh, ribbonData.outerPositions, ribbonData.count);
        this.updateRibbonGeometry(this.ribbonInnerMesh, ribbonData.innerPositions, ribbonData.count);
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
    this.map.triggerRepaint();
  }

  private updateRibbonGeometry(mesh: THREE.Mesh, positions: Float32Array, count: number) {
    const geo = mesh.geometry;
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Construct index buffer for triangle strip
    // Quad between step i and i+1: (v0, v1, v2) and (v2, v1, v3)
    const indices: number[] = [];
    for (let i = 0; i < count - 1; i++) {
      const v0 = i * 2;
      const v1 = i * 2 + 1;
      const v2 = (i + 1) * 2;
      const v3 = (i + 1) * 2 + 1;
      indices.push(v0, v1, v2);
      indices.push(v2, v1, v3);
    }
    geo.setIndex(indices);
    geo.computeVertexNormals();
  }

  public onRemove() {
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    this.map = null;
  }
}
