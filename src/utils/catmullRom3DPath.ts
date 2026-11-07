import * as THREE from 'three';
import maplibregl from 'maplibre-gl';
import type { RoutePoint } from '../types';

export interface PathSample3D {
  position: THREE.Vector3; // WebGL Mercator units
  tangent: THREE.Vector3;  // Normalized forward vector
  up: THREE.Vector3;       // Normal vector perpendicular to ground
  headingDeg: number;      // 0 = North, 90 = East
  pitchDeg: number;        // Elevation incline angle
  rollDeg: number;         // Banking roll into curves
  worldPoint: [number, number, number]; // [lng, lat, alt]
}

export class CatmullRom3DPath {
  private curve: THREE.CatmullRomCurve3 | null = null;
  private mercatorPoints: THREE.Vector3[] = [];

  constructor(points: RoutePoint[]) {
    this.updatePoints(points);
  }

  public updatePoints(points: RoutePoint[]) {
    if (points.length < 2) {
      this.curve = null;
      this.mercatorPoints = [];
      return;
    }

    this.mercatorPoints = points.map((p) => {
      const coord = maplibregl.MercatorCoordinate.fromLngLat(
        { lng: p.lng, lat: p.lat },
        p.ele || 0
      );
      return new THREE.Vector3(coord.x, coord.y, coord.z);
    });

    this.curve = new THREE.CatmullRomCurve3(
      this.mercatorPoints,
      false, // not closed
      'centripetal', // avoids cusps and self-intersections
      0.5
    );
  }

  public isValid(): boolean {
    return this.curve !== null && this.mercatorPoints.length >= 2;
  }

  /**
   * Sample position, tangent, heading, and banking at normalized progress t [0, 1]
   */
  public sample(t: number): PathSample3D | null {
    if (!this.curve) return null;
    const clampedT = Math.max(0, Math.min(1, t));

    const pos = this.curve.getPointAt(clampedT);
    const tangent = this.curve.getTangentAt(clampedT).normalize();

    // MapLibre Mercator coordinates:
    // +X is East, +Y is South, +Z is Up (into altitude)
    // Tangent dx (East), dy (South):
    // In MapLibre bearing: 0 is North (-Y), 90 is East (+X)
    const headingRad = Math.atan2(tangent.x, -tangent.y);
    const headingDeg = (headingRad * 180) / Math.PI;

    // Pitch angle: incline along Z
    const horizontalLen = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);
    const pitchRad = Math.atan2(tangent.z, horizontalLen);
    const pitchDeg = (pitchRad * 180) / Math.PI;

    // Curvature & Banking / Roll:
    // Estimate lateral acceleration by sampling tangent slightly ahead and behind
    const deltaT = 0.01;
    const tAhead = Math.min(1, clampedT + deltaT);
    const tBehind = Math.max(0, clampedT - deltaT);
    const tangAhead = this.curve.getTangentAt(tAhead);
    const tangBehind = this.curve.getTangentAt(tBehind);
    const dTang = tangAhead.clone().sub(tangBehind);

    // Cross product with Up (0, 0, 1) to find lateral curvature
    const up = new THREE.Vector3(0, 0, 1);
    const lateral = new THREE.Vector3().crossVectors(tangent, up).normalize();
    const lateralCurvature = dTang.dot(lateral);
    // Smooth bank angle limited to +/- 25 degrees
    const rollDeg = Math.max(-25, Math.min(25, -lateralCurvature * 2200));

    // Convert Mercator back to approximate LngLat
    // World coordinates bounds [0, 1]
    const lng = (pos.x - 0.5) * 360;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * pos.y)));
    const lat = (latRad * 180) / Math.PI;
    const alt = pos.z;

    return {
      position: pos,
      tangent,
      up,
      headingDeg,
      pitchDeg,
      rollDeg,
      worldPoint: [lng, lat, alt],
    };
  }

  /**
   * Generate an extruded 3D ribbon path geometry up to progress t [0, 1]
   */
  public generateRibbonGeometry(
    progress: number,
    halfWidthMercator: number,
    numSubdivisions: number = 200
  ): { innerPositions: Float32Array; outerPositions: Float32Array; count: number } {
    if (!this.curve || progress <= 0) {
      return {
        innerPositions: new Float32Array(0),
        outerPositions: new Float32Array(0),
        count: 0,
      };
    }

    const maxSteps = Math.max(2, Math.floor(numSubdivisions * progress));
    const innerArr = new Float32Array(maxSteps * 2 * 3); // 2 vertices per step (left & right), 3 floats
    const outerArr = new Float32Array(maxSteps * 2 * 3);
    const up = new THREE.Vector3(0, 0, 1);

    for (let i = 0; i < maxSteps; i++) {
      const t = (i / (maxSteps - 1)) * progress;
      const pt = this.curve.getPointAt(t);
      const tang = this.curve.getTangentAt(t).normalize();
      const norm = new THREE.Vector3().crossVectors(tang, up).normalize();

      // Outer border width (slightly wider)
      const outerWidth = halfWidthMercator * 1.35;
      const innerWidth = halfWidthMercator;

      const pIdx = i * 6;
      // Outer Left
      outerArr[pIdx] = pt.x - norm.x * outerWidth;
      outerArr[pIdx + 1] = pt.y - norm.y * outerWidth;
      outerArr[pIdx + 2] = pt.z + 0.0000001; // tiny offset to avoid z-fighting

      // Outer Right
      outerArr[pIdx + 3] = pt.x + norm.x * outerWidth;
      outerArr[pIdx + 4] = pt.y + norm.y * outerWidth;
      outerArr[pIdx + 5] = pt.z + 0.0000001;

      // Inner Left
      innerArr[pIdx] = pt.x - norm.x * innerWidth;
      innerArr[pIdx + 1] = pt.y - norm.y * innerWidth;
      innerArr[pIdx + 2] = pt.z + 0.0000002;

      // Inner Right
      innerArr[pIdx + 3] = pt.x + norm.x * innerWidth;
      innerArr[pIdx + 4] = pt.y + norm.y * innerWidth;
      innerArr[pIdx + 5] = pt.z + 0.0000002;
    }

    return {
      innerPositions: innerArr,
      outerPositions: outerArr,
      count: maxSteps,
    };
  }
}
