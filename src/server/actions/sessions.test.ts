import { revalidateTag } from 'next/cache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { copy } from '@/lib/copy/id';
import { requireAal2, type StaffContext } from '@/server/auth/guards';
import {
  createVisitSession,
  generateSessionsForMonth,
  readSessionOwner,
  readTemplateOwner,
  removeSessionTemplate,
  updateVisitSession,
} from '@/server/services/session-service';
import type { VisitSessionAdmin } from '@/types/session';

import {
  createVisitSessionAction,
  generateVisitSessionsAction,
  removeSessionTemplateAction,
  updateVisitSessionAction,
} from './sessions';

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock('@/server/services/rw-unit-service', () => ({
  listRwUnitsForStaff: () => Promise.resolve([{ id: 5 }, { id: 8 }, { id: 13 }]),
}));
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({ get: () => (cookie.value ? { value: cookie.value } : undefined) }),
}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireAal2: vi.fn() }));
vi.mock('@/server/services/session-service', () => ({
  createSessionTemplate: vi.fn(),
  createVisitSession: vi.fn(),
  generateSessionsForMonth: vi.fn(),
  readSessionOwner: vi.fn(),
  readTemplateOwner: vi.fn(),
  removeSessionTemplate: vi.fn(),
  removeVisitSession: vi.fn(),
  updateSessionTemplate: vi.fn(),
  updateVisitSession: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

const BASE = { userId: 'user-1', isAal2: true, totpVerifiedAt: null, claimsVersion: 1 };
const ADMIN_05: StaffContext = { ...BASE, role: 'admin_rw', rwId: 5 };
const SUPERADMIN: StaffContext = { ...BASE, role: 'superadmin', rwId: null };
const ROW_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';
const FORM = {
  sessionDate: '2026-11-07',
  label: 'Sesi pagi',
  startTime: '08:00',
  endTime: '10:00',
  capacity: 40,
  status: 'open',
  notes: '',
};
const SESSION: VisitSessionAdmin = {
  id: ROW_ID,
  rwId: 5,
  sessionDate: '2026-11-07',
  label: 'Sesi pagi',
  startTime: '08:00',
  endTime: '10:00',
  capacity: 40,
  reservedPax: 0,
  checkedInPax: 0,
  status: 'open',
  notes: null,
  templateId: null,
};

beforeEach(() => {
  // Saturday 24 October 2026 in Semarang.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-24T03:00:00Z'));
  cookie.value = '8';
  vi.mocked(requireAal2).mockReset().mockResolvedValue({ ok: true, ctx: ADMIN_05 });
  vi.mocked(createVisitSession).mockReset().mockResolvedValue(SESSION);
  vi.mocked(updateVisitSession).mockReset().mockResolvedValue(SESSION);
  vi.mocked(readSessionOwner).mockReset().mockResolvedValue(5);
  vi.mocked(readTemplateOwner).mockReset().mockResolvedValue(5);
  vi.mocked(removeSessionTemplate).mockReset().mockResolvedValue(undefined);
  vi.mocked(generateSessionsForMonth).mockReset().mockResolvedValue(8);
  vi.mocked(revalidateTag).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('session actions', () => {
  it("files an RW admin's session under their own RW, whatever the scope cookie says", async () => {
    expect(await createVisitSessionAction(FORM)).toMatchObject({ ok: true });
    expect(createVisitSession).toHaveBeenCalledWith(5, 'user-1', expect.anything());
    expect(revalidateTag).toHaveBeenCalledWith('sessions:5:2026-11');
  });

  // The guard half of the cross-RW proof; RLS refuses the same write in the database.
  it("refuses an RW 05 admin another RW's session or pattern, and answers 404 for a missing one", async () => {
    vi.mocked(readSessionOwner).mockResolvedValue(8);
    expect(await updateVisitSessionAction({ ...FORM, id: ROW_ID })).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    vi.mocked(readTemplateOwner).mockResolvedValue(undefined);
    expect(await removeSessionTemplateAction({ id: ROW_ID })).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
    expect(updateVisitSession).not.toHaveBeenCalled();
    expect(removeSessionTemplate).not.toHaveBeenCalled();
  });

  it('reads a session the guard refused because of its bookings in session words', async () => {
    const refusal = Object.assign(new Error('booked'), { code: 'P0001', hint: 'STATE_INVALID' });
    vi.mocked(updateVisitSession).mockRejectedValue(refusal);
    expect(await updateVisitSessionAction({ ...FORM, id: ROW_ID })).toMatchObject({
      error: { code: 'STATE_INVALID', message: copy.sessions.errors.hasBookings },
    });
  });

  it('asks the superadmin for an RW under Semua', async () => {
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
    cookie.value = undefined;
    expect(await generateVisitSessionsAction({ month: '2026-11' })).toMatchObject({
      error: { code: 'STATE_INVALID' },
    });
  });

  // Review of PR #35, item 6.
  it('generates from the current month through twelve ahead, and refuses others before the database', async () => {
    expect(await generateVisitSessionsAction({ month: '2026-11' })).toEqual({ ok: true, data: 8 });
    for (const month of ['2026-09', '2027-11']) {
      expect(await generateVisitSessionsAction({ month })).toMatchObject({
        error: { code: 'VALIDATION', message: copy.sessions.errors.generateRange },
      });
    }
    expect(generateSessionsForMonth).toHaveBeenCalledTimes(1);
  });

  it("reads the database's out-of-range refusal (22023) in the same words", async () => {
    vi.mocked(generateSessionsForMonth).mockRejectedValue(
      Object.assign(new Error('at most a year ahead'), { code: '22023' }),
    );
    expect(await generateVisitSessionsAction({ month: '2027-10' })).toMatchObject({
      error: { code: 'VALIDATION', message: copy.sessions.errors.generateRange },
    });
  });
});
