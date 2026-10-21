import { revalidateTag } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireAal2, type StaffContext } from '@/server/auth/guards';
import { listScheduleRwIds } from '@/server/services/rw-unit-service';
import {
  createSchedule,
  readScheduleOwner,
  removeSchedule,
  updateSchedule,
} from '@/server/services/schedule-service';

import { createScheduleAction, removeScheduleAction, updateScheduleAction } from './schedules';

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({ get: () => (cookie.value ? { value: cookie.value } : undefined) }),
}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireAal2: vi.fn() }));
// RW 08 runs the performance schedule today (rw_units.schedule_enabled).
vi.mock('@/server/services/rw-unit-service', () => ({ listScheduleRwIds: vi.fn() }));
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
const SUPERADMIN: StaffContext = { ...BASE, userId: 'user-1', role: 'superadmin', rwId: null };
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
  vi.mocked(listScheduleRwIds).mockReset().mockResolvedValue([8]);
  cookie.value = undefined;
});

describe('schedule actions', () => {
  it("adds RW 08's schedule in the staff member's own name and refreshes the schedule page", async () => {
    await createScheduleAction(INPUT);
    expect(createSchedule).toHaveBeenCalledWith(
      8,
      'user-8',
      expect.objectContaining({ startsAt: '2026-11-07T19:00:00+07:00' }),
    );
    expect(revalidateTag).toHaveBeenCalledWith('schedules');
  });

  // docs/PRD.md FR-ADMIN-13: an RW without schedule_enabled manages no schedule, whatever the request says.
  it('refuses the RW 05 admin before any schedule is read', async () => {
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
      8,
      SCHEDULE_ID,
    );
  });

  it('gives the superadmin the only RW that runs a schedule, whatever the RwSwitcher says', async () => {
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
    cookie.value = '5';
    await createScheduleAction(INPUT);
    expect(createSchedule).toHaveBeenCalledWith(8, 'user-1', expect.anything());
  });

  it('asks the superadmin to pick an RW once several run a schedule', async () => {
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
    vi.mocked(listScheduleRwIds).mockResolvedValue([8, 13]);
    expect(await createScheduleAction(INPUT)).toMatchObject({ error: { code: 'STATE_INVALID' } });
    cookie.value = '13';
    await createScheduleAction(INPUT);
    expect(createSchedule).toHaveBeenCalledWith(13, 'user-1', expect.anything());
  });

  it('lets the admin of another RW that runs a schedule manage theirs', async () => {
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: { ...ADMIN_08, rwId: 13 } });
    vi.mocked(listScheduleRwIds).mockResolvedValue([8, 13]);
    await createScheduleAction(INPUT);
    expect(createSchedule).toHaveBeenCalledWith(13, 'user-8', expect.anything());
  });
});
