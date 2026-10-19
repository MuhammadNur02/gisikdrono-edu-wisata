import type { RwId } from '@/config/rw';
import type { EnumValue } from '@/db/enums';
import type { Json } from '@/db/types';
import type { PublicImage } from '@/types/media';

export interface ArticleSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  category: EnumValue<'article_category'>;
  // NULL: written by the Edu Center or the kelurahan rather than by one RW.
  rwId: RwId | null;
  tags: string[];
  cover: PublicImage | null;
  publishedAt: string | null;
  readingMinutes: number | null;
}

export interface ArticleDetail extends ArticleSummary {
  // The stored value, or the estimate from the body when the editor left it empty.
  readingMinutes: number;
  // The ProseMirror document of articles.body_json; only the allowlisted renderer turns it into markup.
  body: Json;
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: string;
}
