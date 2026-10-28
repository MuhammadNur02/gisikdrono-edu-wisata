import { revalidateTag } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError, fail } from '@/lib/errors';
import { TAGS } from '@/lib/queries/tags';
import { verifyTurnstile } from '@/lib/turnstile';
import { requireGuestToken, requireRole, type StaffContext } from '@/server/auth/guards';
import { submitReview, withinGuestLimits } from '@/server/services/booking-service';
import { moderateReview } from '@/server/services/review-service';
import type { ReviewAdmin } from '@/types/review';

import { moderateReviewAction, submitReviewAction } from './reviews';

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ 'x-real-ip': '203.0.113.7' })),
}));
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireGuestToken: vi.fn(), requireRole: vi.fn() }));
vi.mock('@/server/services/booking-service', () => ({
  submitReview: vi.fn(),
  withinGuestLimits: vi.fn(),
}));
vi.mock('@/server/services/review-service', () => ({ moderateReview: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

const BASE = { userId: 'user-1', isAal2: true, totpVerifiedAt: null, claimsVersion: 1 };
const SUPERADMIN: StaffContext = { ...BASE, role: 'superadmin', rwId: null };
const REVIEW_ID = '6f1c2a5e-8c1b-4b7e-9a7f-2d3c4b5a6e7f';
const INPUT = { id: REVIEW_ID, status: 'published', isFeatured: true, moderationNote: '' };
const SAVED: ReviewAdmin = {
  id: REVIEW_ID,
  rating: 5,
  title: null,
  body: 'Anak-anak senang sekali belajar kompos.',
  publicReviewerName: 'Siti',
  institutionName: 'SD Negeri Gisikdrono 01',
  rwIds: [5],
  status: 'published',
  isFeatured: true,
  moderationNote: null,
  moderatedAt: '2026-10-24T10:00:00+07:00',
  createdAt: '2026-10-20T09:00:00+07:00',
};

beforeEach(() => {
  vi.mocked(requireRole).mockReset().mockResolvedValue({ ok: true, ctx: SUPERADMIN });
  vi.mocked(moderateReview).mockReset().mockResolvedValue(SAVED);
  vi.mocked(revalidateTag).mockReset();
});

describe('moderateReviewAction', () => {
  it('saves the three granted columns and refreshes the public reviews', async () => {
    const result = await moderateReviewAction(INPUT);
    expect(result).toEqual({ ok: true, data: SAVED });
    expect(requireRole).toHaveBeenCalledWith('superadmin');
    expect(moderateReview).toHaveBeenCalledWith({
      id: REVIEW_ID,
      status: 'published',
      isFeatured: true,
      moderationNote: null,
    });
    expect(revalidateTag).toHaveBeenCalledWith(TAGS.reviews);
  });

  it('refuses an RW admin before anything is written', async () => {
    vi.mocked(requireRole).mockResolvedValue(fail('FORBIDDEN'));
    const result = await moderateReviewAction(INPUT);
    expect(result.ok).toBe(false);
    expect(moderateReview).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('refuses a superadmin session below AAL2', async () => {
    vi.mocked(requireRole).mockResolvedValue({ ok: true, ctx: { ...SUPERADMIN, isAal2: false } });
    const result = await moderateReviewAction(INPUT);
    expect(result.ok ? null : result.error.code).toBe('FORBIDDEN');
    expect(moderateReview).not.toHaveBeenCalled();
  });

  it('validates before the guard and never passes extra fields on', async () => {
    const result = await moderateReviewAction({ ...INPUT, reviewer_name: 'Siti Aminah' });
    expect(result.ok ? null : result.error.code).toBe('VALIDATION');
    expect(requireRole).not.toHaveBeenCalled();
  });

  it('answers NOT_FOUND when RLS hides the review, without refreshing anything', async () => {
    vi.mocked(moderateReview).mockRejectedValue(new AppError('NOT_FOUND'));
    const result = await moderateReviewAction(INPUT);
    expect(result.ok ? null : result.error.code).toBe('NOT_FOUND');
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});

describe('submitReviewAction', () => {
  const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';
  const REVIEW = {
    bookingCode: 'GSK-7F3K9Q2M',
    rating: 5,
    title: '  ',
    body: '  Anak-anak belajar memilah sampah.  ',
    reviewerName: 'Bu Ani',
    isAnonymous: false,
    turnstileToken: 'turnstile-token',
  };

  beforeEach(() => {
    vi.mocked(requireGuestToken)
      .mockReset()
      .mockResolvedValue({
        ok: true,
        guest: {
          bookingId: BOOKING_ID,
          bookingCode: REVIEW.bookingCode,
          scope: 'review',
          tokenVersion: 1,
        },
      });
    vi.mocked(withinGuestLimits).mockReset().mockResolvedValue(true);
    vi.mocked(verifyTurnstile).mockReset().mockResolvedValue(true);
    vi.mocked(submitReview).mockReset().mockResolvedValue(undefined);
  });

  it('sends the review of the booking the link names, after the IP limit and Turnstile', async () => {
    await expect(submitReviewAction(REVIEW)).resolves.toEqual({ ok: true, data: null });
    expect(requireGuestToken).toHaveBeenCalledWith(REVIEW.bookingCode, 'review');
    expect(vi.mocked(withinGuestLimits).mock.calls[0]?.[0].map((check) => check.name)).toEqual([
      'review:submit',
    ]);
    expect(verifyTurnstile).toHaveBeenCalledWith('turnstile-token', '203.0.113.7', 'review_submit');
    expect(submitReview).toHaveBeenCalledWith(
      BOOKING_ID,
      expect.objectContaining({ title: null, body: 'Anak-anak belajar memilah sampah.' }),
    );
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('answers a browser without the review link, or whose review was sent, with NOT_FOUND', async () => {
    vi.mocked(requireGuestToken).mockResolvedValue(fail('NOT_FOUND'));
    const result = await submitReviewAction(REVIEW);
    expect(result.ok ? null : result.error.code).toBe('NOT_FOUND');
    expect(withinGuestLimits).not.toHaveBeenCalled();
    expect(submitReview).not.toHaveBeenCalled();
  });

  it('stops an IP over its daily reviews before Turnstile', async () => {
    vi.mocked(withinGuestLimits).mockResolvedValue(false);
    const result = await submitReviewAction(REVIEW);
    expect(result.ok ? null : result.error.code).toBe('RATE_LIMITED');
    expect(verifyTurnstile).not.toHaveBeenCalled();
  });

  it('refuses a failed Turnstile on its own field', async () => {
    vi.mocked(verifyTurnstile).mockResolvedValue(false);
    const result = await submitReviewAction(REVIEW);
    expect(result.ok ? null : result.error.fieldErrors).toHaveProperty('turnstileToken');
    expect(submitReview).not.toHaveBeenCalled();
  });

  it('thanks a double submit the database refused as a second review', async () => {
    vi.mocked(submitReview).mockRejectedValue({ code: '23505', message: 'duplicate key' });
    await expect(submitReviewAction(REVIEW)).resolves.toEqual({ ok: true, data: null });
  });

  it('passes any other refusal on, such as a visit nobody checked in', async () => {
    vi.mocked(submitReview).mockRejectedValue({ code: 'P0001', hint: 'STATE_INVALID' });
    const result = await submitReviewAction(REVIEW);
    expect(result.ok ? null : result.error.code).toBe('STATE_INVALID');
  });
});
