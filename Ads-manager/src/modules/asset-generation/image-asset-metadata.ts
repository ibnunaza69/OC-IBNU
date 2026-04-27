import { AppError } from '../../lib/errors.js';

interface ImageAssetMetadata {
  mimeType: string | null;
  width: number | null;
  height: number | null;
  byteSize: number | null;
  thumbnailUrl: string | null;
  sourceUrl: string;
  filename: string | null;
}

function readAscii(buffer: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...buffer.slice(start, end));
}

function parsePng(buffer: Uint8Array) {
  if (buffer.length < 24) {
    return null;
  }

  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const matches = signature.every((value, index) => buffer.at(index) === value);
  if (!matches) {
    return null;
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return {
    mimeType: 'image/png',
    width: view.getUint32(16),
    height: view.getUint32(20)
  };
}

function parseGif(buffer: Uint8Array) {
  if (buffer.length < 10) {
    return null;
  }

  const header = readAscii(buffer, 0, 6);
  if (header !== 'GIF87a' && header !== 'GIF89a') {
    return null;
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return {
    mimeType: 'image/gif',
    width: view.getUint16(6, true),
    height: view.getUint16(8, true)
  };
}

function parseJpeg(buffer: Uint8Array) {
  if (buffer.length < 4 || buffer.at(0) !== 0xff || buffer.at(1) !== 0xd8) {
    return null;
  }

  let offset = 2;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  while (offset + 9 < buffer.length) {
    const prefix = buffer.at(offset);
    if (prefix !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer.at(offset + 1);
    if (marker === undefined) {
      break;
    }

    const segmentLength = view.getUint16(offset + 2);
    const isSof = (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf);

    if (isSof) {
      return {
        mimeType: 'image/jpeg',
        width: view.getUint16(offset + 7),
        height: view.getUint16(offset + 5)
      };
    }

    if (segmentLength < 2) {
      break;
    }

    offset += 2 + segmentLength;
  }

  return {
    mimeType: 'image/jpeg',
    width: null,
    height: null
  };
}

function parseWebp(buffer: Uint8Array) {
  if (buffer.length < 30) {
    return null;
  }

  const riff = readAscii(buffer, 0, 4);
  const webp = readAscii(buffer, 8, 12);
  if (riff !== 'RIFF' || webp !== 'WEBP') {
    return null;
  }

  const chunk = readAscii(buffer, 12, 16);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  if (chunk === 'VP8X') {
    const widthMinusOne = view.getUint8(24) | (view.getUint8(25) << 8) | (view.getUint8(26) << 16);
    const heightMinusOne = view.getUint8(27) | (view.getUint8(28) << 8) | (view.getUint8(29) << 16);
    return {
      mimeType: 'image/webp',
      width: widthMinusOne + 1,
      height: heightMinusOne + 1
    };
  }

  if (chunk === 'VP8 ') {
    const width = view.getUint8(26) | ((view.getUint8(27) & 0x3f) << 8);
    const height = view.getUint8(28) | ((view.getUint8(29) & 0x3f) << 8);
    return {
      mimeType: 'image/webp',
      width,
      height
    };
  }

  if (chunk === 'VP8L' && buffer.length >= 25) {
    const b0 = view.getUint8(21);
    const b1 = view.getUint8(22);
    const b2 = view.getUint8(23);
    const b3 = view.getUint8(24);
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return {
      mimeType: 'image/webp',
      width,
      height
    };
  }

  return {
    mimeType: 'image/webp',
    width: null,
    height: null
  };
}

function detectImageMetadata(buffer: Uint8Array) {
  return parsePng(buffer) ?? parseGif(buffer) ?? parseJpeg(buffer) ?? parseWebp(buffer) ?? null;
}

function getFilenameFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split('/').filter(Boolean);
    const name = parts.length > 0 ? parts[parts.length - 1] : null;
    return name && name.trim().length > 0 ? name : null;
  } catch {
    return null;
  }
}

export async function fetchImageAssetMetadata(url: string): Promise<ImageAssetMetadata> {
  let response: Response;

  try {
    response = await fetch(url);
  } catch (error) {
    throw new AppError('Failed to fetch image asset for metadata enrichment', 'REMOTE_TEMPORARY_FAILURE', 502, {
      url,
      error: error instanceof Error ? error.message : 'Unknown fetch error'
    });
  }

  if (!response.ok) {
    throw new AppError('Image asset fetch returned non-success response', 'REMOTE_TEMPORARY_FAILURE', 502, {
      url,
      status: response.status,
      statusText: response.statusText
    });
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const detected = detectImageMetadata(bytes);

  return {
    mimeType: detected?.mimeType ?? response.headers.get('content-type')?.split(';')[0]?.trim() ?? null,
    width: detected?.width ?? null,
    height: detected?.height ?? null,
    byteSize: bytes.byteLength,
    thumbnailUrl: url,
    sourceUrl: url,
    filename: getFilenameFromUrl(url)
  };
}
