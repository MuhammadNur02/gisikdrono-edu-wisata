'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { MapPin } from 'lucide-react';
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
  retireItems,
  statusColumn,
} from '@/components/admin/cms/content-columns';
import { ColumnHeader } from '@/components/admin/data-table/column-header';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { rwLabel, type RwId } from '@/config/rw';
import { ACTIVITY_POINT_TYPE } from '@/config/status';
import { cmsCopy } from '@/lib/copy/cms';
import { contentListsCopy } from '@/lib/copy/content-lists';
import type { ActionResult } from '@/types/action-result';
import type { ActivityPointAdmin } from '@/types/cms';
import type { ListFacet } from '@/types/data-table';

const text = cmsCopy.points;
const lists = contentListsCopy;

// The form and its map picker load on the sheet's first opening (admin first-load budget).
const ActivityPointEditor = dynamic(() =>
  import('@/components/admin/cms/activity-point-editor').then(
    (module) => module.ActivityPointEditor,
  ),
);

type RowAction = (input: unknown) => Promise<ActionResult<null>>;
type SaveAction = (values: unknown) => Promise<ActionResult<ActivityPointAdmin>>;

interface PointRowActions {
  archive: RowAction;
  remove: RowAction;
}

export interface ActivityPointBoardProps {
  rows: ActivityPointAdmin[];
  total: number;
  facets: readonly ListFacet[];
  notice?: ReactNode;
  showRw: boolean;
  // The RW a new point belongs to, or null while the superadmin's RwSwitcher points at none (no add button then).
  newRwId: RwId | null;
  // Each RW's public page by id, for the anchor each point's slug is shown under.
  pagePaths: Record<number, string>;
  actions: PointRowActions & { create: SaveAction; update: SaveAction };
}

const RW_COLUMN: ColumnDef<ActivityPointAdmin> = {
  id: 'rw',
  header: lists.columns.owner,
  cell: ({ row }) => rwLabel(row.original.rwId),
  meta: { label: lists.columns.owner },
};

function describedColumns(showRw: boolean): ColumnDef<ActivityPointAdmin>[] {
  return [
    {
      id: 'name',
      accessorFn: (point) => point.name,
      header: ({ column }) => <ColumnHeader column={column} title={text.name} />,
      cell: ({ row }) => <span className="font-medium whitespace-normal">{row.original.name}</span>,
      meta: { label: text.name, card: 'title' },
    },
    {
      id: 'point_type',
      header: text.pointType,
      cell: ({ row }) => ACTIVITY_POINT_TYPE[row.original.pointType].label,
      meta: { label: text.pointType },
    },
    ...(showRw ? [RW_COLUMN] : []),
    {
      id: 'sort_order',
      accessorFn: (point) => point.sortOrder,
      header: ({ column }) => <ColumnHeader column={column} title={lists.columns.sortOrder} />,
      cell: ({ row }) => row.original.sortOrder,
      meta: { label: lists.columns.sortOrder, align: 'right' },
    },
  ];
}

function pointColumns(
  showRw: boolean,
  actions: PointRowActions,
  controls: BoardControls<ActivityPointAdmin>,
): ColumnDef<ActivityPointAdmin>[] {
  return [
    ...describedColumns(showRw),
    statusColumn<ActivityPointAdmin>(),
    actionsColumn<ActivityPointAdmin>(
      (point) => point.name,
      (point) => [
        editItem(() => {
          controls.edit(point);
        }),
        ...retireItems(point, point.name, actions, controls.confirm),
      ],
    ),
  ];
}

function pointEditor(
  props: Pick<ActivityPointBoardProps, 'newRwId' | 'pagePaths' | 'actions'>,
): BoardEditor<ActivityPointAdmin> {
  return {
    title: (point) => (point ? text.editTitle : text.addTitle),
    render: (point, close) => {
      const rwId = point ? point.rwId : props.newRwId;
      if (rwId === null) return null;
      return (
        <ActivityPointEditor
          rwId={rwId}
          pagePath={props.pagePaths[rwId] ?? ''}
          point={point}
          actions={props.actions}
          onSaved={close}
        />
      );
    },
  };
}

// Task P4.3.03, docs/PRD.md FR-ADMIN-14: one page of activity points from the URL's query; create and edit in a sheet,
// archive by status, removal (with the photo) of an archived point only.
export function ActivityPointBoard(props: ActivityPointBoardProps) {
  const { showRw } = props;
  const { archive, remove } = props.actions;
  const columns = useCallback(
    (controls: BoardControls<ActivityPointAdmin>) =>
      pointColumns(showRw, { archive, remove }, controls),
    [showRw, archive, remove],
  );
  return (
    <ContentBoard
      title={text.title}
      description={text.description}
      add={props.newRwId === null ? null : { label: text.add }}
      notice={props.notice}
      columns={columns}
      rows={props.rows}
      total={props.total}
      noun={lists.nouns.points}
      facets={props.facets}
      searchPlaceholder={lists.search.points}
      emptyState={<EmptyState icon={MapPin} title={text.empty} description={text.emptyHint} />}
      editor={pointEditor(props)}
    />
  );
}
