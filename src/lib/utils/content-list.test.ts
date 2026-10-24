import { describe, expect, it } from 'vitest';

import { allowedValue, planContentList } from '@/lib/utils/content-list';
import type { ListQuery } from '@/lib/utils/list-query';

const QUERY: ListQuery = {
  q: '',
  sort: '',
  page: 1,
  per: 25,
  status: [],
  rw: null,
  category: null,
};
const SORT = { columns: ['title', 'updated_at'], fallback: 'updated_at.desc' };

describe('planContentList', () => {
  it('falls back to the default order and the first page', () => {
    expect(planContentList(QUERY, null, SORT)).toEqual({
      pattern: null,
      statuses: [],
      order: { column: 'updated_at', ascending: false },
      rw: null,
      from: 0,
      to: 24,
    });
  });

  it('keeps an allowed sort, escapes the search and drops unknown statuses', () => {
    const plan = planContentList(
      {
        ...QUERY,
        q: ' 50%_off ',
        sort: 'title.asc',
        page: 3,
        per: 50,
        status: ['archived', 'gone'],
      },
      5,
      SORT,
    );
    expect(plan).toMatchObject({
      pattern: '%50\\%\\_off%',
      statuses: ['archived'],
      order: { column: 'title', ascending: true },
      rw: 5,
      from: 100,
      to: 149,
    });
  });

  it('ignores a sort by a column the list does not allow', () => {
    const plan = planContentList({ ...QUERY, sort: 'author_id.asc' }, null, SORT);
    expect(plan.order).toEqual({ column: 'updated_at', ascending: false });
  });
});

describe('allowedValue', () => {
  it('returns the value only when the enum has it', () => {
    expect(allowedValue('news', ['news', 'education'])).toBe('news');
    expect(allowedValue('gossip', ['news', 'education'])).toBeNull();
    expect(allowedValue(null, ['news'])).toBeNull();
  });
});
