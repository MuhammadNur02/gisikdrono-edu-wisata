import { describe, expect, it } from 'vitest';

import { DEFAULT_PAGE_SIZE, SEARCH_MAX_LENGTH } from '@/config/dashboard';

import {
  allowedValues,
  hasActiveFilters,
  loadListQuery,
  pageCountOf,
  pageRange,
  parseSort,
  searchPattern,
  serializeSort,
} from './list-query';

describe('loadListQuery', () => {
  it('reads the defaults from an empty query string', () => {
    expect(loadListQuery({})).toEqual({
      q: '',
      sort: '',
      page: 1,
      per: DEFAULT_PAGE_SIZE,
      status: [],
      rw: null,
      category: null,
      date: null,
    });
  });

  it('keeps only a page size the table offers', () => {
    expect(loadListQuery({ per: '50' }).per).toBe(50);
    expect(loadListQuery({ per: '7' }).per).toBe(DEFAULT_PAGE_SIZE);
  });

  it('reads a status list and an RW', () => {
    const query = loadListQuery({ status: 'draft,published', rw: '5' });
    expect(query.status).toEqual(['draft', 'published']);
    expect(query.rw).toBe(5);
  });
});

describe('parseSort', () => {
  const allowed = ['name', 'updated_at'];

  it('reads a column and its direction', () => {
    expect(parseSort('name.desc', allowed)).toEqual({ column: 'name', ascending: false });
    expect(parseSort('name.asc', allowed)).toEqual({ column: 'name', ascending: true });
    expect(parseSort('name', allowed)).toEqual({ column: 'name', ascending: true });
  });

  it('ignores a column the service does not allow, and an unknown direction', () => {
    expect(parseSort('pic_phone.asc', allowed)).toBeNull();
    expect(parseSort('name.sideways', allowed)).toBeNull();
    expect(parseSort('', allowed)).toBeNull();
  });

  it('round-trips through serializeSort', () => {
    expect(serializeSort(parseSort('updated_at.desc', allowed))).toBe('updated_at.desc');
    expect(serializeSort(null)).toBe('');
  });
});

describe('searchPattern', () => {
  it('wraps the words in wildcards and escapes the ones the user typed', () => {
    expect(searchPattern('  kompos ')).toBe('%kompos%');
    expect(searchPattern('100%_')).toBe('%100\\%\\_%');
  });

  it('is null for an empty box and caps a pasted essay', () => {
    expect(searchPattern('   ')).toBeNull();
    const long = 'a'.repeat(SEARCH_MAX_LENGTH + 20);
    expect(searchPattern(long)).toBe(`%${'a'.repeat(SEARCH_MAX_LENGTH)}%`);
  });
});

describe('pageRange and pageCountOf', () => {
  it('turns a page into an inclusive row range', () => {
    expect(pageRange(1, 25)).toEqual({ from: 0, to: 24 });
    expect(pageRange(3, 25)).toEqual({ from: 50, to: 74 });
    expect(pageRange(0, 25)).toEqual({ from: 0, to: 24 });
  });

  it('counts pages, at least one', () => {
    expect(pageCountOf(0, 25)).toBe(1);
    expect(pageCountOf(26, 25)).toBe(2);
  });
});

describe('allowedValues and hasActiveFilters', () => {
  it('keeps the enum values the URL names, in the enum order', () => {
    expect(allowedValues(['published', 'nope', 'draft'], ['draft', 'published'])).toEqual([
      'draft',
      'published',
    ]);
  });

  it('knows when the list is narrowed', () => {
    const base = loadListQuery({});
    expect(hasActiveFilters(base)).toBe(false);
    expect(hasActiveFilters({ ...base, q: 'x' })).toBe(true);
    expect(hasActiveFilters({ ...base, status: ['draft'] })).toBe(true);
    expect(hasActiveFilters({ ...base, rw: 5 })).toBe(true);
    expect(hasActiveFilters({ ...base, category: 'snack' })).toBe(true);
    expect(hasActiveFilters({ ...base, date: '2026-10-23' })).toBe(true);
  });
});
