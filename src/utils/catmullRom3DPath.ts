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

function haversineDistance(p1: { lng: number; lat: number }, p2: { lng: number; lat: number }): number {
  const R = 6371.0088; // WGS84 mean earth radius in km
  const dlat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dlng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dlat / 2) ** 2 +
    Math.cos((p1.lat * Math.PI) / 180) * Math.cos((p2.lat * Math.PI) / 180) * Math.sin(dlng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export class CatmullRom3DPath {
  private curve: THREE.CatmullRomCurve3 | null = null;
  private mercatorPoints: THREE.Vector3[] = [];
  private geoDistanceTable: number[] = [];
  private uTable: number[] = [];
  private totalGeoDistanceKm: number = 0;

  constructor(points: RoutePoint[]) {
    this.updatePoints(points);
  }

  public updatePoints(points: RoutePoint[]) {
    if (points.length < 2) {
      this.curve = null;
      this.mercatorPoints = [];
      this.geoDistanceTable = [];
      this.uTable = [];
      this.totalGeoDistanceKm = 0;
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

    this.buildDistanceLookup();
  }

  private sampleLngLatAt(u: number): { lng: number; lat: number } {
    if (!this.curve) return { lng: 0, lat: 0 };
    const pos = this.curve.getPointAt(Math.max(0, Math.min(1, u)));
    const lng = (pos.x - 0.5) * 360;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * pos.y)));
    const lat = (latRad * 180) / Math.PI;
    return { lng, lat };
  }

  private buildDistanceLookup() {
    if (!this.curve) {
      this.geoDistanceTable = [];
      this.uTable = [];
      this.totalGeoDistanceKm = 0;
      return;
    }
    const N = 1000;
    this.geoDistanceTable = new Array(N);
    this.uTable = new Array(N);
    this.geoDistanceTable[0] = 0;
    this.uTable[0] = 0;

    let accumulated = 0;
    let prev = this.sampleLngLatAt(0);

    for (let i = 1; i < N; i++) {
      const u = i / (N - 1);
      const curr = this.sampleLngLatAt(u);
      accumulated += haversineDistance(prev, curr);
      this.geoDistanceTable[i] = accumulated;
      this.uTable[i] = u;
      prev = curr;
    }
    this.totalGeoDistanceKm = accumulated;
  }

  public getSplineParameterAtDistanceProgress(pGeo: number): number {
    if (pGeo <= 0) return 0;
    if (pGeo >= 1) return 1;
    if (!this.curve || this.totalGeoDistanceKm <= 0) return pGeo;

    const targetDist = pGeo * this.totalGeoDistanceKm;

    let low = 0;
    let high = this.geoDistanceTable.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (this.geoDistanceTable[mid] < targetDist) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const i0 = Math.max(0, low - 1);
    const i1 = Math.min(this.geoDistanceTable.length - 1, low);
    if (i0 === i1) return this.uTable[i0];

    const span = this.geoDistanceTable[i1] - this.geoDistanceTable[i0];
    const frac = span > 0 ? (targetDist - this.geoDistanceTable[i0]) / span : 0;
    return this.uTable[i0] + frac * (this.uTable[i1] - this.uTable[i0]);
  }

  public getRemainingDistanceKm(pGeo: number): number {
    if (this.totalGeoDistanceKm <= 0) return 0;
    const clamped = Math.max(0, Math.min(1, pGeo));
    return Math.max(0, (1 - clamped) * this.totalGeoDistanceKm);
  }

  public getTotalDistanceKm(): number {
    return this.totalGeoDistanceKm;
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
