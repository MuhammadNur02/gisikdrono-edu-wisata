import { describe, expect, it } from 'vitest';

import {
  browseEntries,
  chosenOptions,
  fillChoiceTemplate,
  matchesSearch,
  normaliseSearch,
  sortEntries,
  sortFor,
  type BrowseGroup,
  type BrowseSort,
} from '@/lib/utils/catalogue-browse';

const GROUPS: BrowseGroup[] = [
  {
    param: 'rw',
    label: 'Kampung',
    allLabel: 'Semua kampung',
    options: [
      { value: '05', label: 'RW 05 · Ecowastreme', name: 'Ecowastreme' },
      { value: '13', label: 'RW 13 · Kampung Budaya & Seni', name: 'Kampung Budaya & Seni' },
    ],
  },
  {
    param: 'type',
    label: 'Jenis rombongan',
    allLabel: 'Semua jenis',
    options: [{ value: 'institutional', label: 'Institusi', name: 'institusi' }],
  },
];

const SORTS: BrowseSort[] = [
  { value: 'harga', label: 'Harga terendah', key: 'price', direction: 'asc' },
  { value: 'harga-tertinggi', label: 'Harga tertinggi', key: 'price', direction: 'desc' },
];

const ENTRIES = [
  { key: 'a', facets: { rw: ['05'] }, sortValues: { price: 40000 }, searchText: 'Bibit Cabai' },
  { key: 'b', facets: { rw: ['13'] }, sortValues: { price: 35000 }, searchText: 'Gantungan Kunci' },
  { key: 'c', facets: { rw: ['05'] }, searchText: 'Pupuk Kompos 1 kg' },
];

const keysOf = (entries: readonly { key: string }[]) => entries.map((entry) => entry.key);

describe('normaliseSearch / matchesSearch', () => {
  it('lowers, strips diacritics and collapses spaces', () => {
    expect(normaliseSearch('  Kompos   1 KG é ')).toBe('kompos 1 kg e');
  });

  it('needs every word somewhere in the text, and an empty query matches all', () => {
    expect(matchesSearch('Pupuk Kompos 1 kg', 'kompos pupuk')).toBe(true);
    expect(matchesSearch('Pupuk Kompos 1 kg', 'kompos bibit')).toBe(false);
    expect(matchesSearch(undefined, '   ')).toBe(true);
    expect(matchesSearch(undefined, 'x')).toBe(false);
  });
});

describe('sortFor / sortEntries', () => {
  it('falls back to the first sort, or none without sorts', () => {
    expect(sortFor(SORTS, null)?.value).toBe('harga');
    expect(sortFor(SORTS, 'nope')?.value).toBe('harga');
    expect(sortFor(SORTS, 'harga-tertinggi')?.value).toBe('harga-tertinggi');
    expect(sortFor([], null)).toBeNull();
  });

  it('orders by the key and keeps entries without the value at the end', () => {
    expect(keysOf(sortEntries(ENTRIES, SORTS[0] ?? null))).toEqual(['b', 'a', 'c']);
    expect(keysOf(sortEntries(ENTRIES, SORTS[1] ?? null))).toEqual(['c', 'a', 'b']);
    expect(keysOf(sortEntries(ENTRIES, null))).toEqual(['a', 'b', 'c']);
  });
});

describe('browseEntries', () => {
  it('filters by facets and search, then sorts', () => {
    expect(keysOf(browseEntries(ENTRIES, { rw: '05' }, 'kompos', SORTS[0] ?? null))).toEqual(['c']);
    expect(browseEntries(ENTRIES, { rw: null }, '', SORTS[0] ?? null)).toHaveLength(3);
  });
});

describe('chosenOptions / fillChoiceTemplate', () => {
  it('lists the chosen option of each group in order', () => {
    expect(chosenOptions(GROUPS, { rw: '13', type: null }).map((option) => option.value)).toEqual([
      '13',
    ]);
  });

  it('fills every placeholder with the chosen names, or gives NULL', () => {
    const template = '{rw} belum punya paket khusus {type}.';
    expect(fillChoiceTemplate(template, GROUPS, { rw: '13', type: 'institutional' })).toBe(
      'Kampung Budaya & Seni belum punya paket khusus institusi.',
    );
    expect(fillChoiceTemplate(template, GROUPS, { rw: '13', type: null })).toBeNull();
    expect(fillChoiceTemplate(undefined, GROUPS, { rw: '13' })).toBeNull();
    expect(fillChoiceTemplate('{unknown}', GROUPS, {})).toBeNull();
  });
});
