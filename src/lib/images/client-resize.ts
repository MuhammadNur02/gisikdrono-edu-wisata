import {
  ACCEPTED_IMAGE_TYPES,
  HEIF_EXTENSIONS,
  HEIF_TYPES,
  LEADING_BYTES_LENGTH,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_EDGE_PX,
} from '@/config/uploads';
import { isHeifSignature } from '@/lib/uploads/heif';

export type ImageFileProblem = 'svg' | 'heic' | 'type' | 'size';

const WEBP_QUALITY = 0.9;

function isAcceptedType(type: string): type is (typeof ACCEPTED_IMAGE_TYPES)[number] {
  return ACCEPTED_IMAGE_TYPES.some((accepted) => accepted === type);
}

function hasHeifName(name: string): boolean {
  const lowerName = name.toLowerCase();
  return HEIF_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

// The quick browser-side answer before anything is uploaded. SVG and HEIC get their own messages because
// people expect them to work (docs/StyleGuide.md §5.6); the server re-checks the bytes regardless.
export function checkImageFile(file: {
  name: string;
  type: string;
  size: number;
}): ImageFileProblem | null {
  if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) return 'svg';
  if (HEIF_TYPES.includes(file.type) || hasHeifName(file.name)) return 'heic';
  if (!isAcceptedType(file.type)) return 'type';
  if (file.size > MAX_IMAGE_BYTES) return 'size';
  return null;
}

// A HEIC photo renamed to .jpg passes the check above; its first bytes still say ftypheic. Looked at before
// the photo is shrunk, because Safari can decode HEIC and would otherwise turn it into a WebP unnoticed.
export async function checkImageBytes(file: Blob): Promise<ImageFileProblem | null> {
  const leadingBytes = new Uint8Array(await file.slice(0, LEADING_BYTES_LENGTH).arrayBuffer());
  return isHeifSignature(leadingBytes) ? 'heic' : null;
}

// Scales width and height down so the longer edge is at most maxEdge, keeping the aspect ratio.
export function fitWithin(width: number, height: number, maxEdge: number = MAX_IMAGE_EDGE_PX) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// Shrinks a large photo to 1600 px before upload so slow connections send less; the server re-encodes
// anyway (strip EXIF, WebP), so this only saves bandwidth. Small images go up untouched.
export async function resizeImageForUpload(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const size = fitWithin(bitmap.width, bitmap.height);
  if (size.width === bitmap.width && size.height === bitmap.height) {
    bitmap.close();
    return file;
  }
  const canvas = new OffscreenCanvas(size.width, size.height);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/webp', quality: WEBP_QUALITY });
}
