import { describe, expect, it } from 'vitest';

import {
  createHeroBannerSchema,
  moveHeroBannerSchema,
  updateHeroBannerSchema,
} from './hero-banner';

const BANNER = {
  title: 'Kunjungi Bank Sampah Sumber Rejeki',
  subtitle: 'Warga RW 05 memilah sampah setiap Minggu pagi',
  ctaLabel: 'Lihat paket',
  ctaHref: '/paket-wisata',
  imagePath: 'kelurahan/hero/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp',
  mobileImagePath: null,
  productId: null,
  sortOrder: 0,
  isActive: true,
  startsAt: '2026-11-01T08:00',
  endsAt: '',
};

function issuePaths(input: unknown) {
  const result = createHeroBannerSchema.safeParse(input);
  return result.error?.issues.map((issue) => issue.path.join('.')) ?? [];
}

describe('createHeroBannerSchema', () => {
  it('takes a banner and parses its own output again', () => {
    const once = createHeroBannerSchema.parse(BANNER);
    expect(once).toMatchObject({ startsAt: '2026-11-01T08:00:00+07:00', endsAt: null });
    expect(createHeroBannerSchema.parse(once)).toEqual(once);
  });

  // The button stays on this site: cta_href's CHECK, and no space or backslash that could make it another host.
  it.each([
    'https://evil.example/paket',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/paket wisata',
    'paket-wisata',
  ])('refuses the button address %s', (ctaHref) => {
    expect(issuePaths({ ...BANNER, ctaHref })).toContain('ctaHref');
  });

  it('asks for the button text and its address together', () => {
    expect(issuePaths({ ...BANNER, ctaHref: '' })).toContain('ctaHref');
    expect(issuePaths({ ...BANNER, ctaLabel: '', ctaHref: '' })).toEqual([]);
  });

  it('asks for the photo and for an end after the start', () => {
    expect(issuePaths({ ...BANNER, imagePath: null })).toContain('imagePath');
    expect(issuePaths({ ...BANNER, endsAt: '2026-10-31T08:00' })).toContain('endsAt');
  });

  it.each([
    ['createdBy', '0192f3a4-5b6c-7d8e-9f01-23456789abcd'],
    ['id', '0192f3a4-5b6c-7d8e-9f01-23456789abcd'],
    ['rwId', 5],
  ])('refuses a new banner that names %s', (field, value) => {
    expect(createHeroBannerSchema.safeParse({ ...BANNER, [field]: value }).success).toBe(false);
  });

  it('takes the id on an update only', () => {
    const id = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';
    expect(updateHeroBannerSchema.safeParse({ ...BANNER, id }).success).toBe(true);
  });
});

// Finding 3 of the independent review of PR #18: a banner's window starts and ends on real calendar dates.
describe('banner window dates', () => {
  it.each([
    ['startsAt', '2026-02-30T08:00'],
    ['endsAt', '2026-04-31T08:00'],
  ])('refuses %s %s', (field, value) => {
    expect(issuePaths({ ...BANNER, [field]: value })).toContain(field);
  });
});

describe('moveHeroBannerSchema', () => {
  const ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';

  it('takes a banner id and a direction', () => {
    expect(moveHeroBannerSchema.safeParse({ id: ID, direction: 'up' }).success).toBe(true);
    expect(moveHeroBannerSchema.safeParse({ id: ID, direction: 'down' }).success).toBe(true);
  });

  it('refuses another direction, a sort number or an extra field', () => {
    expect(moveHeroBannerSchema.safeParse({ id: ID, direction: 'top' }).success).toBe(false);
    expect(moveHeroBannerSchema.safeParse({ id: ID, direction: 'up', sortOrder: 0 }).success).toBe(
      false,
    );
  });
});
