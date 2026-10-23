import type { ColumnDef } from '@tanstack/react-table';
import { describe, expect, it } from 'vitest';

import { columnIdOf, sortableColumnIds } from './column-ids';

interface Row {
  id: string;
  name: string;
  pic: { name: string };
}

const columns: ColumnDef<Row>[] = [
  { accessorKey: 'name', header: 'Nama' },
  { accessorKey: 'pic.name', header: 'PIC' },
  { id: 'updated_at', accessorFn: (row) => row.id, header: 'Diubah' },
  { id: 'actions', cell: () => null, enableSorting: false },
  { cell: () => null },
];

describe('columnIdOf', () => {
  it('names a column by its id, or by its accessorKey as TanStack spells it', () => {
    expect(columnIdOf(columns[0] as ColumnDef<Row>)).toBe('name');
    expect(columnIdOf(columns[1] as ColumnDef<Row>)).toBe('pic_name');
    expect(columnIdOf(columns[2] as ColumnDef<Row>)).toBe('updated_at');
    expect(columnIdOf(columns[4] as ColumnDef<Row>)).toBeNull();
  });
});

describe('sortableColumnIds', () => {
  it('keeps every named column that may sort', () => {
    expect(sortableColumnIds(columns)).toEqual(['name', 'pic_name', 'updated_at']);
  });
});
