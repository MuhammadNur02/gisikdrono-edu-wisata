import 'server-only';

import { isRwId, type RwId } from '@/config/rw';
import { blurhashToColour } from '@/lib/images/blur';
import type { PublicImage } from '@/types/media';

// Small conversions every public query shares on its way from a row to a DTO.

// What the upload pipeline stored next to a gallery image; other tables keep only the path.
export interface StoredImageSize {
  width: number | null;
  height: number | null;
  blurhash: string | null;
}

const UNKNOWN_SIZE: StoredImageSize = { width: null, height: null, blurhash: null };

export function toPublicImage(
  path: string | null,
  alt: string,
  size: StoredImageSize = UNKNOWN_SIZE,
): PublicImage | null {
  if (!path) return null;
  return {
    path,
    alt,
    width: size.width,
    height: size.height,
    placeholderColour: blurhashToColour(size.blurhash),
  };
}

// tour_packages.image_paths, products_umkm.image_paths: the first one is the cover.
export function toPublicImages(paths: string[], alt: string): PublicImage[] {
  return paths.flatMap((path) => toPublicImage(path, alt) ?? []);
}

// An RW the site has no page, colours or labels for (src/config/rw.ts) cannot be shown correctly, so a row
// pointing at one is a data problem to surface, not to hide.
export function toRwId(value: number): RwId {
  if (!isRwId(value)) throw new Error(`rw_id ${String(value)} is not an RW the site knows`);
  return value;
}

export function toOptionalRwId(value: number | null): RwId | null {
  return value === null ? null : toRwId(value);
}
