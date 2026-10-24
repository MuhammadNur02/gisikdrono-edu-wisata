import { Newspaper } from 'lucide-react';
import type { Metadata } from 'next';

import { ArticleCatalogue, ArticleSearch } from '@/components/articles/article-catalogue';
import { Container } from '@/components/layout/container';
import { PageHeader } from '@/components/layout/page-header';
import { CatalogueState } from '@/components/marketing/catalogue-state';
import { JsonLd } from '@/components/seo/json-ld';
import { articlesPageCopy as text } from '@/lib/copy/catalogue';
import { listArticles } from '@/lib/queries/articles';
import { listRwUnits } from '@/lib/queries/rw-units';
import { itemListJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { articleCategories } from '@/lib/utils/article-filters';
import { articlePath, PUBLIC_PATHS } from '@/lib/utils/paths';

export const revalidate = 3600;

const TITLE = 'Artikel';
const DESCRIPTION =
  'Kabar, bahan edukasi, dan pengumuman dari Edu Center Kelurahan Gisikdrono dan kampung-kampung edukasinya.';

export const metadata: Metadata = buildPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PUBLIC_PATHS.articles,
});

// docs/PRD.md FR-PUB-16, Task P2.4.09, DESIGN-SPEC §3.8: published articles, newest first, the newest featured, with a
// search and the category chips beside the page head. With nothing published the page says news is coming.
export default async function ArticlesPage() {
  const [articles, rws] = await Promise.all([listArticles(), listRwUnits()]);
  const hasArticles = articles.length > 0;
  return (
    <>
      <PageHeader
        tone="paper"
        title={text.title}
        description={text.lead}
        breadcrumbs={[]}
        path={PUBLIC_PATHS.articles}
        crumb={TITLE}
        aside={hasArticles ? <ArticleSearch categories={articleCategories(articles)} /> : undefined}
      />
      <Container className="pt-4 pb-16 md:pt-8 md:pb-28">
        {hasArticles ? (
          <>
            <ArticleCatalogue articles={articles} rws={rws} />
            <JsonLd
              data={itemListJsonLd(
                articles.map((article) => ({
                  name: article.title,
                  path: articlePath(article.slug),
                })),
              )}
            />
          </>
        ) : (
          <CatalogueState
            icon={Newspaper}
            tone="rw"
            className="rw-scope-combo"
            title={text.emptyAllTitle}
            description={text.emptyAllBody}
          />
        )}
      </Container>
    </>
  );
}
