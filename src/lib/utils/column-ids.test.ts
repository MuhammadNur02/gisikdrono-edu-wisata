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
  { accessorFn: (row) => row.id, header: 'Kode' },
];

describe('columnIdOf', () => {
  it('names a column by its id, its accessorKey as TanStack spells it, or its string header', () => {
    const [name, picName, updatedAt, actions, code] = columns;
    expect(columnIdOf(name as ColumnDef<Row>)).toBe('name');
    expect(columnIdOf(picName as ColumnDef<Row>)).toBe('pic_name');
    expect(columnIdOf(updatedAt as ColumnDef<Row>)).toBe('updated_at');
    expect(columnIdOf(actions as ColumnDef<Row>)).toBe('actions');
    expect(columnIdOf(code as ColumnDef<Row>)).toBe('Kode');
  });
});

describe('sortableColumnIds', () => {
  it('keeps every named column that may sort', () => {
    expect(sortableColumnIds(columns)).toEqual(['name', 'pic_name', 'updated_at', 'Kode']);
  });
});
