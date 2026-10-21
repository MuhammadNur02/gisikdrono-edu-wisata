import type { EnumValue } from '@/db/enums';
import type { PublicImage } from '@/types/media';
import type { RwBadge } from '@/types/rw-unit';

export interface BookletSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  kind: EnumValue<'booklet_kind'>;
  rw: RwBadge | null;
  cover: PublicImage | null;
  pageCount: number | null;
  fileSizeBytes: number | null;
  publishedAt: string | null;
}

export interface BookletDetail extends BookletSummary {
  // public-media paths: the PDF, and the pre-rendered pages (…/pages/0001.webp …) the flipbook shows, empty
  // until the pages are uploaded.
  pdfPath: string;
  pagePaths: string[];
}

export interface BookletDownload {
  id: string;
  slug: string;
  pdfPath: string;
}
