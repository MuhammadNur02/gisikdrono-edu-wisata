import { revalidateTag } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireAal2, type StaffContext } from '@/server/auth/guards';
import {
  createSchedule,
  readScheduleOwner,
  removeSchedule,
  updateSchedule,
} from '@/server/services/schedule-service';

import { createScheduleAction, removeScheduleAction, updateScheduleAction } from './schedules';

vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: () => undefined }) }));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireAal2: vi.fn() }));
vi.mock('@/server/services/schedule-service', () => ({
  createSchedule: vi.fn(),
  readScheduleOwner: vi.fn(),
  removeSchedule: vi.fn(),
  updateSchedule: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

const BASE = { userId: 'user-8', isAal2: true, totpVerifiedAt: null, claimsVersion: 1 };
const ADMIN_05: StaffContext = { ...BASE, userId: 'user-5', role: 'admin_rw', rwId: 5 };
const ADMIN_08: StaffContext = { ...BASE, role: 'admin_rw', rwId: 8 };
const SCHEDULE_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';
const INPUT = {
  title: 'Pentas Tari',
  scheduleType: 'dance_performance',
  descriptionMd: '',
  startsAt: '2026-11-07T19:00',
  endsAt: '2026-11-07T21:00',
  venue: '',
  recurrenceRule: '',
  imagePath: null,
  packageId: null,
  status: 'published',
};

beforeEach(() => {
  vi.mocked(requireAal2).mockReset().mockResolvedValue({ ok: true, ctx: ADMIN_08 });
  for (const mock of [createSchedule, updateSchedule, removeSchedule]) vi.mocked(mock).mockReset();
  vi.mocked(readScheduleOwner).mockReset().mockResolvedValue(8);
  // A removal whose files all went, unless a test says otherwise.
  vi.mocked(removeSchedule).mockResolvedValue(true);
  vi.mocked(revalidateTag).mockReset();
});

describe('schedule actions', () => {
  it("adds RW 08's schedule in the staff member's own name and refreshes the schedule page", async () => {
    await createScheduleAction(INPUT);
    expect(createSchedule).toHaveBeenCalledWith(
      'user-8',
      expect.objectContaining({ startsAt: '2026-11-07T19:00:00+07:00' }),
    );
    expect(revalidateTag).toHaveBeenCalledWith('schedules');
  });

  // docs/PRD.md FR-ADMIN-13: the RW 05 admin manages no schedule, whatever the request says.
  it('refuses the RW 05 admin before any service is called', async () => {
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: ADMIN_05 });
    expect(await createScheduleAction(INPUT)).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(await updateScheduleAction({ ...INPUT, id: SCHEDULE_ID })).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(await removeScheduleAction({ id: SCHEDULE_ID })).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(readScheduleOwner).not.toHaveBeenCalled();
    expect(createSchedule).not.toHaveBeenCalled();
  });

  it('refuses the RW 08 admin a schedule the database holds for another RW', async () => {
    vi.mocked(readScheduleOwner).mockResolvedValue(5);
    expect(await updateScheduleAction({ ...INPUT, id: SCHEDULE_ID })).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(updateSchedule).not.toHaveBeenCalled();
  });

  it('refuses a form that names the RW or the creator', async () => {
    expect(await createScheduleAction({ ...INPUT, rwId: 5 })).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    expect(await createScheduleAction({ ...INPUT, createdBy: 'user-5' })).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    expect(createSchedule).not.toHaveBeenCalled();
  });

  it('removes an RW 08 schedule', async () => {
    expect(await removeScheduleAction({ id: SCHEDULE_ID })).toEqual({ ok: true, data: null });
    expect(removeSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin_rw' }),
      SCHEDULE_ID,
    );
  });
});
