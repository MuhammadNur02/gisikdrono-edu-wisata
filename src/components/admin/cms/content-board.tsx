'use client';

import type { ColumnDef } from '@tanstack/react-table';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { DataTable } from '@/components/admin/data-table/data-table';
import type { ConfirmRequest } from '@/components/admin/shell/confirm-action-dialog';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { Button } from '@/components/ui/button';
import type { ListFacet, ListRow } from '@/types/data-table';

// The sheet (Sheet from md up, Drawer below it) and the confirmation load on first use, outside the list page's first
// load (docs/StyleGuide.md §6.8, admin first-load budget, review of PR #35).
const ResponsiveSheet = dynamic(() =>
  import('@/components/admin/shell/responsive-sheet').then((module) => module.ResponsiveSheet),
);
const ConfirmActionDialog = dynamic(() =>
  import('@/components/admin/shell/confirm-action-dialog').then(
    (module) => module.ConfirmActionDialog,
  ),
);

// What a column's row actions may ask the board for.
export interface BoardControls<TRow> {
  edit: (row: TRow) => void;
  confirm: (request: ConfirmRequest) => void;
}

export interface BoardEditor<TRow> {
  title: (row: TRow | null) => string;
  // The form for a new row (null) or one that exists, told how to close the sheet once it has saved.
  render: (row: TRow | null, close: () => void) => ReactNode;
}

export interface ContentBoardProps<TRow extends ListRow> {
  title: string;
  description?: string;
  // The page's primary action: a label that opens the sheet for a new row, a link (`Tulis artikel`) for a module
  // edited on a page of its own, or null when this staff member may add nothing here.
  add: { label: string; href?: string } | null;
  // Between the header and the list: the owner notice, a read-only note.
  notice?: ReactNode;
  columns: (controls: BoardControls<TRow>) => ColumnDef<TRow>[];
  rows: TRow[];
  total: number;
  noun: string;
  facets: readonly ListFacet[];
  searchPlaceholder: string;
  emptyState: ReactNode;
  // Absent for a module edited on a page of its own.
  editor?: BoardEditor<TRow>;
}

// The sheet's target: a new row, one that exists, or nothing while it is closed.
type Editing<TRow> = { row: TRow | null } | null;

function AddAction({ add, onOpen }: { add: { label: string; href?: string }; onOpen: () => void }) {
  if (add.href) {
    return (
      <Button asChild>
        <Link href={add.href}>{add.label}</Link>
      </Button>
    );
  }
  return (
    <Button type="button" onClick={onOpen}>
      {add.label}
    </Button>
  );
}

// The board's state: which row the sheet is open for, whether it has loaded yet, and the step waiting for a yes.
function useBoard<TRow extends ListRow>(columnsOf: ContentBoardProps<TRow>['columns']) {
  const [editing, setEditing] = useState<Editing<TRow>>(null);
  const [hasOpened, setHasOpened] = useState(false);
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const openEditor = useCallback((row: TRow | null) => {
    setHasOpened(true);
    setEditing({ row });
  }, []);
  const columns = useMemo(
    () => columnsOf({ edit: openEditor, confirm: setRequest }),
    [columnsOf, openEditor],
  );
  const closeEditor = () => {
    setEditing(null);
  };
  const closeConfirm = () => {
    setRequest(null);
  };
  return { columns, editing, hasOpened, openEditor, closeEditor, request, closeConfirm };
}

function BoardSheet<TRow>({
  editor,
  editing,
  onClose,
}: {
  editor: BoardEditor<TRow>;
  editing: Editing<TRow>;
  onClose: () => void;
}) {
  return (
    <ResponsiveSheet
      open={editing !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      title={editor.title(editing?.row ?? null)}
    >
      {editing ? editor.render(editing.row, onClose) : null}
    </ResponsiveSheet>
  );
}

// Task P4.3.03 (docs/StyleGuide.md §5.3, §6.4): a content list on the DataTable, its create and edit form in a sheet
// that mounts only while open (so each opening starts from the row as it is now), and archive or removal confirmed in
// a ResponsiveDialog. Every Server Action behind it re-checks the scope itself.
export function ContentBoard<TRow extends ListRow>(props: ContentBoardProps<TRow>) {
  const board = useBoard(props.columns);
  const { editor, add } = props;
  const addButton = add ? (
    <AddAction
      add={add}
      onOpen={() => {
        board.openEditor(null);
      }}
    />
  ) : undefined;
  return (
    <>
      <DashboardPageHeader title={props.title} description={props.description} action={addButton} />
      {props.notice}
      <DataTable
        columns={board.columns}
        rows={props.rows}
        total={props.total}
        noun={props.noun}
        facets={props.facets}
        searchPlaceholder={props.searchPlaceholder}
        emptyState={props.emptyState}
      />
      {editor && board.hasOpened ? (
        <BoardSheet editor={editor} editing={board.editing} onClose={board.closeEditor} />
      ) : null}
      {board.request ? (
        <ConfirmActionDialog request={board.request} onClose={board.closeConfirm} />
      ) : null}
    </>
  );
}
