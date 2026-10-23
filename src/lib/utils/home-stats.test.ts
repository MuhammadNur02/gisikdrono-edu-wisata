import { describe, expect, it } from 'vitest';

import { buildHomeStats, countVendors, hasHomeStats, type HomeStatsSource } from './home-stats';

const rating = { averageRating: 4.9, reviewCount: 12 };

function source(overrides: Partial<HomeStatsSource> = {}): HomeStatsSource {
  return {
    rwUnits: [{}, {}, {}],
    packages: [{}, {}, {}, {}, {}],
    points: [{}, {}, {}, {}, {}, {}, {}],
    products: [{ vendor: { slug: 'bank-sampah' } }, { vendor: { slug: 'pkk-rw-05' } }],
    ratingSummary: rating,
    ...overrides,
  };
}

describe('countVendors', () => {
  it('counts each vendor once, however many products it sells', () => {
    expect(
      countVendors([
        { vendor: { slug: 'pkk-rw-05' } },
        { vendor: { slug: 'pkk-rw-05' } },
        { vendor: { slug: 'sanggar' } },
      ]),
    ).toBe(2);
  });

  it('leaves out products whose vendor the public cannot see', () => {
    expect(countVendors([{ vendor: null }, { vendor: { slug: 'sanggar' } }])).toBe(1);
    expect(countVendors([])).toBe(0);
  });
});

describe('buildHomeStats', () => {
  it('counts the rows the page already reads, in a fixed order, with the rating beside them', () => {
    expect(buildHomeStats(source())).toEqual({
      counts: [
        { key: 'rws', value: 3 },
        { key: 'packages', value: 5 },
        { key: 'points', value: 7 },
        { key: 'vendors', value: 2 },
      ],
      rating,
    });
  });

  it('hides a count of zero rather than showing it', () => {
    const stats = buildHomeStats(source({ points: [], products: [{ vendor: null }] }));
    expect(stats.counts.map((count) => count.key)).toEqual(['rws', 'packages']);
  });

  it('has no rating while no review is published', () => {
    expect(buildHomeStats(source({ ratingSummary: null })).rating).toBeNull();
  });

  it('keeps two figures, the rating counting as one', () => {
    const stats = buildHomeStats(
      source({ packages: [], points: [], products: [], rwUnits: [{}], ratingSummary: rating }),
    );
    expect(stats).toEqual({ counts: [{ key: 'rws', value: 1 }], rating });
    expect(hasHomeStats(stats)).toBe(true);
  });

  it('hides the whole row when fewer than two figures are left', () => {
    const lonely = buildHomeStats(
      source({ packages: [], points: [], products: [], ratingSummary: null }),
    );
    expect(lonely).toEqual({ counts: [], rating: null });
    expect(hasHomeStats(lonely)).toBe(false);

    const onlyRating = buildHomeStats(
      source({ rwUnits: [], packages: [], points: [], products: [] }),
    );
    expect(onlyRating).toEqual({ counts: [], rating: null });
  });
});
