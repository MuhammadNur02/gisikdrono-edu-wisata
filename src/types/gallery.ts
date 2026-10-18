import type { RwId } from '@/config/rw';
import type { EnumValue } from '@/db/enums';
import type { YoutubeVideoId } from '@/lib/utils/youtube';
import type { PublicImage } from '@/types/media';

export interface GalleryItem {
  id: string;
  // NULL: a kelurahan photo rather than one RW's.
  rwId: RwId | null;
  category: EnumValue<'gallery_category'>;
  mediaType: EnumValue<'media_type'>;
  alt: string;
  // The photo, or for a video the still a staff member uploaded (`thumbnail_path`); NULL for a video
  // without one, which then shows YouTube's own still.
  image: PublicImage | null;
  // Set for every video: the only part of `video_url` that leaves the server (src/lib/utils/youtube.ts).
  youtubeId: YoutubeVideoId | null;
  caption: string | null;
  takenAt: string | null;
}

export interface GalleryPage {
  items: GalleryItem[];
  hasMore: boolean;
}

// /galeri shows every page up to the one in `?halaman=`.
export interface GalleryPages extends GalleryPage {
  // How many pages exist up to the one asked for: fewer when the gallery ends sooner.
  pageCount: number;
}
