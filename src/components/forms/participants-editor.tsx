'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { AlertTriangle, Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { copy } from '@/lib/copy/id';
import {
  findDuplicateRows,
  isMultiCellPaste,
  parseParticipantPaste,
} from '@/lib/utils/participants';
import type { ParticipantRow } from '@/types/forms';

// Each row is one 44 px line plus an 8 px gap; fixed so the virtual list never measures.
const ROW_HEIGHT_PX = 52;
const OVERSCAN_ROWS = 6;
const EMPTY_ROW: ParticipantRow = { fullName: '', groupLabel: '' };

export interface ParticipantsEditorProps extends Omit<React.ComponentProps<'div'>, 'onChange'> {
  value: readonly ParticipantRow[];
  onChange: (rows: ParticipantRow[]) => void;
  // The booking's pax: the list never grows past it.
  maxRows: number;
}

interface RowEditing {
  edit: (index: number, row: ParticipantRow) => void;
  remove: (index: number) => void;
  add: () => void;
  pasteRows: (index: number, event: React.ClipboardEvent<HTMLInputElement>) => void;
  wasTruncated: boolean;
}

// Rows are edited in place; a spreadsheet paste fills rows from the cell it lands in, capped at pax.
function useRowEditing({
  value,
  onChange,
  maxRows,
}: Pick<ParticipantsEditorProps, 'value' | 'onChange' | 'maxRows'>): RowEditing {
  const [wasTruncated, setWasTruncated] = useState(false);

  const edit = (index: number, row: ParticipantRow) => {
    onChange(value.map((current, i) => (i === index ? row : current)));
  };
  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };
  const add = () => {
    if (value.length < maxRows) onChange([...value, EMPTY_ROW]);
  };

  const pasteRows = (index: number, event: React.ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text/plain');
    if (!isMultiCellPaste(text)) return;
    event.preventDefault();
    const pasted = parseParticipantPaste(text);
    const merged = [...value.slice(0, index), ...pasted, ...value.slice(index + pasted.length)];
    setWasTruncated(merged.length > maxRows);
    onChange(merged.slice(0, maxRows));
  };

  return { edit, remove, add, pasteRows, wasTruncated };
}

// A duplicate shows a warning icon in place of its number; the text for screen readers sits on the input.
function RowNumber({ number, isDuplicate }: { number: number; isDuplicate: boolean }) {
  return (
    <span className="flex w-7 shrink-0 justify-end text-caption text-muted-foreground tabular-nums">
      {isDuplicate ? <AlertTriangle aria-hidden className="size-4 text-warning" /> : number}
    </span>
  );
}

interface RowFieldProps {
  index: number;
  row: ParticipantRow;
  isDuplicate: boolean;
  editing: RowEditing;
}

function NameInput({ index, row, isDuplicate, editing }: RowFieldProps) {
  return (
    <Input
      aria-label={copy.forms.participants.nameOf(index + 1)}
      aria-description={isDuplicate ? copy.forms.participants.duplicateRow : undefined}
      className={isDuplicate ? 'border-warning bg-warning-soft' : undefined}
      placeholder={copy.forms.participants.name}
      value={row.fullName}
      onChange={(event) => {
        editing.edit(index, { ...row, fullName: event.target.value });
      }}
      onPaste={(event) => {
        editing.pasteRows(index, event);
      }}
    />
  );
}

function ParticipantRowFields(props: RowFieldProps) {
  const { index, row, isDuplicate, editing } = props;
  const number = index + 1;
  return (
    <div className="flex h-11 items-center gap-2">
      <RowNumber number={number} isDuplicate={isDuplicate} />
      <NameInput {...props} />
      <Input
        aria-label={copy.forms.participants.groupOf(number)}
        className="w-28 shrink-0"
        placeholder={copy.forms.participants.group}
        value={row.groupLabel}
        onChange={(event) => {
          editing.edit(index, { ...row, groupLabel: event.target.value });
        }}
      />
      <Button
        type="button"
        variant="ghost"
        className="size-11 shrink-0 p-0"
        aria-label={copy.forms.participants.remove(number)}
        onClick={() => {
          editing.remove(index);
        }}
      >
        <X aria-hidden />
      </Button>
    </div>
  );
}

// Only the rows in view are mounted, so a list as long as booking.max_pax (500) stays quick on a phone.
function VirtualRows({
  rows,
  duplicates,
  editing,
}: {
  rows: readonly ParticipantRow[];
  duplicates: Set<number>;
  editing: RowEditing;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: OVERSCAN_ROWS,
  });

  return (
    <div ref={scrollRef} className="max-h-96 overflow-y-auto">
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={item.key}
            className="absolute inset-x-0 top-0"
            style={{ transform: `translateY(${String(item.start)}px)` }}
          >
            <ParticipantRowFields
              index={item.index}
              row={rows[item.index] ?? EMPTY_ROW}
              isDuplicate={duplicates.has(item.index)}
              editing={editing}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

interface FooterProps {
  count: number;
  maxRows: number;
  duplicateCount: number;
  wasTruncated: boolean;
  onAdd: () => void;
}

function EditorFooter({ count, maxRows, duplicateCount, wasTruncated, onAdd }: FooterProps) {
  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" disabled={count >= maxRows} onClick={onAdd}>
          <Plus aria-hidden /> {copy.forms.participants.add}
        </Button>
        <span className="text-caption text-muted-foreground tabular-nums" aria-live="polite">
          {copy.forms.participants.count(count, maxRows)}
        </span>
      </div>
      <p className="text-caption text-muted-foreground">{copy.forms.participants.pasteHint}</p>
      {duplicateCount > 0 && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-caption text-warning-soft-foreground">
          {copy.forms.participants.duplicates(duplicateCount)}
        </p>
      )}
      {wasTruncated && (
        <p className="rounded-lg bg-info-soft px-3 py-2 text-caption text-info-soft-foreground">
          {copy.forms.participants.truncated}
        </p>
      )}
    </div>
  );
}

// docs/StyleGuide.md §5.6: names and class only (no NIK, birth date or address fields exist), duplicates
// highlighted but never blocked, a spreadsheet paste fills rows, and the list never outgrows pax.
export function ParticipantsEditor({
  value,
  onChange,
  maxRows,
  ...props
}: ParticipantsEditorProps) {
  const editing = useRowEditing({ value, onChange, maxRows });
  const duplicates = findDuplicateRows(value);

  return (
    <div role="group" {...props}>
      <VirtualRows rows={value} duplicates={duplicates} editing={editing} />
      <EditorFooter
        count={value.length}
        maxRows={maxRows}
        duplicateCount={duplicates.size}
        wasTruncated={editing.wasTruncated}
        onAdd={editing.add}
      />
    </div>
  );
}
