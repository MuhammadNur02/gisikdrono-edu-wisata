import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ArticleForm } from '@/components/admin/cms/article-form';
import { articleValues } from '@/components/admin/cms/article-values';
import { BackToArticles } from '@/components/admin/cms/back-to-articles';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { ContentStatusBadge } from '@/components/admin/status/status-badge';
import { copy } from '@/lib/copy/id';
import { rowIdSchema } from '@/lib/validations/content';
import { updateArticleAction } from '@/server/actions/articles';
import { requireDashboardStaff } from '@/server/auth/session';
import { readArticleForStaff } from '@/server/services/article-service';

const text = copy.cms.articles;

export const metadata: Metadata = { title: text.editTitle };

interface EditArticlePageProps {
  params: Promise<{ id: string }>;
}

// Task P2.9.06, docs/PRD.md FR-ADMIN-11. RLS shows an RW admin their own RW's articles only, so another RW's article
// answers exactly like one that does not exist: a 404 (decision of 2026-10-21).
export default async function EditArticlePage({ params }: EditArticlePageProps) {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const id = rowIdSchema.safeParse((await params).id);
  const article = id.success ? await readArticleForStaff(id.data) : null;
  if (!article) notFound();

  return (
    <>
      <BackToArticles />
      <DashboardPageHeader
        title={text.editTitle}
        action={<ContentStatusBadge status={article.status} />}
      />
      <ArticleForm
        article={articleValues(article)}
        owner={article.owner}
        canPublish={ctx.role === 'superadmin'}
        isPublished={article.status === 'published'}
        action={updateArticleAction}
      />
    </>
  );
}
