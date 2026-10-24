import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ArticleCard } from '@/components/articles/article-card';
import {
  ArticleCover,
  ArticleHead,
  RwCallout,
} from '@/components/articles/article-detail-sections';
import { ArticleToc } from '@/components/articles/article-toc';
import { RichText } from '@/components/articles/rich-text';
import { Container } from '@/components/layout/container';
import { Section } from '@/components/layout/section';
import { ShareButton } from '@/components/marketing/share-button';
import { JsonLd } from '@/components/seo/json-ld';
import { rwAccentClasses } from '@/config/rw';
import { articleDetailCopy as text } from '@/lib/copy/catalogue';
import { publicMediaUrl } from '@/lib/images/public-media';
import { getArticleBySlug, listArticles } from '@/lib/queries/articles';
import { listPackages } from '@/lib/queries/packages';
import { listRwUnits } from '@/lib/queries/rw-units';
import { sanitiseRichText } from '@/lib/rich-text/document';
import { articleOutline } from '@/lib/rich-text/outline';
import { articleJsonLd, breadcrumbListJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { breadcrumbTrail } from '@/lib/utils/breadcrumbs';
import { articlePath, PUBLIC_PATHS } from '@/lib/utils/paths';
import type { ArticleDetail, ArticleSummary } from '@/types/article';
import type { PackageSummary } from '@/types/package';
import type { RwUnitSummary } from '@/types/rw-unit';

export const revalidate = 3600;

// DESIGN-SPEC §3.8 "Baca juga": the other newest articles, at most three.
const READ_ALSO = 3;

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

// The package of the article's RW (its own, not a combination) the callout points to.
function rwPackageOf(
  rw: RwUnitSummary,
  packages: readonly PackageSummary[],
): PackageSummary | undefined {
  return packages.find(
    (pkg) => pkg.category !== 'combo' && pkg.rws.some((visit) => visit.id === rw.id),
  );
}

// The contents column (200 px, sticky under the header from lg): the headings and the two share buttons.
function ContentsColumn({ article }: { article: ArticleDetail }) {
  const entries = articleOutline(sanitiseRichText(article.body)).map(({ id, text: label }) => ({
    id,
    text: label,
  }));
  return (
    <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
      {entries.length > 1 ? <ArticleToc title={text.toc} entries={entries} /> : null}
      <div className="flex gap-2 max-lg:hidden">
        <ShareButton
          title={article.title}
          mode="copy"
          appearance="icon"
          variant="outline"
          className="rounded-full"
        />
        <ShareButton
          title={article.title}
          appearance="icon"
          variant="outline"
          className="rounded-full"
        />
      </div>
    </div>
  );
}

function ReadAlso({ articles }: { articles: readonly ArticleSummary[] }) {
  if (articles.length === 0) return null;
  return (
    <Section id="baca-juga" tone="muted" title={text.readAlso} size="compact">
      <ul className="grid gap-x-6 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
        {articles.map((other) => (
          <li key={other.id} className="flex">
            <ArticleCard article={other} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

interface ArticleBodyProps {
  article: ArticleDetail;
  rw: RwUnitSummary | undefined;
  packages: readonly PackageSummary[];
}

// The reading bar, the head, the cover, then the contents column beside the text and its RW callout.
function ArticleBody({ article, rw, packages }: ArticleBodyProps) {
  return (
    <article className={rw ? rwAccentClasses(rw.accentKey).scope : 'rw-scope-combo'}>
      <div
        aria-hidden
        className="fixed inset-x-0 top-(--header-h) z-30 reading-progress h-0.5 bg-rw-fill"
      />
      <Container className="space-y-10 pt-8 pb-16 md:space-y-14 md:pt-16 md:pb-24">
        <ArticleHead article={article} rw={rw} />
        <ArticleCover article={article} />
        <div className="article-columns">
          <ContentsColumn article={article} />
          <div className="min-w-0 space-y-10">
            <RichText
              body={article.body}
              anchorHeadings
              className="article-prose max-w-none text-article"
            />
            {rw ? <RwCallout rw={rw} pkg={rwPackageOf(rw, packages)} /> : null}
            <div className="flex gap-3 lg:hidden">
              <ShareButton title={article.title} mode="copy" variant="outline" />
              <ShareButton title={article.title} variant="outline" />
            </div>
          </div>
        </div>
      </Container>
    </article>
  );
}

// docs/PRD.md FR-PUB-16, Task P2.4.09, DESIGN-SPEC §3.8: the body goes through the allowlisted RichText renderer only,
// never as HTML (CLAUDE.md §7.8). The subtree takes the article's RW colours for the reading bar, the contents rule and
// the callout.
export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const [article, rws, packages, articles] = await Promise.all([
    getArticleBySlug(slug),
    listRwUnits(),
    listPackages(),
    listArticles(),
  ]);
  if (!article) notFound();
  const rw = article.rw ? rws.find((unit) => unit.id === article.rw?.id) : undefined;
  const trail = breadcrumbTrail([{ name: 'Artikel', path: PUBLIC_PATHS.articles }], {
    name: article.title,
    path: articlePath(article.slug),
  });
  return (
    <>
      <ArticleBody article={article} rw={rw} packages={packages} />
      <ReadAlso
        articles={articles.filter((other) => other.id !== article.id).slice(0, READ_ALSO)}
      />
      <JsonLd data={articleLd(article)} />
      <JsonLd data={breadcrumbListJsonLd(trail)} />
    </>
  );
}
