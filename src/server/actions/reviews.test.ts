import { revalidateTag } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError, fail } from '@/lib/errors';
import { TAGS } from '@/lib/queries/tags';
import { requireRole, type StaffContext } from '@/server/auth/guards';
import { moderateReview } from '@/server/services/review-service';
import type { ReviewAdmin } from '@/types/review';

import { moderateReviewAction } from './reviews';

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireRole: vi.fn() }));
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
