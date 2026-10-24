import type { EnumValue } from '@/db/enums';

// /dashboard/security-alerts and /dashboard/audit-logs (Task P4.10.02), read by the superadmin under RLS.

// One page of a list read newest first, without a count: audit_logs grows without bound, so the page only knows
// whether another one follows.
export interface PageOf<TRow> {
  rows: TRow[];
  page: number;
  hasNext: boolean;
}

export interface SecurityAlertRow {
  id: string;
  rule: string;
  severity: EnumValue<'alert_severity'>;
  title: string;
  occurrences: number;
  // ISO strings.
  firstSeenAt: string;
  lastSeenAt: string;
  notifiedAt: string | null;
  acknowledgedAt: string | null;
  // The audit trail the alert is about, when its details name a staff profile or an invite.
  entity: { type: 'profiles' | 'staff_invites'; id: string } | null;
}

export interface AuditLogEntry {
  id: number;
  occurredAt: string;
  actorId: string | null;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string | null;
  rwId: number | null;
  changes: AuditChange[];
}

export interface AuditActorOption {
  id: string;
  name: string;
}

// One column an audit row says changed (src/lib/utils/audit-diff.ts).
export interface AuditChange {
  column: string;
  // Null when the value was not copied: a private column, or one the row did not have on that side.
  before: string | null;
  after: string | null;
}
