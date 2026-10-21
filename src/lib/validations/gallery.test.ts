import { describe, expect, it } from 'vitest';

import { createGalleryItemSchema, updateGalleryItemSchema } from './gallery';

const PHOTO = {
  path: 'rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp',
  width: 1600,
  height: 1067,
  blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
  thumbnailPath: 'rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-23456789abcd-thumb.webp',
};
const FIELDS = {
  category: 'activity',
  caption: 'Warga memilah sampah di Bank Sampah Sumber Rejeki',
  altText: 'Tiga warga memilah botol plastik ke dalam karung',
  takenAt: '',
  sortOrder: 0,
  status: 'published',
};
const IMAGE_ITEM = { mediaType: 'image', image: PHOTO, videoUrl: '', still: null, ...FIELDS };
const VIDEO_ITEM = {
  mediaType: 'video',
  image: null,
  videoUrl: 'https://youtube.com/shorts/dQw4w9WgXcQ',
  still: null,
  ...FIELDS,
};

describe('createGalleryItemSchema', () => {
  it('takes a photo with its alt text and parses its own output again', () => {
    const once = createGalleryItemSchema.parse(IMAGE_ITEM);
    expect(once).toMatchObject({ takenAt: null, videoUrl: null, image: PHOTO });
    expect(createGalleryItemSchema.parse(once)).toEqual(once);
  });

  it('stores a video under the address built from its id alone', () => {
    expect(createGalleryItemSchema.parse(VIDEO_ITEM).videoUrl).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  it.each([
    ['a photo item without its photo', { ...IMAGE_ITEM, image: null }, 'image'],
    ['a video item without an address', { ...VIDEO_ITEM, videoUrl: '' }, 'videoUrl'],
    [
      'an address that is not YouTube',
      { ...VIDEO_ITEM, videoUrl: 'https://evil.example/watch?v=dQw4w9WgXcQ' },
      'videoUrl',
    ],
    ['a script for an address', { ...VIDEO_ITEM, videoUrl: 'javascript:alert(1)' }, 'videoUrl'],
    ['a missing alt text', { ...IMAGE_ITEM, altText: 'ab' }, 'altText'],
    [
      'a photo from outside public-media',
      { ...IMAGE_ITEM, image: { ...PHOTO, path: 'https://evil.example/a.webp' } },
      'image',
    ],
  ])('refuses %s', (_case, input, field) => {
    const result = createGalleryItemSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toContain(field);
  });

  // Mass assignment: the owner, the uploader, the booking link and the stored path are not the form's to set.
  it.each([
    ['rwId', 8],
    ['uploadedBy', 'user-1'],
    ['bookingId', '0192f3a4-5b6c-7d8e-9f01-23456789abcd'],
    ['storagePath', 'rw-08/gallery/x.webp'],
  ])('refuses an extra field %s', (field, value) => {
    expect(createGalleryItemSchema.safeParse({ ...IMAGE_ITEM, [field]: value }).success).toBe(
      false,
    );
  });
});

describe('updateGalleryItemSchema', () => {
  it('changes the description of an item, never its media', () => {
    const id = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';
    expect(updateGalleryItemSchema.safeParse({ id, ...FIELDS }).success).toBe(true);
    expect(updateGalleryItemSchema.safeParse({ id, ...FIELDS, image: PHOTO }).success).toBe(false);
  });
});

// Finding 3 of the independent review of PR #18: the date a photo was taken is a real calendar date.
describe('taken-at date', () => {
  it.each(['2026-02-30', '2027-02-29', '2026-13-01', '2026-04-31'])('refuses %s', (takenAt) => {
    expect(createGalleryItemSchema.safeParse({ ...IMAGE_ITEM, takenAt }).success).toBe(false);
  });

  it('takes 29 February of a leap year', () => {
    expect(
      createGalleryItemSchema.safeParse({ ...IMAGE_ITEM, takenAt: '2028-02-29' }).success,
    ).toBe(true);
  });
});
