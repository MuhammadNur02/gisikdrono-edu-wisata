import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  OFFICIAL_PHOTOS,
  POINT_PHOTO_IDS,
  RW_HERO_PHOTO_IDS,
  officialPhoto,
} from './official-media.ts';

const seedSql = readFileSync(fileURLToPath(new URL('./seed-dev.sql', import.meta.url)), 'utf8');
const RWS_IN_EDU_WISATA = [5, 13, 8];
const GALLERY_CATEGORIES = ['activity', 'umkm', 'visit', 'event'];
const OFFICIAL_PAGES =
  /^https:\/\/gisikdrono\.semarangkota\.go\.id\/(zero-wastreme|seni-budaya|potensi)$/;
// galleries.alt_text: check (length(alt_text) between 3 and 200).
const ALT_TEXT_LENGTH = { min: 3, max: 200 };

describe('scripts/official-media.ts', () => {
  it('names each photo of the official site once', () => {
    expect(new Set(OFFICIAL_PHOTOS.map((photo) => photo.id)).size).toBe(OFFICIAL_PHOTOS.length);
    expect(new Set(OFFICIAL_PHOTOS.map((photo) => photo.file)).size).toBe(OFFICIAL_PHOTOS.length);
  });

  it('gives every photo an RW of the edu wisata, a gallery category, its page, an alt text and a caption', () => {
    for (const photo of OFFICIAL_PHOTOS) {
      expect(RWS_IN_EDU_WISATA).toContain(photo.rwId);
      expect(GALLERY_CATEGORIES).toContain(photo.category);
      expect(photo.page).toMatch(OFFICIAL_PAGES);
      expect(photo.altText.length).toBeGreaterThanOrEqual(ALT_TEXT_LENGTH.min);
      expect(photo.altText.length).toBeLessThanOrEqual(ALT_TEXT_LENGTH.max);
      expect(photo.caption.trim()).not.toBe('');
    }
  });

  it('never lets a photo of children stand for an RW page or an activity point', () => {
    const standingPhotos = [...Object.values(RW_HERO_PHOTO_IDS), ...Object.values(POINT_PHOTO_IDS)];
    for (const photoId of standingPhotos) {
      expect(officialPhoto(photoId).showsChildren).toBe(false);
    }
  });

  it('shows each RW page one of its own photos', () => {
    for (const [rwId, photoId] of Object.entries(RW_HERO_PHOTO_IDS)) {
      expect(officialPhoto(photoId).rwId).toBe(Number(rwId));
    }
  });

  it('gives a photo only to an activity point that seed-dev.sql writes for the same RW', () => {
    for (const [slug, photoId] of Object.entries(POINT_PHOTO_IDS)) {
      expect(seedSql).toContain(`(${String(officialPhoto(photoId).rwId)}, '${slug}',`);
    }
  });
});
