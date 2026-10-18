import { CaptionedPhoto } from '@/components/marketing/photo';
import { IMAGE_SIZES } from '@/config/images';
import type { GalleryItem } from '@/types/gallery';

export interface GalleryPreviewProps {
  items: readonly GalleryItem[];
}

// The masonry of docs/StyleGuide.md §5.11 without its lightbox and paging, which the full gallery adds
// (Task P2.6.01). Photos keep their own proportions and every one carries its caption (§1.3 G8).
export function GalleryPreview({ items }: GalleryPreviewProps) {
  return (
    <ul className="columns-2 gap-4 md:columns-3 lg:columns-4">
      {items.map((item) => (
        <li key={item.id} className="mb-4 break-inside-avoid">
          <CaptionedPhoto
            image={item.image}
            caption={item.caption ?? item.image.alt}
            sizes={IMAGE_SIZES.thumb}
          />
        </li>
      ))}
    </ul>
  );
}
