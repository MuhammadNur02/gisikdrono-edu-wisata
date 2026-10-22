import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { copy } from '@/lib/copy/id';
import { AppError, fail, mapError, ok, raisedHintOf, resultResponse } from '@/lib/errors';

vi.mock('next/headers', () => ({
  headers: () => Promise.reject(new Error('outside a request')),
}));

describe('ok and fail', () => {
  it('wrap data and errors in the ActionResult shape with Indonesian copy', () => {
    expect(ok({ id: 1 })).toEqual({ ok: true, data: { id: 1 } });
    expect(fail('QUOTA_EXCEEDED')).toEqual({
      ok: false,
      error: { code: 'QUOTA_EXCEEDED', message: copy.errors.QUOTA_EXCEEDED },
    });
  });
});

describe('resultResponse', () => {
  it('answers 200 for data and the code status for a failure, never cacheable', async () => {
    const success = resultResponse(ok({ path: 'rw-05/x.webp' }));
    const refused = resultResponse(fail('RATE_LIMITED'));

    expect(success.status).toBe(200);
    expect(await success.json()).toEqual({ ok: true, data: { path: 'rw-05/x.webp' } });
    expect(refused.status).toBe(429);
    expect(refused.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('mapError', () => {
  it('turns a zod failure into VALIDATION with field errors', async () => {
    const parsed = z
      .object({ pax: z.number().min(1) })
      .strict()
      .safeParse({ pax: 0 });
    expect(parsed.success).toBe(false);
    const result = await mapError(parsed.error);
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.fieldErrors?.pax).toHaveLength(1);
  });

  it('maps a unique violation to CONFLICT', async () => {
    expect((await mapError({ code: '23505', message: 'duplicate key' })).error.code).toBe(
      'CONFLICT',
    );
  });

  it.each([
    ['QUOTA_UNAVAILABLE', 'QUOTA_EXCEEDED'],
    ['STATE_INVALID', 'STATE_INVALID'],
    ['PRICE_MISMATCH', 'PRICE_MISMATCH'],
    ['RATE_LIMITED', 'RATE_LIMITED'],
    // Review of PR #27, M1: booking-service.ts answers it itself; anywhere else it reads as before it had a name.
    ['CONTACT_UNVERIFIED', 'STATE_INVALID'],
  ])('maps a raised exception with hint %s to %s', async (hint, code) => {
    expect((await mapError({ code: 'P0001', hint })).error.code).toBe(code);
  });

  it('keeps the code and message of an AppError', async () => {
    const result = await mapError(new AppError('NOT_FOUND', 'Paket tidak ditemukan.'));
    expect(result.error).toEqual({ code: 'NOT_FOUND', message: 'Paket tidak ditemukan.' });
  });

  it('hides anything unexpected behind INTERNAL, without the raw message', async () => {
    const result = await mapError(new Error('relation "bookings" does not exist'));
    expect(result.error).toEqual({ code: 'INTERNAL', message: copy.errors.INTERNAL });

    const unknownHint = await mapError({ code: 'P0001', hint: 'SOMETHING_NEW' });
    expect(unknownHint.error.code).toBe('INTERNAL');
  });

  it('gives AppError the HTTP status of its code', () => {
    expect(new AppError('RATE_LIMITED').status).toBe(429);
  });
});

describe('raisedHintOf', () => {
  it('reads the hint of an exception an internal function raised, and of nothing else', () => {
    expect(raisedHintOf({ code: 'P0001', hint: 'CONTACT_UNVERIFIED' })).toBe('CONTACT_UNVERIFIED');
    expect(raisedHintOf({ code: 'P0001', hint: null })).toBeUndefined();
    expect(raisedHintOf({ code: '23505', hint: 'CONTACT_UNVERIFIED' })).toBeUndefined();
    expect(raisedHintOf(new Error('CONTACT_UNVERIFIED'))).toBeUndefined();
  });
});
