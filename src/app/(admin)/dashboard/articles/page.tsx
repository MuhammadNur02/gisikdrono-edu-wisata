import { Newspaper } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ArticleTable } from '@/components/admin/cms/article-table';
import { OwnerNotice } from '@/components/admin/cms/owner-notice';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { Button } from '@/components/ui/button';
import { CMS_PATHS } from '@/config/cms';
import { RW_SCOPE_ALL } from '@/config/dashboard';
import { copy } from '@/lib/copy/id';
import { removeArticleAction } from '@/server/actions/articles';
import { ownerOfNewContent, readRwScope } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { listArticlesForStaff } from '@/server/services/article-service';

const text = copy.cms.articles;

export const metadata: Metadata = { title: text.title };

// Task P2.9.06, docs/PRD.md FR-ADMIN-11. Under Semua the superadmin sees every article and writes kelurahan ones.
export default async function ArticlesPage() {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const scope = await readRwScope();
  const owner = ownerOfNewContent(ctx, scope);
  if (owner === undefined) return null;
  const isSuperadmin = ctx.role === 'superadmin';
  const articles = await listArticlesForStaff(
    isSuperadmin && scope === RW_SCOPE_ALL ? 'all' : owner,
  );
  const addButton = (
    <Button asChild>
      <Link href={CMS_PATHS.newArticle}>{text.add}</Link>
    </Button>
  );

  return (
    <>
      <DashboardPageHeader title={text.title} description={text.description} action={addButton} />
      <OwnerNotice owner={owner} isSuperadmin={isSuperadmin} />
      {articles.length === 0 ? (
        <EmptyState icon={Newspaper} title={text.empty} description={text.emptyHint} />
      ) : (
        <ArticleTable
          articles={articles}
          showOwner={isSuperadmin}
          removeAction={isSuperadmin ? removeArticleAction : null}
        />
      )}
    </>
  );
}
