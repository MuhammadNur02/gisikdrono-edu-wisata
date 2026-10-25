import type { RwId } from '@/config/rw';
import { galleryItemAnchor } from '@/lib/utils/gallery-search';
import { PUBLIC_PATHS } from '@/lib/utils/paths';
import type { GalleryItem } from '@/types/gallery';
import type { PublicImage } from '@/types/media';

// A photo of the home gallery marquee: a captioned photo (docs/StyleGuide.md §1.3 G8) that opens where it sits in
// /galeri.
export interface HomeGalleryPhoto {
  id: string;
  // NULL: a kelurahan photo rather than one RW's.
  rwId: RwId | null;
  image: PublicImage;
  caption: string;
  href: string;
}

// The marquee shows photos only, each with its caption; a video or an uncaptioned photo stays for /galeri. The
// anchor counts every item of the first /galeri page, as MasonryGrid numbers them, so a photo links to its own
// tile there.
export function pickHomeGalleryPhotos(
  items: readonly GalleryItem[],
  limit: number,
): HomeGalleryPhoto[] {
  return items
    .flatMap((item, index) =>
      item.mediaType === 'image' && item.image && item.caption
        ? [
            {
              id: item.id,
              rwId: item.rwId,
              image: item.image,
              caption: item.caption,
              href: `${PUBLIC_PATHS.gallery}#${galleryItemAnchor(index + 1)}`,
            },
          ]
        : [],
    )
    .slice(0, limit);
}

export interface HomePhotoSplit {
  band: HomeGalleryPhoto | null;
  strip: HomeGalleryPhoto[];
}

// DESIGN-SPEC §3.1: the parallax band speaks of Javanese tradition, so it takes the first photo of the RW that runs the
// performances when there is one, else the first photo; the marquee shows the others.
export function splitHomePhotos(
  photos: readonly HomeGalleryPhoto[],
  cultureRwId: RwId | null,
): HomePhotoSplit {
  const band = photos.find((photo) => photo.rwId === cultureRwId) ?? photos[0] ?? null;
  return { band, strip: photos.filter((photo) => photo !== band) };
}
