import 'server-only';

import { SECURITY_LIST_PAGE_SIZE } from '@/config/staff';
import { securityCopy } from '@/lib/copy/security';
import { AppError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { auditChangesOf } from '@/lib/utils/audit-diff';
import { pageRange } from '@/lib/utils/list-query';
import type { AlertFilter, AuditFilter } from '@/lib/validations/security';
import type { StaffContext } from '@/server/auth/guards';
import type { AuditActorOption, AuditLogEntry, PageOf, SecurityAlertRow } from '@/types/security';

// /dashboard/security-alerts and /dashboard/audit-logs (Task P4.10.02) through the superadmin's session client:
// security_alerts_super_read, audit_logs_super_read and the AAL2 policy decide, and acknowledging is the column grant
// of 0005 with its own fresh_totp() policy and the trigger that stamps acknowledged_at. Neither audit_logs.actor_ip
// nor request_id is selected; before and after hold only the allow-listed columns of internal.audit_columns.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const JAKARTA_OFFSET = '+07:00';
const ISO_DATE_LENGTH = 10;

// One row more than a page tells whether another page follows, without counting a table that only grows.
function pageOf<TRow>(rows: TRow[], page: number): PageOf<TRow> {
  return {
    rows: rows.slice(0, SECURITY_LIST_PAGE_SIZE),
    page,
    hasNext: rows.length > SECURITY_LIST_PAGE_SIZE,
  };
}

function rangeOf(page: number) {
  const { from, to } = pageRange(page, SECURITY_LIST_PAGE_SIZE);
  return { from, to: to + 1 };
}

function stringAt(details: unknown, key: string): string | null {
  if (typeof details !== 'object' || details === null || !(key in details)) return null;
  const value: unknown = Object.entries(details).find(([name]) => name === key)?.[1];
  return typeof value === 'string' && UUID.test(value) ? value : null;
}

// The staff changes of 0004 and 0005 name the profile (user_id) or the invite (invite_id) they are about.
function entityOf(details: unknown): SecurityAlertRow['entity'] {
  const userId = stringAt(details, 'user_id');
  if (userId) return { type: 'profiles', id: userId };
  const inviteId = stringAt(details, 'invite_id');
  return inviteId ? { type: 'staff_invites', id: inviteId } : null;
}

export async function listSecurityAlerts(filter: AlertFilter): Promise<PageOf<SecurityAlertRow>> {
  const supabase = await createSupabaseServerClient();
  const { from, to } = rangeOf(filter.page);
  let request = supabase
    .from('security_alerts')
    .select(
      'id, rule, severity, title, details, occurrences, first_seen_at, last_seen_at, notified_at, acknowledged_at',
    )
    .order('last_seen_at', { ascending: false })
    .range(from, to);
  if (filter.severity) request = request.eq('severity', filter.severity);
  if (filter.state === 'open') request = request.is('acknowledged_at', null);
  if (filter.state === 'acknowledged') request = request.not('acknowledged_at', 'is', null);
  const { data, error } = await request;
  if (error) throw error;
  const rows = data.map((row): SecurityAlertRow => ({
    id: row.id,
    rule: row.rule,
    severity: row.severity,
    title: row.title,
    occurrences: row.occurrences,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    notifiedAt: row.notified_at,
    acknowledgedAt: row.acknowledged_at,
    entity: entityOf(row.details),
  }));
  return pageOf(rows, filter.page);
}

// The superadmin acknowledges in their own name (security_alerts_super_acknowledge); the database dates it.
export async function acknowledgeSecurityAlert(ctx: StaffContext, alertId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('security_alerts')
    .update({ acknowledged_by: ctx.userId })
    .eq('id', alertId)
    .is('acknowledged_at', null)
    .select('id');
  if (error) throw error;
  if (data.length === 0) throw new AppError('NOT_FOUND', securityCopy.alerts.alreadyAcknowledged);
}

// The day after a date, for an inclusive end in Asia/Jakarta.
function nextDay(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, ISO_DATE_LENGTH);
}

export async function listAuditLogs(filter: AuditFilter): Promise<PageOf<AuditLogEntry>> {
  const supabase = await createSupabaseServerClient();
  const { from, to } = rangeOf(filter.page);
  let request = supabase
    .from('audit_logs')
    .select(
      'id, occurred_at, actor_id, actor_role, action, entity_type, entity_id, rw_id, before, after, metadata',
    )
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to);
  if (filter.entity) request = request.eq('entity_type', filter.entity);
  if (filter.entityId) request = request.eq('entity_id', filter.entityId);
  if (filter.actor) request = request.eq('actor_id', filter.actor);
  if (filter.from) request = request.gte('occurred_at', `${filter.from}T00:00:00${JAKARTA_OFFSET}`);
  if (filter.to)
    request = request.lt('occurred_at', `${nextDay(filter.to)}T00:00:00${JAKARTA_OFFSET}`);
  const { data, error } = await request;
  if (error) throw error;
  const rows = data.map((row): AuditLogEntry => ({
    id: row.id,
    occurredAt: row.occurred_at,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    rwId: row.rw_id,
    changes: auditChangesOf(row.before, row.after, row.metadata),
  }));
  return pageOf(rows, filter.page);
}

// The staff the actor filter offers and the names the list shows; staff only, never visitors.
export async function listAuditActors(): Promise<AuditActorOption[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .order('full_name');
  if (error) throw error;
  return data.map((row) => ({ id: row.id, name: row.full_name }));
}
