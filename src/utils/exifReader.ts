/**
 * Pure TypeScript EXIF GPS metadata reader for JPEG photos.
 * Extracts latitude, longitude, and altitude directly in the browser with zero external dependencies.
 */

export interface ExifGpsData {
  lat: number;
  lng: number;
  alt?: number;
  dateTime?: string;
}

export async function extractExifGps(file: File): Promise<ExifGpsData | null> {
  try {
    const buffer = await file.slice(0, 128 * 1024).arrayBuffer();
    const view = new DataView(buffer);

    // Verify JPEG SOI marker (0xFFD8)
    if (view.getUint16(0) !== 0xffd8) return null;

    let offset = 2;
    while (offset < view.byteLength - 4) {
      const marker = view.getUint16(offset);
      offset += 2;

      // APP1 Marker (0xFFE1) contains EXIF
      if (marker === 0xffe1) {
        const length = view.getUint16(offset);
        const exifHeader = view.getUint32(offset + 2);
        // "Exif\0\0" = 0x45786966
        if (exifHeader === 0x45786966) {
          const tiffStart = offset + 8;
          return parseTiffGps(view, tiffStart);
        }
        offset += length;
      } else if ((marker & 0xff00) === 0xff00 && marker !== 0xff00) {
        // Skip other markers
        const length = view.getUint16(offset);
        offset += length;
      } else {
        break;
      }
    }
  } catch (err) {
    console.warn('Could not read EXIF data:', err);
  }

  return null;
}

function parseTiffGps(view: DataView, tiffStart: number): ExifGpsData | null {
  const endianness = view.getUint16(tiffStart);
  const isLittle = endianness === 0x4949; // "II" vs "MM"

  const firstIfdOffset = view.getUint32(tiffStart + 4, isLittle);
  let ifdOffset = tiffStart + firstIfdOffset;

  let gpsIfdOffset = -1;
  const numEntries = view.getUint16(ifdOffset, isLittle);
  ifdOffset += 2;

  for (let i = 0; i < numEntries; i++) {
    const tag = view.getUint16(ifdOffset, isLittle);
    if (tag === 0x8825) {
      // GPS IFD Pointer
      gpsIfdOffset = view.getUint32(ifdOffset + 8, isLittle);
      break;
    }
    ifdOffset += 12;
  }

  if (gpsIfdOffset < 0) return null;

  const gpsOffset = tiffStart + gpsIfdOffset;
  const gpsNumEntries = view.getUint16(gpsOffset, isLittle);
  let cur = gpsOffset + 2;

  let latRef = 'N';
  let lngRef = 'E';
  let latDegrees: number[] | null = null;
  let lngDegrees: number[] | null = null;
  let alt: number | undefined;

  const readRational = (ptr: number) => {
    const num = view.getUint32(ptr, isLittle);
    const den = view.getUint32(ptr + 4, isLittle);
    return den ? num / den : 0;
  };

  for (let i = 0; i < gpsNumEntries; i++) {
    const tag = view.getUint16(cur, isLittle);
    const valOffset = tiffStart + view.getUint32(cur + 8, isLittle);

    if (tag === 1) {
      latRef = String.fromCharCode(view.getUint8(cur + 8));
    } else if (tag === 2) {
      latDegrees = [
        readRational(valOffset),
        readRational(valOffset + 8),
        readRational(valOffset + 16),
      ];
    } else if (tag === 3) {
      lngRef = String.fromCharCode(view.getUint8(cur + 8));
    } else if (tag === 4) {
      lngDegrees = [
        readRational(valOffset),
        readRational(valOffset + 8),
        readRational(valOffset + 16),
      ];
    } else if (tag === 6) {
      alt = readRational(valOffset);
    }

    cur += 12;
  }

  if (!latDegrees || !lngDegrees) return null;

  let lat = latDegrees[0] + latDegrees[1] / 60 + latDegrees[2] / 3600;
  let lng = lngDegrees[0] + lngDegrees[1] / 60 + lngDegrees[2] / 3600;

  if (latRef === 'S') lat = -lat;
  if (lngRef === 'W') lng = -lng;

  return {
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    alt: alt ? Math.round(alt) : undefined,
  };
}
