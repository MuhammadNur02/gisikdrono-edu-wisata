import type { Metadata } from 'next';

import { ArticleBoard } from '@/components/admin/cms/article-table';
import { OwnerNotice } from '@/components/admin/cms/owner-notice';
import { ARTICLE_CATEGORY_LABELS } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { cmsCopy } from '@/lib/copy/cms';
import { contentListsCopy } from '@/lib/copy/content-lists';
import { contentStatusFacet, listFacets, rwFacet } from '@/lib/utils/facets';
import { loadListQuery } from '@/lib/utils/list-query';
import { archiveArticleAction, removeArticleAction } from '@/server/actions/articles';
import { effectiveRw, ownerOfNewContent, readRwScope } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { listArticlesForStaff } from '@/server/services/article-service';
import { listRwUnitsForStaff } from '@/server/services/rw-unit-service';
import type { ListFacet } from '@/types/data-table';

const text = cmsCopy.articles;
const lists = contentListsCopy;

export const metadata: Metadata = { title: text.title };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const CATEGORY_FACET: ListFacet = {
  param: 'category',
  title: lists.facets.category,
  options: DB_ENUMS.article_category.map((category) => ({
    value: category,
    label: ARTICLE_CATEGORY_LABELS[category],
  })),
};

// Task P2.9.06 and P4.3.03, docs/PRD.md FR-ADMIN-11: one page of articles from `?q=&sort=&page=&status=&category=&rw=`.
// The list follows effectiveRw; a new article belongs to the owner the RwSwitcher points at (the kelurahan under Semua).
export default async function ArticlesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const query = await loadListQuery(searchParams);
  const isSuperadmin = ctx.role === 'superadmin';
  const [rw, rwUnits, scope] = await Promise.all([
    effectiveRw(ctx, query.rw),
    listRwUnitsForStaff(),
    readRwScope(),
  ]);
  const owner = ownerOfNewContent(ctx, scope);
  if (owner === undefined) return null;
  const result = await listArticlesForStaff(query, rw);
  const facets = listFacets(isSuperadmin, {
    status: contentStatusFacet(lists.facets.status),
    others: [CATEGORY_FACET],
    rw: rwFacet(lists.facets.rw, rwUnits),
  });

  return (
    <ArticleBoard
      rows={result.rows}
      total={result.total}
      facets={facets}
      notice={<OwnerNotice owner={owner} isSuperadmin={isSuperadmin} />}
      isSuperadmin={isSuperadmin}
      archiveAction={archiveArticleAction}
      removeAction={isSuperadmin ? removeArticleAction : null}
    />
  );
}
