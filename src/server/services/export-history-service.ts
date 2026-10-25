import 'server-only';

import { z } from 'zod';

import { DB_ENUMS } from '@/db/enums';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { allowedValues, pageRange, searchPattern, type ListQuery } from '@/lib/utils/list-query';
import type { ListResult } from '@/types/data-table';
import type { ExportListItem } from '@/types/export';

// The /dashboard/exports history (Task P4.6.03), read under the staff member's own session only.

const HISTORY_COLUMNS =
  'id, kind, format, filters, rw_id, row_count, reason, requested_by, storage_path, expires_at, deleted_at, failed_at, created_at';

const historyRowSchema = z.object({
  id: z.uuid(),
  kind: z.enum(DB_ENUMS.export_kind),
  format: z.enum(['csv', 'xlsx', 'pdf']),
  filters: z.object({ from: z.string().nullish(), to: z.string().nullish() }).loose(),
  rw_id: z.number().nullable(),
  row_count: z.number().nullable(),
  reason: z.string().nullable(),
  requested_by: z.uuid(),
  storage_path: z.string().nullable(),
  expires_at: z.string(),
  deleted_at: z.string().nullable(),
  failed_at: z.string().nullable(),
  created_at: z.string(),
});

type HistoryRow = z.infer<typeof historyRowSchema>;

function toListItem(
  row: HistoryRow,
  names: ReadonlyMap<string, string>,
  now: number,
): ExportListItem {
  return {
    id: row.id,
    kind: row.kind,
    format: row.format,
    periodFrom: row.filters.from ?? null,
    periodTo: row.filters.to ?? null,
    rwId: row.rw_id,
    rowCount: row.row_count,
    purpose: row.reason,
    requestedByName: names.get(row.requested_by) ?? null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    isAvailable:
      row.deleted_at === null && row.storage_path !== null && Date.parse(row.expires_at) > now,
    hasFailed: row.failed_at !== null,
  };
}

async function requesterNamesOf(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', [...new Set(ids)]);
  if (error) throw error;
  return new Map(data.flatMap((row) => (row.full_name ? [[row.id, row.full_name] as const] : [])));
}

// Task P4.6.03: the history of /dashboard/exports under RLS (exports_staff_read: an RW admin's own, the superadmin's
// all), newest first, `?q=` on the purpose, `?status=` on the kind and, for the superadmin, `?rw=`.
export async function listExports(
  query: ListQuery,
  rw: number | null,
): Promise<ListResult<ExportListItem>> {
  const supabase = await createSupabaseServerClient();
  const { from, to } = pageRange(query.page, query.per);
  const kinds = allowedValues(query.status, DB_ENUMS.export_kind);
  const pattern = searchPattern(query.q);
  let request = supabase.from('exports').select(HISTORY_COLUMNS, { count: 'exact' });
  if (kinds.length > 0) request = request.in('kind', kinds);
  if (rw !== null) request = request.eq('rw_id', rw);
  if (pattern !== null) request = request.ilike('reason', pattern);
  const { data, error, count } = await request
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to);
  if (error) throw error;
  const rows = z.array(historyRowSchema).parse(data);
  const names = await requesterNamesOf(rows.map((row) => row.requested_by));
  const now = Date.now();
  return { rows: rows.map((row) => toListItem(row, names, now)), total: count ?? rows.length };
}
