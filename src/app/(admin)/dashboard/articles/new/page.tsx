import type { Metadata } from 'next';

import { ArticleForm } from '@/components/admin/cms/article-form';
import { blankArticle } from '@/components/admin/cms/article-values';
import { BackToArticles } from '@/components/admin/cms/back-to-articles';
import { OwnerNotice } from '@/components/admin/cms/owner-notice';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { copy } from '@/lib/copy/id';
import { createArticleAction } from '@/server/actions/articles';
import { ownerOfNewContent, readRwScope } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';

const text = copy.cms.articles;

export const metadata: Metadata = { title: text.newTitle };

// Task P2.9.06, docs/PRD.md FR-ADMIN-11. The id is made here, so the article's photos can go into its folder before
// the article is first saved.
export default async function NewArticlePage() {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const owner = ownerOfNewContent(ctx, await readRwScope());
  if (owner === undefined) return null;
  const isSuperadmin = ctx.role === 'superadmin';

  return (
    <>
      <BackToArticles />
      <DashboardPageHeader title={text.newTitle} />
      <OwnerNotice owner={owner} isSuperadmin={isSuperadmin} />
      <ArticleForm
        article={blankArticle(crypto.randomUUID())}
        owner={owner}
        canPublish={isSuperadmin}
        isPublished={false}
        action={createArticleAction}
      />
    </>
  );
}
