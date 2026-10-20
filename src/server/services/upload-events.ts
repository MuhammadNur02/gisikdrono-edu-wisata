import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { RateLimitName } from '@/config/rate-limits';
import type { EnumValue } from '@/db/enums';
import type { Database } from '@/db/types';
import { isFirstRefusal, withinRateLimits } from '@/lib/rate-limit';
import { refusalSeverity, type UploadRefusalReason } from '@/lib/uploads/outcomes';
import type { PdfSanitizing } from '@/lib/uploads/pdf-scan';
import type { StaffContext } from '@/server/auth/guards';

// The security events and limits of the upload pipeline (docs/Security.md §8.3, §8.4, §11.1). The service-role
// client is handed in by upload-service.ts, the only module allowed to create it.

type DatabaseClient = SupabaseClient<Database>;

export type UploadLimit = Extract<
  RateLimitName,
  'upload_sign' | 'upload_finalize' | 'upload_forbidden'
>;

export type UploadEvent = {
  type: 'upload_rejected' | 'upload_sanitized' | 'rate_limited';
  severity: EnumValue<'alert_severity'>;
  rwId: number | null;
  objectName?: string;
  details: Record<string, string | null>;
};

// Ids and reasons only, never file names or links.
export async function writeUploadEvent(
  adminClient: DatabaseClient,
  ctx: StaffContext,
  event: UploadEvent,
): Promise<void> {
  const details = { aal: ctx.isAal2 ? 'aal2' : 'aal1', ...event.details };
  const { error } = await adminClient.from('security_events').insert({
    event_type: event.type,
    severity: event.severity,
    actor_id: ctx.userId,
    actor_role: ctx.role,
    rw_id: event.rwId,
    entity_type: 'upload',
    entity_id: event.objectName ?? null,
    details,
  });
  if (error) throw error;
}

export function refusalEvent(
  rwId: number | null,
  reason: UploadRefusalReason,
  details: Record<string, string | null> = {},
): UploadEvent {
  const severity = refusalSeverity(reason);
  return { type: 'upload_rejected', severity, rwId, details: { reason, ...details } };
}

// What a published booklet copy left out (docs/Security.md §8.4), or null when it is the file as sent.
export function sanitizedEvent(rwId: number | null, removed: PdfSanitizing): UploadEvent | null {
  const parts = [
    removed.openAction ? 'OpenAction' : '',
    removed.annotations > 0 ? 'annotations' : '',
  ];
  const what = parts.filter((part) => part !== '').join(',');
  if (!what) return null;
  const details = {
    removed: what,
    kind: removed.openAction,
    annotations: String(removed.annotations),
  };
  return { type: 'upload_sanitized', severity: 'info', rwId, details };
}

// True while the staff member is within the limit. The first refusal of an hour is recorded as rate_limited; the
// rest are not, so a flood leaves one row, not thousands (security review of PR #14, L8).
export async function withinUploadLimit(
  adminClient: DatabaseClient,
  ctx: StaffContext,
  limit: UploadLimit,
  rwId: number | null,
): Promise<boolean> {
  const check = { name: limit, subject: ctx.userId };
  if (await withinRateLimits(adminClient, [check])) return true;
  if (await isFirstRefusal(adminClient, check)) {
    const severity = limit === 'upload_forbidden' ? 'high' : 'medium';
    await writeUploadEvent(adminClient, ctx, {
      type: 'rate_limited',
      severity,
      rwId,
      details: { limit },
    });
  }
  return false;
}
