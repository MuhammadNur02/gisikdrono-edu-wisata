import 'server-only';

import { endOfMonth, startOfMonth } from 'date-fns';

import type { RwId } from '@/config/rw';
import { generateVisitSessions } from '@/db/rpc';
import type { Tables } from '@/db/types';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { calendarDateToVisitDate, visitDateToCalendarDate } from '@/lib/utils/dates';
import type {
  SessionTemplateValues,
  UpdateSessionTemplateValues,
  UpdateVisitSessionValues,
  VisitSessionValues,
} from '@/lib/validations/session';
import { rowOrNotFound } from '@/server/services/content-errors';
import type { SessionTemplateAdmin, VisitSessionAdmin } from '@/types/session';

// The sessions and weekly pattern of one RW (Task P4.3.04, docs/PRD.md FR-ADMIN-03), through the session client, so
// the visit_sessions and session_templates policies decide (0005) and visit_sessions_guard (0004) keeps a session
// with bookings in its place. reserved_pax and checked_in_pax are read, never written here (CLAUDE.md §7.1).

const SESSION_COLUMNS =
  'id, rw_id, session_date, start_time, end_time, label, capacity, reserved_pax, checked_in_pax, status, template_id, notes';
const TEMPLATE_COLUMNS = 'id, rw_id, weekday, label, start_time, end_time, capacity, is_active';

type SessionRow = Pick<
  Tables<'visit_sessions'>,
  | 'id'
  | 'rw_id'
  | 'session_date'
  | 'start_time'
  | 'end_time'
  | 'label'
  | 'capacity'
  | 'reserved_pax'
  | 'checked_in_pax'
  | 'status'
  | 'template_id'
  | 'notes'
>;

type TemplateRow = Pick<
  Tables<'session_templates'>,
  'id' | 'rw_id' | 'weekday' | 'label' | 'start_time' | 'end_time' | 'capacity' | 'is_active'
>;

function toVisitSessionAdmin(row: SessionRow): VisitSessionAdmin {
  return {
    id: row.id,
    rwId: row.rw_id,
    sessionDate: row.session_date,
    startTime: row.start_time,
    endTime: row.end_time,
    label: row.label,
    capacity: row.capacity,
    reservedPax: row.reserved_pax,
    checkedInPax: row.checked_in_pax,
    status: row.status,
    templateId: row.template_id,
    notes: row.notes,
  };
}

function toSessionTemplateAdmin(row: TemplateRow): SessionTemplateAdmin {
  return {
    id: row.id,
    rwId: row.rw_id,
    weekday: row.weekday,
    label: row.label,
    startTime: row.start_time,
    endTime: row.end_time,
    capacity: row.capacity,
    isActive: row.is_active,
  };
}

// The first and last visit date of a `YYYY-MM` month.
export function monthRange(month: string): { from: string; to: string } {
  const first = visitDateToCalendarDate(`${month}-01`);
  return {
    from: calendarDateToVisitDate(startOfMonth(first)),
    to: calendarDateToVisitDate(endOfMonth(first)),
  };
}

export async function listSessionsForMonth(
  rwId: RwId,
  month: string,
): Promise<VisitSessionAdmin[]> {
  const { from, to } = monthRange(month);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('visit_sessions')
    .select(SESSION_COLUMNS)
    .eq('rw_id', rwId)
    .gte('session_date', from)
    .lte('session_date', to)
    .order('session_date')
    .order('start_time');
  if (error) throw error;
  return data.map(toVisitSessionAdmin);
}

export async function listSessionTemplates(rwId: RwId): Promise<SessionTemplateAdmin[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('session_templates')
    .select(TEMPLATE_COLUMNS)
    .eq('rw_id', rwId)
    .order('weekday')
    .order('start_time');
  if (error) throw error;
  return data.map(toSessionTemplateAdmin);
}

// The RW a session or template belongs to, for the action's scope check; undefined when RLS shows no such row.
export async function readSessionOwner(id: string): Promise<RwId | undefined> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('visit_sessions')
    .select('rw_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data?.rw_id;
}

export async function readTemplateOwner(id: string): Promise<RwId | undefined> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('session_templates')
    .select('rw_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data?.rw_id;
}

function sessionColumnsOf(values: VisitSessionValues) {
  return {
    session_date: values.sessionDate,
    start_time: values.startTime,
    end_time: values.endTime,
    label: values.label,
    capacity: values.capacity,
    status: values.status,
    notes: values.notes,
  };
}

export async function createVisitSession(
  rwId: RwId,
  createdBy: string,
  values: VisitSessionValues,
): Promise<VisitSessionAdmin> {
  // Every column is named by sessionColumnsOf; the RW is the one the action resolved, the creator the signed-in
  // staff member (visit_sessions_staff_insert).
  const row = { rw_id: rwId, created_by: createdBy, ...sessionColumnsOf(values) };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('visit_sessions')
    .insert(row)
    .select(SESSION_COLUMNS)
    .single();
  if (error) throw error;
  return toVisitSessionAdmin(data);
}

export async function updateVisitSession(
  rwId: RwId,
  values: UpdateVisitSessionValues,
): Promise<VisitSessionAdmin> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('visit_sessions')
    .update(sessionColumnsOf(values))
    .eq('id', values.id)
    .eq('rw_id', rwId)
    .select(SESSION_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return toVisitSessionAdmin(rowOrNotFound(data));
}

export async function removeVisitSession(rwId: RwId, id: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('visit_sessions')
    .delete()
    .eq('id', id)
    .eq('rw_id', rwId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  rowOrNotFound(data);
}

function templateColumnsOf(values: SessionTemplateValues) {
  return {
    weekday: values.weekday,
    label: values.label,
    start_time: values.startTime,
    end_time: values.endTime,
    capacity: values.capacity,
    is_active: values.isActive,
  };
}

export async function createSessionTemplate(
  rwId: RwId,
  values: SessionTemplateValues,
): Promise<SessionTemplateAdmin> {
  const row = { rw_id: rwId, ...templateColumnsOf(values) };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('session_templates')
    .insert(row)
    .select(TEMPLATE_COLUMNS)
    .single();
  if (error) throw error;
  return toSessionTemplateAdmin(data);
}

export async function updateSessionTemplate(
  rwId: RwId,
  values: UpdateSessionTemplateValues,
): Promise<SessionTemplateAdmin> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('session_templates')
    .update(templateColumnsOf(values))
    .eq('id', values.id)
    .eq('rw_id', rwId)
    .select(TEMPLATE_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return toSessionTemplateAdmin(rowOrNotFound(data));
}

export async function removeSessionTemplate(rwId: RwId, id: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('session_templates')
    .delete()
    .eq('id', id)
    .eq('rw_id', rwId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  rowOrNotFound(data);
}

// generate_visit_sessions (0004) fills the month from the active pattern, skipping days that passed and sessions
// that exist; it checks aal2() and owns_rw() itself and answers how many it created.
export async function generateSessionsForMonth(rwId: RwId, month: string): Promise<number> {
  const { from, to } = monthRange(month);
  const supabase = await createSupabaseServerClient();
  return generateVisitSessions(supabase, { rwId, from, to });
}
