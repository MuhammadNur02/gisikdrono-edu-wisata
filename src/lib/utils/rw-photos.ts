import type { GalleryItem } from '@/types/gallery';
import type { PublicImage } from '@/types/media';

// A gallery photo an RW page places beside its profile, its points or in its mosaic (DESIGN-SPEC §3.3).
export interface RwGalleryPhoto {
  id: string;
  image: PublicImage;
  // The caption, or the alt text when the photo has none (docs/StyleGuide.md §1.3 G8).
  caption: string;
}

export interface RwPhotoPlan {
  // The pair under the profile.
  profile: RwGalleryPhoto[];
  // The tall photo beside the activity points; NULL when none is left.
  points: RwGalleryPhoto | null;
  // The gallery mosaic.
  mosaic: RwGalleryPhoto[];
}

const PROFILE_PHOTOS = 2;
// The mosaic needs at least this many to look like one; with fewer, every photo goes to it instead.
const MIN_MOSAIC = 3;

export function rwGalleryPhotos(items: readonly GalleryItem[]): RwGalleryPhoto[] {
  return items.flatMap((item) =>
    item.mediaType === 'image' && item.image
      ? [{ id: item.id, image: item.image, caption: item.caption ?? item.alt }]
      : [],
  );
}

// Each photo shows once: two beside the profile, one beside the points, the rest in the mosaic. A short gallery keeps
// its mosaic first, since that section exists to show the photos.
export function planRwPhotos(photos: readonly RwGalleryPhoto[]): RwPhotoPlan {
  const placed = PROFILE_PHOTOS + 1;
  if (photos.length - placed < MIN_MOSAIC) {
    return { profile: [], points: null, mosaic: [...photos] };
  }
  return {
    profile: photos.slice(0, PROFILE_PHOTOS),
    points: photos[PROFILE_PHOTOS] ?? null,
    mosaic: photos.slice(placed),
  };
}
