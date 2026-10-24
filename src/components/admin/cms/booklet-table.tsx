'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { BookOpen, ExternalLink } from 'lucide-react';
import dynamic from 'next/dynamic';
import { createElement, useCallback, type ReactNode } from 'react';

import {
  ContentBoard,
  type BoardControls,
  type BoardEditor,
} from '@/components/admin/cms/content-board';
import {
  actionsColumn,
  editItem,
  ownerColumn,
  retireItems,
  statusColumn,
} from '@/components/admin/cms/content-columns';
import { ColumnHeader } from '@/components/admin/data-table/column-header';
import type { RowActionItem } from '@/components/admin/data-table/row-actions';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { BOOKLET_KIND_LABELS } from '@/config/status';
import { cmsCopy } from '@/lib/copy/cms';
import { contentListsCopy } from '@/lib/copy/content-lists';
import { bookletPath } from '@/lib/utils/paths';
import type { ActionResult } from '@/types/action-result';
import type { BookletAdmin } from '@/types/cms';
import type { ContentOwner } from '@/types/content';
import type { ListFacet } from '@/types/data-table';

const text = cmsCopy.booklets;
const lists = contentListsCopy;

// The form and its uploader load on the sheet's first opening (admin first-load budget).
const BookletEditor = dynamic(() =>
  import('@/components/admin/cms/booklet-editor').then((module) => module.BookletEditor),
);

type RowAction = (input: unknown) => Promise<ActionResult<null>>;
type SaveAction = (values: unknown) => Promise<ActionResult<BookletAdmin>>;

interface BookletActions {
  isSuperadmin: boolean;
  archiveAction: RowAction;
  // Only for the superadmin (booklets_super_delete, 0005), and only for an archived booklet.
  removeAction: RowAction | null;
}

export interface BookletBoardProps extends BookletActions {
  rows: BookletAdmin[];
  total: number;
  facets: readonly ListFacet[];
  notice?: ReactNode;
  // Who a new booklet belongs to (the RwSwitcher's choice); its files go up for that owner.
  owner: ContentOwner;
  createAction: SaveAction;
  updateAction: SaveAction;
}

function itemsOf(
  booklet: BookletAdmin,
  actions: BookletActions,
  controls: BoardControls<BookletAdmin>,
): RowActionItem[] {
  const items: RowActionItem[] = [
    editItem(() => {
      controls.edit(booklet);
    }),
  ];
  if (booklet.status === 'published') {
    items.push({ label: lists.actions.view, icon: ExternalLink, href: bookletPath(booklet.slug) });
  }
  const retire = { archive: actions.archiveAction, remove: actions.removeAction };
  return [...items, ...retireItems(booklet, booklet.title, retire, controls.confirm)];
}

function describedColumns(isSuperadmin: boolean): ColumnDef<BookletAdmin>[] {
  return [
    {
      id: 'title',
      accessorFn: (booklet) => booklet.title,
      header: ({ column }) =>
        createElement(ColumnHeader<BookletAdmin, unknown>, { column, title: lists.columns.title }),
      cell: ({ row }) => (
        <span className="font-medium whitespace-normal">{row.original.title}</span>
      ),
      meta: { label: lists.columns.title, card: 'title' },
    },
    ...(isSuperadmin ? [ownerColumn<BookletAdmin>()] : []),
    {
      id: 'kind',
      header: lists.columns.kind,
      cell: ({ row }) => BOOKLET_KIND_LABELS[row.original.kind],
      meta: { label: lists.columns.kind },
    },
  ];
}

function countColumns(): ColumnDef<BookletAdmin>[] {
  return [
    {
      id: 'pages',
      header: lists.columns.pages,
      cell: ({ row }) => text.pages(row.original.pageCount ?? 0),
      meta: { label: lists.columns.pages, align: 'right' },
    },
    {
      id: 'download_count',
      accessorFn: (booklet) => booklet.downloadCount,
      header: ({ column }) =>
        createElement(ColumnHeader<BookletAdmin, unknown>, {
          column,
          title: lists.columns.downloads,
        }),
      cell: ({ row }) => text.downloads(row.original.downloadCount),
      meta: { label: lists.columns.downloads, align: 'right' },
    },
  ];
}

function bookletEditor(
  owner: ContentOwner,
  actions: { create: SaveAction; update: SaveAction },
): BoardEditor<BookletAdmin> {
  return {
    title: (booklet) => (booklet ? text.editTitle : text.addTitle),
    render: (booklet, close) => (
      <BookletEditor
        owner={owner}
        booklet={booklet}
        action={booklet ? actions.update : actions.create}
        onSaved={close}
      />
    ),
  };
}

// Task P4.3.03, docs/PRD.md FR-ADMIN-12: one page of booklets from the URL's query, the upload and edit form in a
// sheet, archive by status from the list.
export function BookletBoard(props: BookletBoardProps) {
  const { isSuperadmin, archiveAction, removeAction, owner, createAction, updateAction } = props;
  const columns = useCallback(
    (controls: BoardControls<BookletAdmin>) => [
      ...describedColumns(isSuperadmin),
      ...countColumns(),
      statusColumn<BookletAdmin>(),
      actionsColumn<BookletAdmin>(
        (booklet) => booklet.title,
        (booklet) => itemsOf(booklet, { isSuperadmin, archiveAction, removeAction }, controls),
      ),
    ],
    [isSuperadmin, archiveAction, removeAction],
  );
  const editor = bookletEditor(owner, { create: createAction, update: updateAction });
  return (
    <ContentBoard
      title={text.title}
      description={text.description}
      add={{ label: text.add }}
      notice={props.notice}
      columns={columns}
      rows={props.rows}
      total={props.total}
      noun={lists.nouns.booklets}
      facets={props.facets}
      searchPlaceholder={lists.search.booklets}
      emptyState={<EmptyState icon={BookOpen} title={text.empty} description={text.emptyHint} />}
      editor={editor}
    />
  );
}
