import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { RichText } from '@/components/articles/rich-text';
import { Container } from '@/components/layout/container';
import { PageHeader } from '@/components/layout/page-header';
import { RwTag } from '@/components/layout/rw-tag';
import { CaptionedPhoto } from '@/components/marketing/photo';
import { JsonLd } from '@/components/seo/json-ld';
import { Badge } from '@/components/ui/badge';
import { IMAGE_SIZES } from '@/config/images';
import { ARTICLE_CATEGORY_LABELS } from '@/config/status';
import { copy } from '@/lib/copy/id';
import { publicMediaUrl } from '@/lib/images/public-media';
import { getArticleBySlug, listArticles } from '@/lib/queries/articles';
import { articleJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { formatDateShort } from '@/lib/utils/dates';
import { articlePath, PUBLIC_PATHS } from '@/lib/utils/paths';
import type { ArticleDetail } from '@/types/article';

export const revalidate = 3600;

interface ArticlePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const articles = await listArticles();
  return articles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) return {};
  return buildPageMetadata({
    title: article.seoTitle ?? article.title,
    description: article.seoDescription ?? article.excerpt ?? undefined,
    path: articlePath(article.slug),
  });
}

function ArticleEyebrow({ article }: { article: ArticleDetail }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Badge variant="secondary">{ARTICLE_CATEGORY_LABELS[article.category]}</Badge>
      {article.rw ? <RwTag rw={article.rw} /> : null}
    </span>
  );
}

function ArticleFacts({ article }: { article: ArticleDetail }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-body-sm text-muted-foreground">
      {article.publishedAt ? (
        <>
          <time dateTime={article.publishedAt}>{formatDateShort(article.publishedAt)}</time>
          <span aria-hidden>·</span>
        </>
      ) : null}
      <span>{copy.article.readingTime(article.readingMinutes)}</span>
    </p>
  );
}

function articleLd(article: ArticleDetail) {
  return articleJsonLd({
    headline: article.title,
    description: article.seoDescription ?? article.excerpt ?? undefined,
    path: articlePath(article.slug),
    imageUrl: article.cover ? publicMediaUrl(article.cover.path) : undefined,
    datePublished: article.publishedAt ?? article.updatedAt,
    dateModified: article.updatedAt,
  });
}

// docs/PRD.md FR-PUB-16, Task P2.4.09: the body goes through the allowlisted RichText renderer only, never as
// HTML (CLAUDE.md §7.8). The cover shows only when there is one; an article needs no stand-in picture.
export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) notFound();
  return (
    <>
      <PageHeader
        eyebrow={<ArticleEyebrow article={article} />}
        title={article.title}
        description={article.excerpt ?? undefined}
        breadcrumbs={[{ name: 'Artikel', path: PUBLIC_PATHS.articles }]}
        path={articlePath(article.slug)}
      >
        <ArticleFacts article={article} />
      </PageHeader>
      <Container className="pb-16 md:pb-24">
        <div className="max-w-3xl space-y-10">
          {article.cover ? (
            <CaptionedPhoto
              image={article.cover}
              caption={article.title}
              sizes={IMAGE_SIZES.prose}
              aspectClassName="aspect-video"
              priority
            />
          ) : null}
          <RichText body={article.body} />
        </div>
      </Container>
      <JsonLd data={articleLd(article)} />
    </>
  );
}
