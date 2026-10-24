'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Images } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, type ReactNode } from 'react';

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
import { ListThumb } from '@/components/admin/cms/list-thumb';
import { ColumnHeader } from '@/components/admin/data-table/column-header';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { GALLERY_CATEGORY_LABELS } from '@/config/status';
import { cmsCopy } from '@/lib/copy/cms';
import { contentListsCopy } from '@/lib/copy/content-lists';
import { formatDateShort } from '@/lib/utils/dates';
import type { ActionResult } from '@/types/action-result';
import type { GalleryItemAdmin } from '@/types/cms';
import type { ContentOwner } from '@/types/content';
import type { ListFacet } from '@/types/data-table';

const text = cmsCopy.galleries;
const lists = contentListsCopy;

// The upload and edit forms load on the sheet's first opening (admin first-load budget).
const GalleryEditor = dynamic(() =>
  import('@/components/admin/cms/gallery-editor').then((module) => module.GalleryEditor),
);

type RowAction = (input: unknown) => Promise<ActionResult<null>>;
type SaveAction = (values: unknown) => Promise<ActionResult<GalleryItemAdmin>>;

interface GalleryRowActions {
  archive: RowAction;
  remove: RowAction;
}

export interface GalleryBoardProps {
  rows: GalleryItemAdmin[];
  total: number;
  facets: readonly ListFacet[];
  notice?: ReactNode;
  showOwner: boolean;
  // Who a new item belongs to (the RwSwitcher's choice); its photo goes up for that owner.
  owner: ContentOwner;
  actions: GalleryRowActions & { create: SaveAction; update: SaveAction };
}

function describedColumns(showOwner: boolean): ColumnDef<GalleryItemAdmin>[] {
  return [
    {
      id: 'photo',
      header: lists.columns.photo,
      cell: ({ row }) => <ListThumb path={row.original.previewPath} alt={row.original.altText} />,
      meta: { label: lists.columns.photo },
    },
    {
      id: 'caption',
      header: text.caption,
      cell: ({ row }) => (
        <span className="line-clamp-2 font-medium whitespace-normal">
          {row.original.caption ?? row.original.altText}
        </span>
      ),
      meta: { label: text.caption, card: 'title' },
    },
    ...(showOwner ? [ownerColumn<GalleryItemAdmin>()] : []),
    {
      id: 'category',
      header: lists.columns.category,
      cell: ({ row }) =>
        `${GALLERY_CATEGORY_LABELS[row.original.category]} · ${text.mediaTypes[row.original.mediaType]}`,
      meta: { label: lists.columns.category },
    },
  ];
}

function orderColumns(): ColumnDef<GalleryItemAdmin>[] {
  return [
    {
      id: 'taken_at',
      accessorFn: (item) => item.takenAt,
      header: ({ column }) => <ColumnHeader column={column} title={text.takenAt} />,
      cell: ({ row }) => (row.original.takenAt ? formatDateShort(row.original.takenAt) : '–'),
      meta: { label: text.takenAt },
    },
    {
      id: 'sort_order',
      accessorFn: (item) => item.sortOrder,
      header: ({ column }) => <ColumnHeader column={column} title={lists.columns.sortOrder} />,
      cell: ({ row }) => row.original.sortOrder,
      meta: { label: lists.columns.sortOrder, align: 'right' },
    },
  ];
}

function galleryColumns(
  showOwner: boolean,
  actions: GalleryRowActions,
  controls: BoardControls<GalleryItemAdmin>,
): ColumnDef<GalleryItemAdmin>[] {
  return [
    ...describedColumns(showOwner),
    ...orderColumns(),
    statusColumn<GalleryItemAdmin>(),
    actionsColumn<GalleryItemAdmin>(
      (item) => item.altText,
      (item) => [
        editItem(() => {
          controls.edit(item);
        }),
        ...retireItems(item, item.altText, actions, controls.confirm),
      ],
    ),
  ];
}

function galleryEditor(
  owner: ContentOwner,
  actions: GalleryBoardProps['actions'],
): BoardEditor<GalleryItemAdmin> {
  return {
    title: (item) => (item ? text.editTitle : text.addTitle),
    render: (item, close) => (
      <GalleryEditor owner={owner} item={item} actions={actions} onSaved={close} />
    ),
  };
}

// Task P4.3.03, docs/PRD.md FR-ADMIN-10: one page of gallery items from the URL's query, in the public gallery's order;
// upload and edit in a sheet, archive by status, and removal (with the files) of an archived item only.
export function GalleryBoard({ showOwner, owner, actions, ...list }: GalleryBoardProps) {
  const { archive, remove } = actions;
  const columns = useCallback(
    (controls: BoardControls<GalleryItemAdmin>) =>
      galleryColumns(showOwner, { archive, remove }, controls),
    [showOwner, archive, remove],
  );
  return (
    <ContentBoard
      title={text.title}
      description={text.description}
      add={{ label: text.add }}
      notice={list.notice}
      columns={columns}
      rows={list.rows}
      total={list.total}
      noun={lists.nouns.galleries}
      facets={list.facets}
      searchPlaceholder={lists.search.galleries}
      emptyState={<EmptyState icon={Images} title={text.empty} description={text.emptyHint} />}
      editor={galleryEditor(owner, actions)}
    />
  );
}
