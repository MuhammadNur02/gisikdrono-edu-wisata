import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/db/types';
import { updateScheduleSchema } from '@/lib/validations/schedule';
import type { StaffContext } from '@/server/auth/guards';
import { removeGalleryFiles } from '@/server/services/upload-service';

import { removeSchedule, updateSchedule } from './schedule-service';
import { fakeSessionClient } from '../../../tests/fixtures/fake-session-client';

const session = vi.hoisted(() => ({ client: null as SupabaseClient<Database> | null }));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => Promise.resolve(session.client),
}));
vi.mock('@/server/services/upload-service', () => ({ removeGalleryFiles: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const ADMIN_08: StaffContext = {
  userId: '00000000-0000-4000-8000-00000000f008',
  role: 'admin_rw',
  rwId: 8,
  isAal2: true,
  totpVerifiedAt: null,
  claimsVersion: 1,
};
const SCHEDULE_ID = '0192f3a4-5b6c-7d8e-9f01-000000000c01';
const OLD_PHOTO = 'rw-08/gallery/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp';
const NEW_PHOTO = 'rw-08/gallery/0192f3a4-5b6c-7d8e-9f01-23456789abce.webp';
const STORED = {
  id: SCHEDULE_ID,
  rw_id: 8,
  title: 'Pentas Tari',
  schedule_type: 'dance_performance',
  description_md: null,
  starts_at: '2026-11-07T12:00:00+00:00',
  ends_at: '2026-11-07T14:00:00+00:00',
  venue: null,
  recurrence_rule: null,
  image_path: OLD_PHOTO,
  package_id: null,
  status: 'published',
};

function scheduleWith(imagePath: string | null) {
  return updateScheduleSchema.parse({
    id: SCHEDULE_ID,
    title: STORED.title,
    scheduleType: 'dance_performance',
    descriptionMd: '',
    startsAt: '2026-11-07T19:00',
    endsAt: '2026-11-07T21:00',
    venue: '',
    recurrenceRule: '',
    imagePath,
    packageId: null,
    status: 'published',
  });
}

beforeEach(() => {
  session.client = fakeSessionClient(STORED).client;
  vi.mocked(removeGalleryFiles).mockReset().mockResolvedValue([]);
});

// docs/Security.md R34 (decision of 2026-10-21): a photo the schedule stops showing leaves public-media, unless a
// gallery item still shows it.
describe('schedule photo', () => {
  it('removes the photo a schedule no longer shows', async () => {
    const result = await updateSchedule(ADMIN_08, scheduleWith(NEW_PHOTO));
    expect(removeGalleryFiles).toHaveBeenCalledWith(ADMIN_08, 8, [OLD_PHOTO]);
    expect(result.filesRemoved).toBe(true);
  });

  it('removes nothing when the photo stays', async () => {
    await updateSchedule(ADMIN_08, scheduleWith(OLD_PHOTO));
    expect(removeGalleryFiles).not.toHaveBeenCalled();
  });

  it('takes its photo along when the schedule is removed', async () => {
    expect(await removeSchedule(ADMIN_08, 8, SCHEDULE_ID)).toBe(true);
    expect(removeGalleryFiles).toHaveBeenCalledWith(ADMIN_08, 8, [OLD_PHOTO]);
  });

  it('removes only an archived schedule (review of PR #40)', async () => {
    const fake = fakeSessionClient(STORED);
    session.client = fake.client;
    await removeSchedule(ADMIN_08, 8, SCHEDULE_ID);
    const [write] = fake.writes;
    expect(fake.writes).toHaveLength(1);
    expect(write?.method).toBe('DELETE');
    expect(write?.url).toContain('status=eq.archived');
  });
});
