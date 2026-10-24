import type { ColumnDef } from '@tanstack/react-table';
import { Archive, Pencil, Trash2 } from 'lucide-react';
import { createElement } from 'react';

import { ColumnHeader } from '@/components/admin/data-table/column-header';
import { RowActions, type RowActionItem } from '@/components/admin/data-table/row-actions';
import type { ConfirmRequest } from '@/components/admin/shell/confirm-action-dialog';
import { ContentStatusBadge } from '@/components/admin/status/status-badge';
import type { EnumValue } from '@/db/enums';
import { contentListsCopy } from '@/lib/copy/content-lists';
import { contentOwnerLabel } from '@/lib/utils/content-owner';
import { formatDateShort } from '@/lib/utils/dates';
import type { ActionResult } from '@/types/action-result';
import type { ContentOwner } from '@/types/content';
import type { ListRow } from '@/types/data-table';

// The columns and row actions every content list repeats (Task P4.3.03, docs/StyleGuide.md §6.4).

const text = contentListsCopy;

type RowAction = (input: unknown) => Promise<ActionResult<unknown>>;

export function statusColumn<
  TRow extends ListRow & { status: EnumValue<'content_status'> },
>(): ColumnDef<TRow> {
  return {
    id: 'status',
    header: text.columns.status,
    cell: ({ row }) => createElement(ContentStatusBadge, { status: row.original.status }),
    meta: { label: text.columns.status, card: 'badge' },
  };
}

export function ownerColumn<TRow extends ListRow & { owner: ContentOwner }>(): ColumnDef<TRow> {
  return {
    id: 'owner',
    header: text.columns.owner,
    cell: ({ row }) => contentOwnerLabel(row.original.owner),
    meta: { label: text.columns.owner },
  };
}

export function updatedAtColumn<TRow extends ListRow & { updatedAt: string }>(): ColumnDef<TRow> {
  return {
    id: 'updated_at',
    accessorFn: (row) => row.updatedAt,
    header: ({ column }) =>
      createElement(ColumnHeader<TRow, unknown>, { column, title: text.columns.updatedAt }),
    cell: ({ row }) => formatDateShort(row.original.updatedAt),
    meta: { label: text.columns.updatedAt },
  };
}

export function actionsColumn<TRow extends ListRow>(
  nameOf: (row: TRow) => string,
  itemsOf: (row: TRow) => RowActionItem[],
): ColumnDef<TRow> {
  return {
    id: 'actions',
    header: () => createElement('span', { className: 'sr-only' }, text.columns.actions),
    cell: ({ row }) =>
      createElement(
        'div',
        { className: 'flex justify-end' },
        createElement(RowActions, { name: nameOf(row.original), items: itemsOf(row.original) }),
      ),
    meta: { card: 'actions' },
  };
}

export function editItem(onSelect: () => void): RowActionItem {
  return { label: text.actions.edit, icon: Pencil, onSelect };
}

// Archive by status, never a delete (Task P4.3.03): the row leaves the site and stays here.
export function archiveItem(
  name: string,
  id: string,
  action: RowAction,
  confirm: (request: ConfirmRequest) => void,
): RowActionItem {
  return {
    label: text.actions.archive,
    icon: Archive,
    destructive: true,
    onSelect: () => {
      confirm({
        run: () => action({ id }),
        title: text.actions.archiveTitle(name),
        consequence: text.actions.archiveConsequence,
        confirmLabel: text.actions.archive,
        done: text.actions.archived,
      });
    },
  };
}

// Only an archived row is removed for good, with its files, so nothing live disappears in one step.
export function removeItem(
  name: string,
  id: string,
  action: RowAction,
  confirm: (request: ConfirmRequest) => void,
): RowActionItem {
  return {
    label: text.actions.remove,
    icon: Trash2,
    destructive: true,
    onSelect: () => {
      confirm({
        run: () => action({ id }),
        title: text.actions.removeTitle(name),
        consequence: text.actions.removeConsequence,
        confirmLabel: text.actions.remove,
        done: text.actions.removed,
      });
    },
  };
}

// Archive for a live or draft row, removal for an archived one; either only when this staff member may.
export function retireItems(
  row: ListRow & { status: EnumValue<'content_status'> },
  name: string,
  actions: { archive: RowAction | null; remove: RowAction | null },
  confirm: (request: ConfirmRequest) => void,
): RowActionItem[] {
  if (row.status !== 'archived') {
    return actions.archive ? [archiveItem(name, row.id, actions.archive, confirm)] : [];
  }
  return actions.remove ? [removeItem(name, row.id, actions.remove, confirm)] : [];
}
