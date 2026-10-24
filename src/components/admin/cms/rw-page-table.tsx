'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ExternalLink, Landmark } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

import {
  ContentBoard,
  type BoardControls,
  type BoardEditor,
} from '@/components/admin/cms/content-board';
import { actionsColumn, editItem } from '@/components/admin/cms/content-columns';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { cmsCopy } from '@/lib/copy/cms';
import { contentListsCopy } from '@/lib/copy/content-lists';
import type { ActionResult } from '@/types/action-result';
import type { RwPageAdmin, RwPageListItem } from '@/types/cms';
import type { ListFacet } from '@/types/data-table';

const text = cmsCopy.pages;
const lists = contentListsCopy;

// The form loads on the sheet's first opening (admin first-load budget).
const RwPageForm = dynamic(() =>
  import('@/components/admin/cms/rw-page-form').then((module) => module.RwPageForm),
);

type SaveAction = (values: unknown) => Promise<ActionResult<RwPageAdmin>>;

export interface RwPageBoardProps {
  rows: RwPageListItem[];
  total: number;
  facets: readonly ListFacet[];
  // The superadmin's save names the RW of the row they opened; an RW admin's never names one.
  isSuperadmin: boolean;
  updateAction: SaveAction;
}

function forRw(action: SaveAction, rwId: number): SaveAction {
  return (values) =>
    action(typeof values === 'object' && values !== null ? { ...values, rwId } : { rwId });
}

const PAGE_COLUMNS: ColumnDef<RwPageListItem>[] = [
  {
    id: 'name',
    header: lists.columns.name,
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    meta: { label: lists.columns.name, card: 'title' },
  },
  {
    id: 'path',
    header: lists.columns.path,
    cell: ({ row }) => (
      <Link
        href={row.original.path}
        className="underline-offset-4 hover:underline focus-visible:underline"
      >
        {row.original.path}
      </Link>
    ),
    meta: { label: lists.columns.path },
  },
  {
    id: 'tagline',
    header: lists.pages.tagline,
    cell: ({ row }) => (
      <span className="line-clamp-2 whitespace-normal text-muted-foreground">
        {row.original.tagline ?? lists.pages.noTagline}
      </span>
    ),
    meta: { label: lists.pages.tagline },
  },
];

function pageColumns(controls: BoardControls<RwPageListItem>): ColumnDef<RwPageListItem>[] {
  return [
    ...PAGE_COLUMNS,
    actionsColumn<RwPageListItem>(
      (page) => page.name,
      (page) => [
        editItem(() => {
          controls.edit(page);
        }),
        { label: text.view, icon: ExternalLink, href: page.path },
      ],
    ),
  ];
}

function pageEditor(updateAction: SaveAction, isSuperadmin: boolean): BoardEditor<RwPageListItem> {
  return {
    title: (page) => (page ? lists.pages.edit(page.name) : text.title),
    // Every RW has its page; there is no new one to write here (Task P4.9.03 adds RWs).
    render: (page, close) =>
      page ? (
        <RwPageForm
          page={page}
          action={isSuperadmin ? forRw(updateAction, page.rwId) : updateAction}
          onSaved={close}
        />
      ) : null,
  };
}

// Task P4.3.03, docs/PRD.md FR-ADMIN-15: the RW pages a staff member edits (their own RW's, or for the superadmin
// every RW's), each edited in a sheet. An RW page is never archived from here: whether an RW is online is P4.9.03's.
export function RwPageBoard({ rows, total, facets, isSuperadmin, updateAction }: RwPageBoardProps) {
  return (
    <ContentBoard
      title={text.title}
      description={text.description}
      add={null}
      columns={pageColumns}
      rows={rows}
      total={total}
      noun={lists.nouns.pages}
      facets={facets}
      searchPlaceholder={lists.search.pages}
      emptyState={<EmptyState icon={Landmark} title={text.title} description={text.description} />}
      editor={pageEditor(updateAction, isSuperadmin)}
    />
  );
}
