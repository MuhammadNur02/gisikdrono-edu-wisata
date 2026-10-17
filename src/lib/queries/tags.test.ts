import { describe, expect, it } from 'vitest';

import { TAGS } from '@/lib/queries/tags';

describe('TAGS', () => {
  it('spells every tag of the CLAUDE.md §5.5 registry', () => {
    expect(TAGS.packages(5)).toBe('packages:5');
    expect(TAGS.packages('combo')).toBe('packages:combo');
    expect(TAGS.sessions(8, '2026-11')).toBe('sessions:8:2026-11');
    expect(TAGS.products(5)).toBe('products:5');
    expect(TAGS.galleries(8)).toBe('galleries:8');
    expect(TAGS.galleries('kelurahan')).toBe('galleries:kelurahan');
    expect(TAGS.rwUnits).toBe('rw-units');
    expect(TAGS.activityPoints(5)).toBe('activity-points:5');
    expect(TAGS.articles).toBe('articles');
    expect(TAGS.banners).toBe('banners');
    expect(TAGS.booklets).toBe('booklets');
    expect(TAGS.schedules).toBe('schedules');
    expect(TAGS.reviews).toBe('reviews');
    expect(TAGS.settings).toBe('settings');
    expect(TAGS.booking('0de00000-0000-4000-8000-000000000001')).toBe(
      'booking:0de00000-0000-4000-8000-000000000001',
    );
  });

  it('refuses a session month that is not YYYY-MM, since that tag would never be revalidated', () => {
    expect(() => TAGS.sessions(5, '2026-1')).toThrow('YYYY-MM');
    expect(() => TAGS.sessions(5, '2026-13')).toThrow('YYYY-MM');
    expect(() => TAGS.sessions(5, '2026-11-01')).toThrow('YYYY-MM');
  });
});
