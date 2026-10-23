import { galleryItemAnchor } from '@/lib/utils/gallery-search';
import { PUBLIC_PATHS } from '@/lib/utils/paths';
import type { GalleryItem } from '@/types/gallery';
import type { PublicImage } from '@/types/media';

// A photo of the home gallery strip: a captioned photo (docs/StyleGuide.md §1.3 G8) that opens where it sits in
// /galeri.
export interface HomeGalleryPhoto {
  id: string;
  image: PublicImage;
  caption: string;
  href: string;
}

// The strip shows photos only, each with its caption; a video or an uncaptioned photo stays for /galeri. The
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
              image: item.image,
              caption: item.caption,
              href: `${PUBLIC_PATHS.gallery}#${galleryItemAnchor(index + 1)}`,
            },
          ]
        : [],
    )
    .slice(0, limit);
}
