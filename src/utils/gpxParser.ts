import type { RoutePoint, MapSign, RouteStats } from '../types/index.ts';

export interface ParsedTrack {
  name: string;
  kind: 'track' | 'route';
  points: RoutePoint[];
  stats: RouteStats;
  originalCount: number;
}

export interface ParseResult {
  tracks: ParsedTrack[];
  signs: MapSign[];
}

export interface ParseOptions {
  importWaypoints?: boolean;
  createDayEndSigns?: boolean;
  maxPoints?: number;
}

const DEFAULT_MAX_POINTS = 15000; // Oct 29 changelog: More detail on long trips

function sampleIndices(length: number, maxCount = DEFAULT_MAX_POINTS): number[] {
  if (length <= maxCount) {
    return Array.from({ length }, (_, i) => i);
  }
  const step = Math.ceil(length / maxCount);
  const indices: number[] = [];
  for (let i = 0; i < length; i += step) {
    indices.push(i);
  }
  if (length && indices[indices.length - 1] !== length - 1) {
    indices.push(length - 1);
  }
  return indices;
}

export function generateDayEndSigns(tracks: ParsedTrack[]): MapSign[] {
  const signs: MapSign[] = [];
  if (tracks.length <= 1) return signs;

  tracks.forEach((track, idx) => {
    if (track.points.length === 0) return;
    const lastPoint = track.points[track.points.length - 1];
    signs.push({
      id: `day-end-${idx + 1}-${Date.now()}`,
      lng: lastPoint.lng,
      lat: lastPoint.lat,
      text: track.name || `Day ${idx + 1} End`,
      style: idx === tracks.length - 1 ? 'finish' : 'camp', // Oct 8 & 29 changelog
      triggerMode: 'onPassed',
      pauseSec: 2,
      size: 1.1,
    });
  });
  return signs;
}

export function haversineDistance(p1: { lng: number; lat: number }, p2: { lng: number; lat: number }): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (p1.lat * Math.PI) / 180;
  const phi2 = (p2.lat * Math.PI) / 180;
  const deltaPhi = ((p2.lat - p1.lat) * Math.PI) / 180;
  const deltaLambda = ((p2.lng - p1.lng) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function calculateTrackStats(points: RoutePoint[]): RouteStats {
  let distanceM = 0;
  let elevationGainM = 0;
  let elevationLossM = 0;
  let minEleM = Infinity;
  let maxEleM = -Infinity;

  let hasEle = false;
  let hasTime = false;
  let startTime = Infinity;
  let endTime = -Infinity;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];

    if (pt.ele !== undefined && Number.isFinite(pt.ele)) {
      hasEle = true;
      if (pt.ele < minEleM) minEleM = pt.ele;
      if (pt.ele > maxEleM) maxEleM = pt.ele;

      if (i > 0) {
        const prevEle = points[i - 1].ele;
        if (prevEle !== undefined && Number.isFinite(prevEle)) {
          const diff = pt.ele - prevEle;
          if (diff > 0) elevationGainM += diff;
          else elevationLossM += Math.abs(diff);
        }
      }
    }

    if (pt.time !== undefined && Number.isFinite(pt.time)) {
      hasTime = true;
      if (pt.time < startTime) startTime = pt.time;
      if (pt.time > endTime) endTime = pt.time;
    }

    if (i > 0) {
      distanceM += haversineDistance(points[i - 1], pt);
    }
  }

  const distanceKm = Math.round((distanceM / 1000) * 100) / 100;
  const durationSec = hasTime && endTime > startTime ? Math.round((endTime - startTime) / 1000) : undefined;
  const avgSpeedKmh =
    durationSec && durationSec > 0
      ? Math.round((distanceKm / (durationSec / 3600)) * 10) / 10
      : undefined;

  return {
    distanceKm,
    elevationGainM: hasEle ? Math.round(elevationGainM) : undefined,
    elevationLossM: hasEle ? Math.round(elevationLossM) : undefined,
    minEleM: hasEle && Number.isFinite(minEleM) ? Math.round(minEleM) : undefined,
    maxEleM: hasEle && Number.isFinite(maxEleM) ? Math.round(maxEleM) : undefined,
    durationSec,
    avgSpeedKmh,
  };
}

/**
 * Native ZIP parser for KMZ archives using browser DataView and DecompressionStream('deflate-raw')
 */
async function unpackKMZ(buffer: Uint8Array): Promise<string | null> {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let eocdOffset = -1;

  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) return null;

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  let cdOffset = view.getUint32(eocdOffset + 16, true);
  const files: Array<{ name: string; method: number; size: number; offset: number }> = [];

  for (let i = 0; i < totalEntries && view.getUint32(cdOffset, true) === 0x02014b50; i++) {
    const nameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const name = new TextDecoder().decode(buffer.subarray(cdOffset + 46, cdOffset + 46 + nameLen));
    files.push({
      name,
      method: view.getUint16(cdOffset + 10, true),
      size: view.getUint32(cdOffset + 20, true),
      offset: view.getUint32(cdOffset + 42, true),
    });
    cdOffset += 46 + nameLen + extraLen + commentLen;
  }

  const kmlFiles = files.filter((f) => /\.kml$/i.test(f.name));
  const mainKml = kmlFiles.find((f) => /(^|\/)doc\.kml$/i.test(f.name)) ?? kmlFiles[0];
  if (!mainKml) return null;

  const localHeaderOffset = mainKml.offset;
  const localNameLen = view.getUint16(localHeaderOffset + 26, true);
  const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
  const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
  const compressedData = buffer.subarray(dataStart, dataStart + mainKml.size);

  if (mainKml.method === 0) {
    return new TextDecoder().decode(compressedData);
  }
  if (mainKml.method === 8) {
    const blob = new Blob([compressedData]);
    const stream = blob.stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).text();
  }
  return null;
}

/**
 * GPX Parser (`<trk>`, `<rte>`, `<wpt>`)
 */
function parseGPX(xmlText: string): ParseResult {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const tracks: ParsedTrack[] = [];
  const signs: MapSign[] = [];

  // Parse Waypoints (`<wpt>`) as MapSigns
  const waypoints = Array.from(doc.getElementsByTagName('*')).filter((el) => el.localName === 'wpt');
  for (const wpt of waypoints) {
    const lon = parseFloat(wpt.getAttribute('lon') ?? '');
    const lat = parseFloat(wpt.getAttribute('lat') ?? '');
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      const name = Array.from(wpt.children).find((c) => c.localName === 'name')?.textContent?.trim() || 'Waypoint';
      signs.push({
        id: `wpt-${signs.length + 1}`,
        lng: lon,
        lat,
        text: name,
        style: 'pin',
        triggerMode: 'always',
        size: 1,
      });
    }
  }

  // Parse Tracks (`<trk>`) and Routes (`<rte>`)
  const trackNodes = Array.from(doc.getElementsByTagName('*')).filter(
    (el) => el.localName === 'trk' || el.localName === 'rte'
  );

  for (const node of trackNodes) {
    const isTrack = node.localName === 'trk';
    const targetTag = isTrack ? 'trkpt' : 'rtept';
    const ptNodes = Array.from(node.getElementsByTagName('*')).filter((el) => el.localName === targetTag);

    const rawPoints: RoutePoint[] = [];
    for (const ptEl of ptNodes) {
      const lon = parseFloat(ptEl.getAttribute('lon') ?? '');
      const lat = parseFloat(ptEl.getAttribute('lat') ?? '');
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

      const getChildText = (tag: string) =>
        Array.from(ptEl.children).find((c) => c.localName === tag)?.textContent?.trim();

      const eleStr = getChildText('ele');
      const timeStr = getChildText('time');
      const ele = eleStr ? parseFloat(eleStr) : undefined;
      const time = timeStr ? Date.parse(timeStr) : undefined;

      rawPoints.push({
        lng: lon,
        lat,
        ele: Number.isFinite(ele) ? ele : undefined,
        time: Number.isFinite(time) ? time : undefined,
      });
    }

    if (rawPoints.length < 2) continue;

    const sampleMap = sampleIndices(rawPoints.length);
    const sampledPoints = sampleMap.map((idx) => rawPoints[idx]);
    const trackName =
      Array.from(node.children).find((c) => c.localName === 'name')?.textContent?.trim() ||
      `${isTrack ? 'Track' : 'Route'} ${tracks.length + 1}`;

    tracks.push({
      name: trackName,
      kind: isTrack ? 'track' : 'route',
      points: sampledPoints,
      stats: calculateTrackStats(rawPoints),
      originalCount: rawPoints.length,
    });
  }

  return { tracks, signs };
}

/**
 * KML Parser (`<Placemark>`, `<LineString>`, `<Track>`, `<Point>`)
 */
function parseKML(xmlText: string): ParseResult {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const tracks: ParsedTrack[] = [];
  const signs: MapSign[] = [];

  const placemarks = Array.from(doc.getElementsByTagName('*')).filter((el) => el.localName === 'Placemark');

  for (const pm of placemarks) {
    const name = Array.from(pm.children).find((c) => c.localName === 'name')?.textContent?.trim() || '';
    const pointEl = Array.from(pm.getElementsByTagName('*')).find((el) => el.localName === 'Point');
    const lineStrings = Array.from(pm.getElementsByTagName('*')).filter((el) => el.localName === 'LineString');
    const trackEls = Array.from(pm.getElementsByTagName('*')).filter((el) => el.localName === 'Track');

    // Standalone Point Placemark
    if (pointEl && lineStrings.length === 0 && trackEls.length === 0) {
      const coordText =
        Array.from(pointEl.getElementsByTagName('*')).find((c) => c.localName === 'coordinates')
          ?.textContent?.trim() || '';
      const [lon, lat] = coordText.split(',').map(Number);
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        signs.push({
          id: `pin-${signs.length + 1}`,
          lng: lon,
          lat,
          text: name || 'Pin',
          style: 'pin',
          triggerMode: 'always',
          size: 1,
        });
      }
      continue;
    }

    // LineStrings
    const rawPoints: RoutePoint[] = [];
    for (const ls of lineStrings) {
      const coordEl = Array.from(ls.getElementsByTagName('*')).find((el) => el.localName === 'coordinates');
      if (coordEl && coordEl.textContent) {
        const tokens = coordEl.textContent.trim().split(/\s+/);
        for (const tok of tokens) {
          const parts = tok.split(',').map(Number);
          if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
            rawPoints.push({
              lng: parts[0],
              lat: parts[1],
              ele: Number.isFinite(parts[2]) ? parts[2] : undefined,
            });
          }
        }
      }
    }

    // gx:Track
    for (const trk of trackEls) {
      const whens = Array.from(trk.getElementsByTagName('*'))
        .filter((el) => el.localName === 'when')
        .map((el) => Date.parse(el.textContent?.trim() ?? ''));
      const coords = Array.from(trk.getElementsByTagName('*'))
        .filter((el) => el.localName === 'coord')
        .map((el) => (el.textContent ?? '').trim().split(/\s+/).map(Number));

      coords.forEach((coord, i) => {
        if (coord.length >= 2 && Number.isFinite(coord[0]) && Number.isFinite(coord[1])) {
          rawPoints.push({
            lng: coord[0],
            lat: coord[1],
            ele: Number.isFinite(coord[2]) ? coord[2] : undefined,
            time: Number.isFinite(whens[i]) ? whens[i] : undefined,
          });
        }
      });
    }

    if (rawPoints.length >= 2) {
      const sampleMap = sampleIndices(rawPoints.length);
      const sampled = sampleMap.map((idx) => rawPoints[idx]);
      tracks.push({
        name: name || `Track ${tracks.length + 1}`,
        kind: 'track',
        points: sampled,
        stats: calculateTrackStats(rawPoints),
        originalCount: rawPoints.length,
      });
    }
  }

  return { tracks, signs };
}

/**
 * IGC Glider Flight Log Parser (B-records)
 */
function parseIGC(text: string, filename = 'Flight.igc'): ParseResult {
  const dateMatch = /^HFDTE(?:DATE:)?(\d{2})(\d{2})(\d{2})/m.exec(text);
  const baseDate = dateMatch
    ? Date.UTC(2000 + Number(dateMatch[3]), Number(dateMatch[2]) - 1, Number(dateMatch[1]))
    : Date.now();

  const points: RoutePoint[] = [];
  let prevSec = -1;
  let dayOffsetSec = 0;

  for (const match of text.matchAll(
    /^B(\d{2})(\d{2})(\d{2})(\d{2})(\d{5})([NS])(\d{3})(\d{5})([EW])(?:[AV](\d{5}|-\d{4})(\d{5}|-\d{4}))?/gm
  )) {
    let lat = Number(match[4]) + Number(match[5]) / 60000;
    let lon = Number(match[7]) + Number(match[8]) / 60000;
    if (match[6] === 'S') lat = -lat;
    if (match[9] === 'W') lon = -lon;
    if (lat === 0 && lon === 0) continue;

    const sec = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    if (sec < prevSec) dayOffsetSec += 86400;
    prevSec = sec;

    const gpsAlt = match[11] ? Number(match[11]) : undefined;
    const baroAlt = match[10] ? Number(match[10]) : undefined;
    const ele = gpsAlt ?? baroAlt;

    points.push({
      lng: lon,
      lat,
      ele: ele && Number.isFinite(ele) ? ele : undefined,
      time: baseDate + (sec + dayOffsetSec) * 1000,
    });
  }

  if (points.length < 2) return { tracks: [], signs: [] };

  const pilot = /^HFPLT[^:]*:(.*)$/m.exec(text)?.[1]?.trim();
  const name = pilot || filename.replace(/\.igc$/i, '') || 'Flight Log';

  const sampleMap = sampleIndices(points.length);
  const sampled = sampleMap.map((idx) => points[idx]);

  return {
    tracks: [
      {
        name,
        kind: 'track',
        points: sampled,
        stats: calculateTrackStats(points),
        originalCount: points.length,
      },
    ],
    signs: [],
  };
}

/**
 * Universal Route File Importer (.gpx, .kml, .kmz, .igc)
 */
export async function parseRouteFile(file: File, options?: ParseOptions): Promise<ParseResult> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let result: ParseResult = { tracks: [], signs: [] };

  // Check for ZIP magic number (PK\x03\x04 or 80, 75)
  if (buffer[0] === 80 && buffer[1] === 75) {
    const kmlContent = await unpackKMZ(buffer);
    if (kmlContent) {
      result = parseKML(kmlContent);
    }
  } else {
    const text = new TextDecoder().decode(buffer);

    if (/<kml[\s>]/i.test(text.slice(0, 2000))) {
      result = parseKML(text);
    } else if (/^(\uFEFF)?A/m.test(text) && /^B\d{6}\d{7}[NS]\d{8}[EW]/m.test(text)) {
      result = parseIGC(text, file.name);
    } else {
      // Default to GPX XML
      result = parseGPX(text);
    }
  }

  // Filter waypoints if requested
  if (options?.importWaypoints === false) {
    result.signs = [];
  }

  // Oct 29 changelog: A sign at each day's end for multi-track trips
  if (options?.createDayEndSigns && result.tracks.length > 1) {
    const daySigns = generateDayEndSigns(result.tracks);
    result.signs = [...result.signs, ...daySigns];
  }

  return result;
}
