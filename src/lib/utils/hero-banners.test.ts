import { describe, expect, it } from 'vitest';

import { bannerPhase, reorderBanners } from '@/lib/utils/hero-banners';

const NOW = new Date('2026-10-24T03:00:00Z');

describe('bannerPhase', () => {
  it('reads a switched-off banner as inactive whatever its dates', () => {
    expect(bannerPhase({ isActive: false, startsAt: null, endsAt: null }, NOW)).toBe('inactive');
  });

  it('reads a banner without dates as live', () => {
    expect(bannerPhase({ isActive: true, startsAt: null, endsAt: null }, NOW)).toBe('live');
  });

  it('reads a banner before its start as scheduled and after its end as ended', () => {
    const later = { isActive: true, startsAt: '2026-10-25T00:00:00+07:00', endsAt: null };
    const earlier = { isActive: true, startsAt: null, endsAt: '2026-10-24T10:00:00+07:00' };
    expect(bannerPhase(later, NOW)).toBe('scheduled');
    expect(bannerPhase(earlier, NOW)).toBe('ended');
  });

  it('treats the end as exclusive, as the public policy does', () => {
    const endsNow = { isActive: true, startsAt: null, endsAt: NOW.toISOString() };
    const startsNow = { isActive: true, startsAt: NOW.toISOString(), endsAt: null };
    expect(bannerPhase(endsNow, NOW)).toBe('ended');
    expect(bannerPhase(startsNow, NOW)).toBe('live');
  });
});

describe('reorderBanners', () => {
  const ORDER = [
    { id: 'a', sortOrder: 0 },
    { id: 'b', sortOrder: 1 },
    { id: 'c', sortOrder: 2 },
  ];

  it('swaps a banner with the one above it', () => {
    expect(reorderBanners(ORDER, 'b', 'up')).toEqual([
      { id: 'b', sortOrder: 0 },
      { id: 'a', sortOrder: 1 },
    ]);
  });

  it('swaps a banner with the one below it', () => {
    expect(reorderBanners(ORDER, 'b', 'down')).toEqual([
      { id: 'c', sortOrder: 1 },
      { id: 'b', sortOrder: 2 },
    ]);
  });

  it('changes nothing at either end or for an unknown banner', () => {
    expect(reorderBanners(ORDER, 'a', 'up')).toEqual([]);
    expect(reorderBanners(ORDER, 'c', 'down')).toEqual([]);
    expect(reorderBanners(ORDER, 'z', 'up')).toEqual([]);
  });

  it('renumbers tied or gapped orders so the move always shows', () => {
    const tied = [
      { id: 'a', sortOrder: 5 },
      { id: 'b', sortOrder: 5 },
      { id: 'c', sortOrder: 9 },
    ];
    expect(reorderBanners(tied, 'c', 'up')).toEqual([
      { id: 'a', sortOrder: 0 },
      { id: 'c', sortOrder: 1 },
      { id: 'b', sortOrder: 2 },
    ]);
  });
});
