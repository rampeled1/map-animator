import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { PathSample3D } from './catmullRom3DPath';

export type ModelKind3D = 'tank' | 'armored' | 'fighter' | 'car' | 'drone' | 'custom';

export class Vehicle3DManager {
  private loader: GLTFLoader;
  private customModelCache = new Map<string, THREE.Group>();

  constructor() {
    this.loader = new GLTFLoader();
  }

  public async loadModel(
    kind: ModelKind3D,
    colorHex: string = '#ff4d2e',
    customUrlOrFile?: string | File
  ): Promise<THREE.Group> {
    if (kind === 'custom' && customUrlOrFile) {
      return this.loadCustomGLB(customUrlOrFile, colorHex);
    }
    return this.createProceduralModel(kind, colorHex);
  }

  private async loadCustomGLB(source: string | File, colorHex: string): Promise<THREE.Group> {
    let url: string;
    if (typeof source === 'string') {
      url = source;
    } else {
      url = URL.createObjectURL(source);
    }

    if (this.customModelCache.has(url)) {
      const cached = this.customModelCache.get(url)!.clone();
      this.applyColorTint(cached, colorHex);
      return cached;
    }

    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          const group = gltf.scene;
          this.applyColorTint(group, colorHex);
          this.normalizeModelSize(group);
          this.customModelCache.set(url, group);
          resolve(group.clone());
        },
        undefined,
        (err) => reject(err)
      );
    });
  }

  private applyColorTint(root: THREE.Object3D, colorHex: string) {
    const color = new THREE.Color(colorHex);
    root.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.material) {
          const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
          mat.color.lerp(color, 0.4);
          mat.needsUpdate = true;
          mesh.material = mat;
        }
      }
    });
  }

  private normalizeModelSize(root: THREE.Object3D, targetRadius: number = 1.0) {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = (targetRadius * 2) / maxDim;
    root.scale.set(scale, scale, scale);
  }

  /**
   * Create procedural 3D models using pure Three.js geometries and PBR materials
   */
  public createProceduralModel(kind: ModelKind3D, colorHex: string): THREE.Group {
    const group = new THREE.Group();
    const primaryMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex),
      metalness: 0.65,
      roughness: 0.35,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x22262c,
      metalness: 0.8,
      roughness: 0.4,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.9,
      roughness: 0.2,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x88ccee,
      metalness: 0.1,
      roughness: 0.1,
      transmission: 0.7,
      transparent: true,
      opacity: 0.8,
    });

    if (kind === 'tank') {
      // 1. Military Battle Tank
      // Hull
      const hullGeo = new THREE.BoxGeometry(1.6, 2.8, 0.65);
      const hullMesh = new THREE.Mesh(hullGeo, primaryMat);
      hullMesh.position.set(0, 0, 0.45);
      group.add(hullMesh);

      // Treads (Left & Right)
      const treadGeo = new THREE.BoxGeometry(0.35, 3.1, 0.55);
      const leftTread = new THREE.Mesh(treadGeo, darkMat);
      leftTread.position.set(-1.0, 0, 0.3);
      const rightTread = new THREE.Mesh(treadGeo, darkMat);
      rightTread.position.set(1.0, 0, 0.3);
      group.add(leftTread, rightTread);

      // Turret
      const turretGeo = new THREE.CylinderGeometry(0.7, 0.85, 0.45, 12);
      turretGeo.rotateX(Math.PI / 2);
      const turretMesh = new THREE.Mesh(turretGeo, primaryMat);
      turretMesh.position.set(0, -0.15, 0.95);
      group.add(turretMesh);

      // Cannon Barrel
      const barrelGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8);
      barrelGeo.rotateX(Math.PI / 2);
      const barrelMesh = new THREE.Mesh(barrelGeo, darkMat);
      barrelMesh.position.set(0, 1.3, 0.98);
      group.add(barrelMesh);

      // Commander hatch
      const hatchGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 8);
      hatchGeo.rotateX(Math.PI / 2);
      const hatchMesh = new THREE.Mesh(hatchGeo, accentMat);
      hatchMesh.position.set(0.3, -0.3, 1.2);
      group.add(hatchMesh);
    } else if (kind === 'fighter') {
      // 2. Fighter Jet
      // Fuselage
      const fuselageGeo = new THREE.ConeGeometry(0.4, 3.2, 8);
      fuselageGeo.rotateX(Math.PI / 2);
      const fuselage = new THREE.Mesh(fuselageGeo, primaryMat);
      fuselage.position.set(0, 0.3, 0.3);
      group.add(fuselage);

      // Delta Wings
      const wingShape = new THREE.Shape();
      wingShape.moveTo(0, 0.8);
      wingShape.lineTo(-2.2, -1.0);
      wingShape.lineTo(-0.6, -1.0);
      wingShape.lineTo(0, -0.6);
      wingShape.lineTo(0.6, -1.0);
      wingShape.lineTo(2.2, -1.0);
      wingShape.closePath();
      const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.08, bevelEnabled: false });
      const wings = new THREE.Mesh(wingGeo, primaryMat);
      wings.position.set(0, 0, 0.25);
      group.add(wings);

      // Vertical Tail Fin
      const finGeo = new THREE.BoxGeometry(0.08, 0.9, 0.85);
      const fin = new THREE.Mesh(finGeo, accentMat);
      fin.position.set(0, -0.9, 0.75);
      group.add(fin);

      // Cockpit Canopy
      const canopyGeo = new THREE.SphereGeometry(0.25, 8, 8);
      canopyGeo.scale(1.0, 2.4, 1.2);
      const canopy = new THREE.Mesh(canopyGeo, glassMat);
      canopy.position.set(0, 0.5, 0.55);
      group.add(canopy);
    } else if (kind === 'armored') {
      // 3. Armored Personnel Carrier / Recon Vehicle
      const bodyGeo = new THREE.BoxGeometry(1.5, 3.2, 0.9);
      const body = new THREE.Mesh(bodyGeo, primaryMat);
      body.position.set(0, 0, 0.65);
      group.add(body);

      // 6 Wheels
      const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.28, 12);
      wheelGeo.rotateZ(Math.PI / 2);
      const wheelY = [1.0, 0, -1.0];
      wheelY.forEach((y) => {
        const wL = new THREE.Mesh(wheelGeo, darkMat);
        wL.position.set(-0.85, y, 0.32);
        const wR = new THREE.Mesh(wheelGeo, darkMat);
        wR.position.set(0.85, y, 0.32);
        group.add(wL, wR);
      });

      // Roof Antenna / Turret
      const cupolaGeo = new THREE.CylinderGeometry(0.4, 0.45, 0.3, 8);
      cupolaGeo.rotateX(Math.PI / 2);
      const cupola = new THREE.Mesh(cupolaGeo, darkMat);
      cupola.position.set(0, 0.2, 1.2);
      group.add(cupola);
    } else if (kind === 'drone') {
      // 4. Recon Quadcopter Drone
      const centerGeo = new THREE.CylinderGeometry(0.4, 0.45, 0.25, 8);
      centerGeo.rotateX(Math.PI / 2);
      const centerBody = new THREE.Mesh(centerGeo, darkMat);
      centerBody.position.set(0, 0, 0.4);
      group.add(centerBody);

      // 4 Arms
      const armAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
      armAngles.forEach((ang) => {
        const armGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6);
        armGeo.rotateZ(ang);
        const arm = new THREE.Mesh(armGeo, accentMat);
        arm.position.set((Math.cos(ang) * 1.2) / 2, (Math.sin(ang) * 1.2) / 2, 0.4);
        group.add(arm);

        // Rotor Disc
        const rotorGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.02, 12);
        const rotor = new THREE.Mesh(rotorGeo, glassMat);
        rotor.position.set(Math.cos(ang) * 1.2, Math.sin(ang) * 1.2, 0.48);
        group.add(rotor);
      });
    } else {
      // 5. Modern SUV / Car
      const baseGeo = new THREE.BoxGeometry(1.4, 3.0, 0.55);
      const base = new THREE.Mesh(baseGeo, primaryMat);
      base.position.set(0, 0, 0.45);
      group.add(base);

      // Cabin / Glass
      const cabinGeo = new THREE.BoxGeometry(1.2, 1.7, 0.5);
      const cabin = new THREE.Mesh(cabinGeo, glassMat);
      cabin.position.set(0, -0.2, 0.95);
      group.add(cabin);

      // 4 Wheels
      const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.24, 12);
      wheelGeo.rotateZ(Math.PI / 2);
      [-0.85, 0.85].forEach((x) => {
        [-0.9, 0.9].forEach((y) => {
          const wheel = new THREE.Mesh(wheelGeo, darkMat);
          wheel.position.set(x, y, 0.28);
          group.add(wheel);
        });
      });
    }

    return group;
  }

  /**
   * Position and orient the 3D vehicle along the sampled path tangent
   */
  public updateTransform(
    object3D: THREE.Object3D,
    sample: PathSample3D,
    scaleInMercator: number
  ) {
    object3D.position.copy(sample.position);

    // Apply scale in Mercator units
    object3D.scale.set(scaleInMercator, scaleInMercator, scaleInMercator);

    // Orientation:
    // In our model coordinates, +Y is forward, +Z is up, +X is right.
    // In MapLibre Mercator coordinates:
    // +X is East, +Y is South (North is -Y), +Z is Up.
    // Forward vector aligns with tangent.
    const forward = sample.tangent.clone().normalize();
    const up = sample.up.clone().normalize();
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();

    // Construct rotation matrix from Basis (right, forward, up)
    const m = new THREE.Matrix4().makeBasis(right, forward, up);

    // Apply banking roll around forward tangent
    if (sample.rollDeg !== 0) {
      const rollRad = (sample.rollDeg * Math.PI) / 180;
      const rollMatrix = new THREE.Matrix4().makeRotationAxis(forward, rollRad);
      m.premultiply(rollMatrix);
    }

    object3D.rotation.setFromRotationMatrix(m);
  }
}
