import type { AuditChange } from '@/types/security';

// /dashboard/audit-logs (Task P4.10.02): what an audit row says changed. internal.log_audit copies only the
// allow-listed columns of internal.audit_columns into before and after, and names every changed column in
// metadata.changed_columns, so a private column (a contact, a name, free text) appears by name with no value.

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function shownValue(record: JsonRecord, column: string): string | null {
  if (!(column in record)) return null;
  const value = record[column];
  if (value === null) return 'null';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function changedNamesOf(metadata: unknown): string[] {
  if (!isRecord(metadata) || !Array.isArray(metadata.changed_columns)) return [];
  return metadata.changed_columns.filter((name): name is string => typeof name === 'string');
}

// An insert has only after, a delete only before, an update the changed columns of both. Columns that hold the same
// value on both sides are left out, so the list shows what moved.
export function auditChangesOf(before: unknown, after: unknown, metadata: unknown): AuditChange[] {
  const old = isRecord(before) ? before : {};
  const next = isRecord(after) ? after : {};
  const columns = new Set([...Object.keys(old), ...Object.keys(next), ...changedNamesOf(metadata)]);
  return [...columns]
    .sort()
    .map((column) => ({ column, before: shownValue(old, column), after: shownValue(next, column) }))
    .filter((change) => change.before === null || change.before !== change.after);
}
