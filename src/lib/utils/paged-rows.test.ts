import { describe, expect, it } from 'vitest';

import { collectAllRows, ROW_PAGE_SIZE, type RowPage } from './paged-rows';

const MAX_ROWS = 100;

// A PostgREST stand-in: it never returns more than max_rows (100) rows, whatever range is asked for.
function fakeServer(total: number, { countOf = (n: number): number | null => n } = {}) {
  const table = Array.from({ length: total }, (_, index) => ({ pax: 1, id: index }));
  const ranges: [number, number][] = [];
  const fetchPage = (from: number, to: number): Promise<RowPage<{ pax: number; id: number }>> => {
    ranges.push([from, to]);
    const end = Math.min(to + 1, from + MAX_ROWS);
    return Promise.resolve({ rows: table.slice(from, end), count: countOf(total) });
  };
  return { fetchPage, ranges };
}

function totalPax(rows: { pax: number }[]): number {
  return rows.reduce((sum, row) => sum + row.pax, 0);
}

describe('collectAllRows', () => {
  it('reads every page of a result larger than max_rows, so the total is the whole one', async () => {
    const server = fakeServer(250);
    const result = await collectAllRows(server.fetchPage);
    expect(result.complete).toBe(true);
    expect(result.complete && totalPax(result.rows)).toBe(250);
    expect(server.ranges).toEqual([
      [0, 99],
      [100, 199],
      [200, 299],
    ]);
  });

  it('asks once for a small result, and once for an empty one', async () => {
    const small = fakeServer(7);
    expect(await collectAllRows(small.fetchPage)).toMatchObject({ complete: true });
    expect(small.ranges).toHaveLength(1);
    expect(await collectAllRows(fakeServer(0).fetchPage)).toEqual({ complete: true, rows: [] });
  });

  it('never passes 100 rows off as the total when pages come back short', async () => {
    // A page size above max_rows: the server answers 100 of the 250 rows asked for.
    const server = fakeServer(250);
    const result = await collectAllRows(server.fetchPage, { pageSize: 250 });
    expect(result.complete && totalPax(result.rows)).toBe(250);
  });

  it('gives no figure without an exact count', async () => {
    const server = fakeServer(150, { countOf: () => null });
    expect(await collectAllRows(server.fetchPage)).toEqual({ complete: false });
  });

  it('gives no figure past the ceiling, without reading the pages', async () => {
    const server = fakeServer(3 * ROW_PAGE_SIZE);
    expect(await collectAllRows(server.fetchPage, { ceiling: 2 * ROW_PAGE_SIZE })).toEqual({
      complete: false,
    });
    expect(server.ranges).toHaveLength(1);
  });

  it('gives no figure when the rows change between pages', async () => {
    let calls = 0;
    const moving = fakeServer(250, { countOf: (n) => n + (calls++ > 0 ? 1 : 0) });
    expect(await collectAllRows(moving.fetchPage)).toEqual({ complete: false });

    const vanishing = (from: number): Promise<RowPage<{ pax: number }>> =>
      Promise.resolve({ rows: from === 0 ? [{ pax: 1 }] : [], count: 2 });
    expect(await collectAllRows(vanishing)).toEqual({ complete: false });
  });
});
