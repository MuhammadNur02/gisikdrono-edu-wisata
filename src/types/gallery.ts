import type { RwId } from '@/config/rw';
import type { EnumValue } from '@/db/enums';
import type { PublicImage } from '@/types/media';

export interface GalleryItem {
  id: string;
  // NULL: a kelurahan photo rather than one RW's.
  rwId: RwId | null;
  category: EnumValue<'gallery_category'>;
  mediaType: EnumValue<'media_type'>;
  // For a video, the still the grid shows under the play glyph.
  image: PublicImage;
  caption: string | null;
  videoUrl: string | null;
  takenAt: string | null;
}

export interface GalleryPage {
  items: GalleryItem[];
  hasMore: boolean;
}
