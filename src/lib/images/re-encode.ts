import { encode } from 'blurhash';
import sharp from 'sharp';

import { MAX_IMAGE_EDGE_PX, MAX_IMAGE_INPUT_PIXELS, THUMBNAIL_EDGE_PX } from '@/config/uploads';

// The one way a photo becomes a public-media file (docs/PRD.md §8.8, docs/Security.md UPL-02): turned upright
// from its EXIF orientation, every metadata block dropped (sharp keeps none unless asked, so the camera, the
// time and any GPS position stay behind), shrunk to 1600 px on the long edge and written as WebP. The
// blurhash for the loading placeholder is taken at the same step. api/uploads/finalize (Task P2.9.01) and the
// development seed's --media option both go through here, so a demo photo is exactly what an upload becomes.

// sharp names the format it found in the file's own bytes, not in its name or declared type.
const ACCEPTED_INPUT_FORMATS = new Set(['jpeg', 'png', 'webp']);
const WEBP_QUALITY = 80;
// docs/StyleGuide.md §8.2: 4 × 3 components, computed from a small copy because more pixels add nothing.
const BLURHASH_COMPONENTS_X = 4;
const BLURHASH_COMPONENTS_Y = 3;
const BLURHASH_SAMPLE_EDGE_PX = 32;

export interface ReencodedImage {
  webp: Buffer;
  width: number;
  height: number;
  blurhash: string;
}

export class UnsupportedImageError extends Error {
  constructor(format: string) {
    super(`unsupported image format: ${format}`);
    this.name = 'UnsupportedImageError';
  }
}

async function blurhashOf(webp: Buffer): Promise<string> {
  const { data, info } = await sharp(webp)
    .resize(BLURHASH_SAMPLE_EDGE_PX, BLURHASH_SAMPLE_EDGE_PX, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return encode(
    new Uint8ClampedArray(data),
    info.width,
    info.height,
    BLURHASH_COMPONENTS_X,
    BLURHASH_COMPONENTS_Y,
  );
}

// failOn 'error' refuses a truncated or corrupt file instead of encoding whatever part of it decoded, and the
// pixel limit refuses a small file that would unpack into more pixels than any phone takes.
const DECODE_OPTIONS = { failOn: 'error', limitInputPixels: MAX_IMAGE_INPUT_PIXELS } as const;

export async function reencodeImage(input: Buffer): Promise<ReencodedImage> {
  const { format } = await sharp(input, DECODE_OPTIONS).metadata();
  if (!ACCEPTED_INPUT_FORMATS.has(format)) throw new UnsupportedImageError(format);

  const { data, info } = await sharp(input, DECODE_OPTIONS)
    .rotate()
    .resize(MAX_IMAGE_EDGE_PX, MAX_IMAGE_EDGE_PX, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });

  return { webp: data, width: info.width, height: info.height, blurhash: await blurhashOf(data) };
}

// The 480 px copy a gallery lists (galleries.thumbnail_path), made from the re-encoded WebP, which already
// carries no metadata.
export function thumbnailOf(webp: Buffer): Promise<Buffer> {
  return sharp(webp)
    .resize(THUMBNAIL_EDGE_PX, THUMBNAIL_EDGE_PX, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}
