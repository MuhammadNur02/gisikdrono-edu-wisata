import { OG_CONTENT_TYPE, OG_SIZE } from '@/config/og';
import { ARTICLE_CATEGORY_LABELS } from '@/config/status';
import { copy } from '@/lib/copy/id';
import { getArticleBySlug } from '@/lib/queries/articles';
import { renderOgImage } from '@/lib/seo/og-image';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Artikel Edu Wisata Gisikdrono';

interface ArticleImageProps {
  params: Promise<{ slug: string }>;
}

// docs/StyleGuide.md §8.4, Task P2.4.09: the category and RW, the title and the reading time.
export default async function ArticleOpenGraphImage({ params }: ArticleImageProps) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) return renderOgImage({ eyebrow: 'Artikel', title: 'Artikel' });
  const rw = article.rw?.label ?? null;
  return renderOgImage({
    eyebrow: [ARTICLE_CATEGORY_LABELS[article.category], rw].filter(Boolean).join(' · '),
    title: article.title,
    detail: copy.article.readingTime(article.readingMinutes),
  });
}
