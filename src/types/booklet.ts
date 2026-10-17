import type { RwId } from '@/config/rw';
import type { EnumValue } from '@/db/enums';
import type { PublicImage } from '@/types/media';

export interface BookletSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  kind: EnumValue<'booklet_kind'>;
  rwId: RwId | null;
  cover: PublicImage | null;
  pageCount: number | null;
  fileSizeBytes: number | null;
  publishedAt: string | null;
}

export interface BookletDetail extends BookletSummary {
  // public-media paths: the PDF and the folder of pre-rendered pages (0001.webp …) the flipbook shows.
  pdfPath: string;
  pageImagesPrefix: string | null;
}
