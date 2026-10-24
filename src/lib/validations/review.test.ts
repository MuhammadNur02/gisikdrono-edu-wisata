import { describe, expect, it } from 'vitest';

import { REVIEW_LIMITS } from '@/config/reviews';
import { moderateReviewSchema, submitReviewSchema } from '@/lib/validations/review';

const REVIEW = {
  bookingCode: 'GSK-7F3K9Q2M',
  rating: 5,
  title: 'Seru dan mendidik',
  body: 'Anak-anak belajar memilah sampah dan membuat kompos bersama ibu-ibu PKK.',
  reviewerName: 'Siti Aminah',
  isAnonymous: false,
  turnstileToken: 'token',
};

const MODERATION = {
  id: '6f1c2a5e-8c1b-4b7e-9a7f-2d3c4b5a6e7f',
  status: 'published',
  isFeatured: true,
  moderationNote: '  Sudah dicek  ',
};

describe('submitReviewSchema', () => {
  it('accepts a complete review and parses its own output again', () => {
    const parsed = submitReviewSchema.parse(REVIEW);
    expect(submitReviewSchema.parse(parsed)).toEqual(parsed);
  });

  it('rejects fields it does not know (strict)', () => {
    expect(submitReviewSchema.safeParse({ ...REVIEW, status: 'published' }).success).toBe(false);
    expect(submitReviewSchema.safeParse({ ...REVIEW, bookingId: 'x' }).success).toBe(false);
  });

  it.each([0, 6, 4.5])('rejects the rating %s', (rating) => {
    expect(submitReviewSchema.safeParse({ ...REVIEW, rating }).success).toBe(false);
  });

  it.each([1, 5])('accepts the boundary rating %s', (rating) => {
    expect(submitReviewSchema.safeParse({ ...REVIEW, rating }).success).toBe(true);
  });

  it('keeps the body between 10 and 2000 characters after trimming', () => {
    const atMinimum = 'a'.repeat(REVIEW_LIMITS.bodyMin);
    const atMaximum = 'a'.repeat(REVIEW_LIMITS.bodyMax);
    expect(submitReviewSchema.safeParse({ ...REVIEW, body: atMinimum }).success).toBe(true);
    expect(submitReviewSchema.safeParse({ ...REVIEW, body: `  ${'a'.repeat(9)}  ` }).success).toBe(
      false,
    );
    expect(submitReviewSchema.safeParse({ ...REVIEW, body: atMaximum }).success).toBe(true);
    expect(submitReviewSchema.safeParse({ ...REVIEW, body: `${atMaximum}a` }).success).toBe(false);
  });

  it('turns a blank title into null and caps it at 120 characters', () => {
    expect(submitReviewSchema.parse({ ...REVIEW, title: '   ' }).title).toBeNull();
    expect(submitReviewSchema.parse({ ...REVIEW, title: undefined }).title).toBeNull();
    const tooLong = 'a'.repeat(REVIEW_LIMITS.title + 1);
    expect(submitReviewSchema.safeParse({ ...REVIEW, title: tooLong }).success).toBe(false);
  });

  it('keeps the display name between 2 and 60 characters', () => {
    expect(submitReviewSchema.safeParse({ ...REVIEW, reviewerName: 'A' }).success).toBe(false);
    const tooLong = 'a'.repeat(REVIEW_LIMITS.reviewerNameMax + 1);
    expect(submitReviewSchema.safeParse({ ...REVIEW, reviewerName: tooLong }).success).toBe(false);
  });

  it.each([
    ['body', 'Hubungi kami di 081234567890 untuk paket murah'],
    ['body', 'Kunjungi https://contoh.example untuk diskon'],
    ['title', 'promo di toko.example'],
    ['reviewerName', 'siti@example.com'],
  ])('refuses a link, address or phone number in %s', (field, value) => {
    expect(submitReviewSchema.safeParse({ ...REVIEW, [field]: value }).success).toBe(false);
  });

  it('refuses a malformed booking code and a missing Turnstile token', () => {
    expect(submitReviewSchema.safeParse({ ...REVIEW, bookingCode: 'GSK-123' }).success).toBe(false);
    expect(submitReviewSchema.safeParse({ ...REVIEW, turnstileToken: '' }).success).toBe(false);
  });
});

describe('moderateReviewSchema', () => {
  it('accepts a moderation, trims the note and parses its own output again', () => {
    const parsed = moderateReviewSchema.parse(MODERATION);
    expect(parsed.moderationNote).toBe('Sudah dicek');
    expect(moderateReviewSchema.parse(parsed)).toEqual(parsed);
  });

  it('turns a blank or missing note into null', () => {
    expect(moderateReviewSchema.parse({ ...MODERATION, moderationNote: ' ' }).moderationNote).toBe(
      null,
    );
    const withoutNote = { id: MODERATION.id, status: MODERATION.status, isFeatured: false };
    expect(moderateReviewSchema.parse(withoutNote).moderationNote).toBeNull();
  });

  it('rejects fields outside the column grant (strict)', () => {
    for (const extra of [{ reviewer_name: 'Siti' }, { body: 'diubah' }, { rating: 1 }]) {
      expect(moderateReviewSchema.safeParse({ ...MODERATION, ...extra }).success).toBe(false);
    }
  });

  it('rejects a status the enum does not have and an id that is no uuid', () => {
    expect(moderateReviewSchema.safeParse({ ...MODERATION, status: 'archived' }).success).toBe(
      false,
    );
    expect(moderateReviewSchema.safeParse({ ...MODERATION, id: '42' }).success).toBe(false);
  });

  it.each(['pending', 'rejected'] as const)('refuses to feature a %s review', (status) => {
    const result = moderateReviewSchema.safeParse({ ...MODERATION, status });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['isFeatured']);
    expect(
      moderateReviewSchema.safeParse({ ...MODERATION, status, isFeatured: false }).success,
    ).toBe(true);
  });

  it('caps the note at 500 characters', () => {
    const note = 'a'.repeat(REVIEW_LIMITS.moderationNote + 1);
    expect(moderateReviewSchema.safeParse({ ...MODERATION, moderationNote: note }).success).toBe(
      false,
    );
  });
});
