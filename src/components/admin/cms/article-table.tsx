'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ExternalLink, Newspaper, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useCallback, type ReactNode } from 'react';

import { ContentBoard, type BoardControls } from '@/components/admin/cms/content-board';
import {
  actionsColumn,
  ownerColumn,
  retireItems,
  statusColumn,
  updatedAtColumn,
} from '@/components/admin/cms/content-columns';
import { ColumnHeader } from '@/components/admin/data-table/column-header';
import type { RowActionItem } from '@/components/admin/data-table/row-actions';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { CMS_PATHS } from '@/config/cms';
import { ARTICLE_CATEGORY_LABELS } from '@/config/status';
import { cmsCopy } from '@/lib/copy/cms';
import { contentListsCopy } from '@/lib/copy/content-lists';
import { articlePath } from '@/lib/utils/paths';
import type { ActionResult } from '@/types/action-result';
import type { ArticleListItem } from '@/types/cms';
import type { ListFacet } from '@/types/data-table';

const text = cmsCopy.articles;
const lists = contentListsCopy;

type RowAction = (input: unknown) => Promise<ActionResult<null>>;

interface ArticleActions {
  isSuperadmin: boolean;
  archiveAction: RowAction;
  // Only for the superadmin (articles_super_delete, 0005), and only for an archived article.
  removeAction: RowAction | null;
}

export interface ArticleBoardProps extends ArticleActions {
  rows: ArticleListItem[];
  total: number;
  facets: readonly ListFacet[];
  notice?: ReactNode;
}

function itemsOf(
  article: ArticleListItem,
  actions: ArticleActions,
  confirm: BoardControls<ArticleListItem>['confirm'],
): RowActionItem[] {
  const items: RowActionItem[] = [
    { label: lists.actions.edit, icon: Pencil, href: CMS_PATHS.editArticle(article.id) },
  ];
  if (article.status === 'published') {
    items.push({ label: lists.actions.view, icon: ExternalLink, href: articlePath(article.slug) });
  }
  // A published article leaves the site only through the superadmin (articles_moderation_guard).
  const mayArchive = actions.isSuperadmin || article.status !== 'published';
  const retire = {
    archive: mayArchive ? actions.archiveAction : null,
    remove: actions.removeAction,
  };
  return [...items, ...retireItems(article, article.title, retire, confirm)];
}

function titleColumn(): ColumnDef<ArticleListItem> {
  return {
    id: 'title',
    accessorFn: (article) => article.title,
    header: ({ column }) => <ColumnHeader column={column} title={lists.columns.title} />,
    cell: ({ row }) => (
      <Link
        href={CMS_PATHS.editArticle(row.original.id)}
        className="font-medium whitespace-normal underline-offset-4 hover:underline focus-visible:underline"
      >
        {row.original.title}
      </Link>
    ),
    meta: { label: lists.columns.title, card: 'title' },
  };
}

function articleColumns(
  actions: ArticleActions,
  confirm: BoardControls<ArticleListItem>['confirm'],
): ColumnDef<ArticleListItem>[] {
  return [
    titleColumn(),
    ...(actions.isSuperadmin ? [ownerColumn<ArticleListItem>()] : []),
    {
      id: 'category',
      header: lists.columns.category,
      cell: ({ row }) => ARTICLE_CATEGORY_LABELS[row.original.category],
      meta: { label: lists.columns.category },
    },
    statusColumn<ArticleListItem>(),
    updatedAtColumn<ArticleListItem>(),
    actionsColumn<ArticleListItem>(
      (article) => article.title,
      (article) => itemsOf(article, actions, confirm),
    ),
  ];
}

// Task P4.3.03, docs/PRD.md FR-ADMIN-11: one page of articles from the URL's query; an article is written on its own
// page (the rich-text editor) and archived by status from the list.
export function ArticleBoard({ rows, total, facets, notice, ...actions }: ArticleBoardProps) {
  const { isSuperadmin, archiveAction, removeAction } = actions;
  const columns = useCallback(
    ({ confirm }: BoardControls<ArticleListItem>) =>
      articleColumns({ isSuperadmin, archiveAction, removeAction }, confirm),
    [isSuperadmin, archiveAction, removeAction],
  );
  return (
    <ContentBoard
      title={text.title}
      description={text.description}
      add={{ label: text.add, href: CMS_PATHS.newArticle }}
      notice={notice}
      columns={columns}
      rows={rows}
      total={total}
      noun={lists.nouns.articles}
      facets={facets}
      searchPlaceholder={lists.search.articles}
      emptyState={<EmptyState icon={Newspaper} title={text.empty} description={text.emptyHint} />}
    />
  );
}
