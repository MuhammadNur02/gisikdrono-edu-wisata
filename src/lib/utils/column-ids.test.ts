import type { ColumnDef } from '@tanstack/react-table';
import { describe, expect, it } from 'vitest';

import { sortableColumnIds } from './column-ids';

interface Row {
  id: string;
  name: string;
  status: string;
  pic: { name: string };
}

describe('sortableColumnIds', () => {
  it('lets accessorKey columns sort, under the id TanStack gives them', () => {
    const columns: ColumnDef<Row>[] = [
      { accessorKey: 'name', header: 'Nama' },
      { accessorKey: 'pic.name', header: 'PIC' },
    ];
    expect(sortableColumnIds(columns)).toEqual(['name', 'pic_name']);
  });

  it('keeps accessorFn columns by their id or string header', () => {
    const columns: ColumnDef<Row>[] = [
      { id: 'updated_at', accessorFn: (row) => row.id, header: 'Diubah' },
      { accessorFn: (row) => row.id, header: 'Kode' },
    ];
    expect(sortableColumnIds(columns)).toEqual(['updated_at', 'Kode']);
  });

  it('leaves out display columns and columns that opt out of sorting', () => {
    const columns: ColumnDef<Row>[] = [
      { accessorKey: 'name', header: 'Nama' },
      { accessorKey: 'status', header: 'Status', enableSorting: false },
      { id: 'actions', cell: () => null },
    ];
    expect(sortableColumnIds(columns)).toEqual(['name']);
  });

  it('walks the leaves of grouped columns', () => {
    const columns: ColumnDef<Row>[] = [
      {
        id: 'booker',
        header: 'Pemesan',
        columns: [
          { accessorKey: 'name', header: 'Nama' },
          { accessorKey: 'pic.name', header: 'PIC' },
        ],
      },
    ];
    expect(sortableColumnIds(columns)).toEqual(['name', 'pic_name']);
  });
});
