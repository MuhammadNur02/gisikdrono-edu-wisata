'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { CalendarDays } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback } from 'react';

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
import type { RwId } from '@/config/rw';
import { SCHEDULE_TYPE_LABELS } from '@/config/status';
import { cmsCopy } from '@/lib/copy/cms';
import { contentListsCopy } from '@/lib/copy/content-lists';
import { formatDateShort, formatInstantTimeRange } from '@/lib/utils/dates';
import type { ActionResult } from '@/types/action-result';
import type { ScheduleAdmin, SchedulePackageOption } from '@/types/cms';
import type { ListFacet } from '@/types/data-table';

const text = cmsCopy.schedules;
const lists = contentListsCopy;

// The form loads on the sheet's first opening (admin first-load budget).
const ScheduleEditor = dynamic(() =>
  import('@/components/admin/cms/schedule-editor').then((module) => module.ScheduleEditor),
);

type RowAction = (input: unknown) => Promise<ActionResult<null>>;
type SaveAction = (values: unknown) => Promise<ActionResult<ScheduleAdmin>>;

interface ScheduleRowActions {
  archive: RowAction;
  remove: RowAction;
}

export interface ScheduleBoardProps {
  // The RW whose schedule the page shows, named in the description.
  rwId: RwId;
  rwName: string;
  rows: ScheduleAdmin[];
  total: number;
  facets: readonly ListFacet[];
  packages: SchedulePackageOption[];
  actions: ScheduleRowActions & { create: SaveAction; update: SaveAction };
}

function describedColumns(): ColumnDef<ScheduleAdmin>[] {
  return [
    {
      id: 'title',
      accessorFn: (schedule) => schedule.title,
      header: ({ column }) => <ColumnHeader column={column} title={text.titleField} />,
      cell: ({ row }) => (
        <span className="font-medium whitespace-normal">{row.original.title}</span>
      ),
      meta: { label: text.titleField, card: 'title' },
    },
    {
      id: 'schedule_type',
      header: text.scheduleType,
      cell: ({ row }) => SCHEDULE_TYPE_LABELS[row.original.scheduleType],
      meta: { label: text.scheduleType },
    },
    {
      id: 'starts_at',
      accessorFn: (schedule) => schedule.startsAt,
      header: ({ column }) => <ColumnHeader column={column} title={lists.columns.startsAt} />,
      cell: ({ row }) =>
        `${formatDateShort(row.original.startsAt)} · ${formatInstantTimeRange(row.original.startsAt, row.original.endsAt)}`,
      meta: { label: lists.columns.startsAt },
    },
    {
      id: 'venue',
      header: text.venue,
      cell: ({ row }) => row.original.venue ?? '–',
      meta: { label: text.venue },
    },
  ];
}

function scheduleColumns(
  actions: ScheduleRowActions,
  controls: BoardControls<ScheduleAdmin>,
): ColumnDef<ScheduleAdmin>[] {
  return [
    ...describedColumns(),
    statusColumn<ScheduleAdmin>(),
    actionsColumn<ScheduleAdmin>(
      (schedule) => schedule.title,
      (schedule) => [
        editItem(() => {
          controls.edit(schedule);
        }),
        ...retireItems(schedule, schedule.title, actions, controls.confirm),
      ],
    ),
  ];
}

function scheduleEditor(
  props: Pick<ScheduleBoardProps, 'rwId' | 'packages' | 'actions'>,
): BoardEditor<ScheduleAdmin> {
  return {
    title: (schedule) => (schedule ? text.editTitle : text.addTitle),
    render: (schedule, close) => (
      <ScheduleEditor
        rwId={props.rwId}
        schedule={schedule}
        packages={props.packages}
        actions={props.actions}
        onSaved={close}
      />
    ),
  };
}

// Task P4.3.03, docs/PRD.md FR-ADMIN-13: one page of an RW's performance schedule from the URL's query; create and
// edit in a sheet, archive by status, removal of an archived schedule only.
export function ScheduleBoard(props: ScheduleBoardProps) {
  const { archive, remove } = props.actions;
  const columns = useCallback(
    (controls: BoardControls<ScheduleAdmin>) => scheduleColumns({ archive, remove }, controls),
    [archive, remove],
  );
  return (
    <ContentBoard
      title={text.title}
      description={text.description(props.rwName)}
      add={{ label: text.add }}
      columns={columns}
      rows={props.rows}
      total={props.total}
      noun={lists.nouns.schedules}
      facets={props.facets}
      searchPlaceholder={lists.search.schedules}
      emptyState={
        <EmptyState icon={CalendarDays} title={text.empty} description={text.emptyHint} />
      }
      editor={scheduleEditor(props)}
    />
  );
}
