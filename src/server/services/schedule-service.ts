import 'server-only';

import { rrulestr } from 'rrule';

import type { RwId } from '@/config/rw';
import type { Tables } from '@/db/types';
import { copy } from '@/lib/copy/id';
import { AppError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isPublishedImagePathFor } from '@/lib/uploads/paths';
import { toJakartaIsoString } from '@/lib/utils/dates';
import type { ScheduleValues, UpdateScheduleValues } from '@/lib/validations/schedule';
import type { StaffContext } from '@/server/auth/guards';
import { rowOrNotFound } from '@/server/services/content-errors';
import { removeFilesOrLog } from '@/server/services/content-files';
import { removeGalleryFiles } from '@/server/services/upload-service';
import type { CleanedUp, ScheduleAdmin, SchedulePackageOption } from '@/types/cms';

// The performance schedules of an RW that runs one (rw_units.schedule_enabled), through the session client, so the
// performance_schedules policies, the package-RW trigger and the AAL2 policy decide (0005). Every write names the RW
// as well as the id.

const COLUMNS =
  'id, rw_id, title, schedule_type, description_md, starts_at, ends_at, venue, recurrence_rule, image_path, package_id, status';

type ScheduleRow = Pick<
  Tables<'performance_schedules'>,
  | 'id'
  | 'rw_id'
  | 'title'
  | 'schedule_type'
  | 'description_md'
  | 'starts_at'
  | 'ends_at'
  | 'venue'
  | 'recurrence_rule'
  | 'image_path'
  | 'package_id'
  | 'status'
>;

function toScheduleAdmin(row: ScheduleRow): ScheduleAdmin {
  return {
    id: row.id,
    title: row.title,
    scheduleType: row.schedule_type,
    descriptionMd: row.description_md,
    startsAt: toJakartaIsoString(row.starts_at),
    endsAt: toJakartaIsoString(row.ends_at),
    venue: row.venue,
    recurrenceRule: row.recurrence_rule,
    imagePath: row.image_path,
    packageId: row.package_id,
    status: row.status,
  };
}

function columnsOf(values: ScheduleValues) {
  return {
    title: values.title,
    schedule_type: values.scheduleType,
    description_md: values.descriptionMd,
    starts_at: values.startsAt,
    ends_at: values.endsAt,
    venue: values.venue,
    recurrence_rule: values.recurrenceRule,
    image_path: values.imagePath,
    package_id: values.packageId,
    status: values.status,
  };
}

// The same parser the public schedule page expands the rule with (src/lib/utils/schedules.ts).
function checkRecurrence(rule: string | null): void {
  if (rule === null) return;
  try {
    rrulestr(rule);
  } catch {
    throw new AppError('VALIDATION', copy.cms.validation.recurrence);
  }
}

function checkImage(rwId: RwId, path: string | null, current: string | null): void {
  if (path === null || path === current) return;
  if (!isPublishedImagePathFor(path, { rwId, purpose: 'gallery' })) {
    throw new AppError('VALIDATION', copy.cms.validation.image);
  }
}

export async function listSchedulesForStaff(rwId: RwId): Promise<ScheduleAdmin[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('performance_schedules')
    .select(COLUMNS)
    .eq('rw_id', rwId)
    .order('starts_at', { ascending: false });
  if (error) throw error;
  return data.map(toScheduleAdmin);
}

// The packages a schedule may link: the RW's own (performance_schedules_package_rw_guard, 0005).
export async function listSchedulePackages(rwId: RwId): Promise<SchedulePackageOption[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('tour_packages')
    .select('id, name')
    .eq('rw_id', rwId)
    .order('name');
  if (error) throw error;
  return data.map((row) => ({ id: row.id, name: row.name }));
}

async function readSchedule(id: string): Promise<(ScheduleAdmin & { rwId: RwId }) | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('performance_schedules')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...toScheduleAdmin(data), rwId: data.rw_id };
}

export async function readScheduleOwner(id: string): Promise<RwId | undefined> {
  return (await readSchedule(id))?.rwId;
}

export async function createSchedule(
  rwId: RwId,
  createdBy: string,
  values: ScheduleValues,
): Promise<ScheduleAdmin> {
  checkRecurrence(values.recurrenceRule);
  checkImage(rwId, values.imagePath, null);
  // Every column is named by columnsOf; the RW is the one the action resolved, the creator the signed-in staff member.
  const row = { rw_id: rwId, created_by: createdBy, ...columnsOf(values) };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('performance_schedules')
    .insert(row)
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toScheduleAdmin(data);
}

export async function updateSchedule(
  ctx: StaffContext,
  values: UpdateScheduleValues,
): Promise<CleanedUp<ScheduleAdmin>> {
  const current = rowOrNotFound(await readSchedule(values.id));
  checkRecurrence(values.recurrenceRule);
  checkImage(current.rwId, values.imagePath, current.imagePath);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('performance_schedules')
    .update(columnsOf(values))
    .eq('id', values.id)
    .eq('rw_id', current.rwId)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw error;
  const saved = toScheduleAdmin(rowOrNotFound(data));
  const replaced = current.imagePath;
  const filesRemoved =
    replaced === null ||
    replaced === saved.imagePath ||
    (await removeSchedulePhoto(ctx, current.rwId, values.id, replaced));
  return { value: saved, filesRemoved };
}

// A photo the schedule stopped showing, or took along when it was removed, leaves public-media unless a gallery item
// still shows it (docs/Security.md R34; removeGalleryFiles counts every row that does).
async function removeSchedulePhoto(
  ctx: StaffContext,
  rwId: RwId,
  id: string,
  path: string,
): Promise<boolean> {
  return removeFilesOrLog('schedule_files', id, () => removeGalleryFiles(ctx, rwId, [path]));
}

export async function removeSchedule(ctx: StaffContext, rwId: RwId, id: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('performance_schedules')
    .delete()
    .eq('id', id)
    .eq('rw_id', rwId)
    .select('image_path')
    .maybeSingle();
  if (error) throw error;
  const removed = rowOrNotFound(data);
  return removed.image_path === null || removeSchedulePhoto(ctx, rwId, id, removed.image_path);
}
