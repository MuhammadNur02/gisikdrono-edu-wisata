import { describe, expect, it } from 'vitest';

import { updateRwPageSchema } from './rw-page';

const VALID = {
  tagline: '  Kampung bebas sampah  ',
  descriptionMd: 'Profil RW 05.',
  visionMd: '',
  heroImagePath: 'rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp',
  contactPhone: '+6281234567890',
  contactEmail: ' RW05@Example.test ',
  mapLat: -6.98,
  mapLng: 110.38,
};

describe('updateRwPageSchema', () => {
  it('trims the text, stores an empty field as nothing and lower-cases the email', () => {
    expect(updateRwPageSchema.parse(VALID)).toMatchObject({
      tagline: 'Kampung bebas sampah',
      visionMd: null,
      contactEmail: 'rw05@example.test',
    });
  });

  it('parses its own output again unchanged, as the action does after the form', () => {
    const once = updateRwPageSchema.parse(VALID);
    expect(updateRwPageSchema.parse(once)).toEqual(once);
  });

  // Mass assignment: the RW, its slug, status and treasury account are not fields of this form at all.
  it.each([
    ['rwId', 8],
    ['slug', 'rw-08-kampung-seni-budaya'],
    ['isActive', false],
    ['treasuryAccountNumber', '123'],
  ])('refuses an extra field %s', (field, value) => {
    expect(updateRwPageSchema.safeParse({ ...VALID, [field]: value }).success).toBe(false);
  });

  it.each([
    ['a phone without +62', { contactPhone: '081234567890' }],
    ['an email that is not one', { contactEmail: 'rw05' }],
    ['a latitude past the pole', { mapLat: 91 }],
    ['a photo from outside public-media', { heroImagePath: 'https://evil.example/foto.webp' }],
    ['a tagline past its cap', { tagline: 'x'.repeat(161) }],
  ])('refuses %s', (_case, change) => {
    expect(updateRwPageSchema.safeParse({ ...VALID, ...change }).success).toBe(false);
  });
});
