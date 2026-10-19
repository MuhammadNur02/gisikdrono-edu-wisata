import type { Metadata } from 'next';

import { ArticleCard } from '@/components/articles/article-card';
import { Container } from '@/components/layout/container';
import { PageHeader } from '@/components/layout/page-header';
import { JsonLd } from '@/components/seo/json-ld';
import { listArticles } from '@/lib/queries/articles';
import { itemListJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { articlePath, PUBLIC_PATHS } from '@/lib/utils/paths';

export const revalidate = 3600;

const TITLE = 'Artikel';
const DESCRIPTION =
  'Kabar, bahan edukasi, dan pengumuman dari Edu Center Kelurahan Gisikdrono, RW 05, dan RW 08.';

export const metadata: Metadata = buildPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PUBLIC_PATHS.articles,
});

// docs/PRD.md FR-PUB-16, Task P2.4.09: published articles, newest first. With nothing published the page is
// its header alone (StyleGuide §6.9).
export default async function ArticlesPage() {
  const articles = await listArticles();
  return (
    <>
      <PageHeader
        title={TITLE}
        description={DESCRIPTION}
        breadcrumbs={[]}
        path={PUBLIC_PATHS.articles}
      />
      {articles.length > 0 ? (
        <Container className="pb-16 md:pb-24">
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <li key={article.id} className="flex">
                <ArticleCard article={article} />
              </li>
            ))}
          </ul>
          <JsonLd
            data={itemListJsonLd(
              articles.map((article) => ({ name: article.title, path: articlePath(article.slug) })),
            )}
          />
        </Container>
      ) : null}
    </>
  );
}
