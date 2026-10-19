import 'server-only';

import type { PostgrestSingleResponse, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database, Json } from '@/db/types';

// Typed calls to the database functions (CLAUDE.md §6.3). Staff RPCs run on the signed-in user's
// client from src/lib/supabase/server.ts, so auth.uid() and RLS apply. The svc_ functions run on the
// service-role client from src/lib/supabase/admin.ts: they are the only way server code reaches
// internal.* (CLAUDE.md §6.1). Every call throws the PostgREST error unchanged, so mapError can read
// its code and hint.

type DatabaseClient = SupabaseClient<Database>;
type Enums = Database['public']['Enums'];

export type BookingParticipant = Database['public']['Tables']['booking_participants']['Row'];

export const UI_EVENTS = ['pii_revealed', 'scanner_opened'] as const;
export type UiEvent = (typeof UI_EVENTS)[number];

async function resultOf<T>(request: PromiseLike<PostgrestSingleResponse<T>>): Promise<T> {
  const response = await request;
  if (response.error) throw response.error;
  return response.data;
}

// ===== Staff RPCs (session client) =====

export function generateVisitSessions(
  client: DatabaseClient,
  session: { rwId: number; from: string; to: string },
): Promise<number> {
  return resultOf(
    client.rpc('generate_visit_sessions', {
      p_rw_id: session.rwId,
      p_from: session.from,
      p_to: session.to,
    }),
  );
}

export async function rpcLogUiEvent(
  client: DatabaseClient,
  uiEvent: { event: UiEvent; entityId: string | null },
): Promise<void> {
  await resultOf(
    client.rpc('rpc_log_ui_event', {
      p_event: uiEvent.event,
      p_entity_id: uiEvent.entityId ?? undefined,
    }),
  );
}

// A promotion to superadmin and an MFA reset are first requested and carried out 24 hours to 7 days
// later; every other role change applies at once (docs/Security.md §5.2).
const staffChangeSchema = z.discriminatedUnion('stage', [
  z
    .object({
      stage: z.literal('requested'),
      completes_after: z.string(),
      lapses_after: z.string(),
    })
    .strict(),
  z.object({ stage: z.literal('completed') }).strict(),
  z.object({ stage: z.literal('applied') }).strict(),
]);
export type StaffChangeStage =
  | { stage: 'requested'; completesAfter: string; lapsesAfter: string }
  | { stage: 'completed' }
  | { stage: 'applied' };

function staffChangeStageOf(reply: Json): StaffChangeStage {
  const result = staffChangeSchema.parse(reply);
  if (result.stage !== 'requested') return { stage: result.stage };
  return {
    stage: 'requested',
    completesAfter: result.completes_after,
    lapsesAfter: result.lapses_after,
  };
}

export async function setStaffRole(
  client: DatabaseClient,
  change: { userId: string; role: Enums['app_role']; rwId: number | null },
): Promise<StaffChangeStage> {
  const reply = await resultOf(
    client.rpc('set_staff_role', {
      p_user_id: change.userId,
      p_role: change.role,
      p_rw_id: change.rwId ?? undefined,
    }),
  );
  return staffChangeStageOf(reply);
}

export async function setStaffStatus(
  client: DatabaseClient,
  change: { userId: string; isActive: boolean; reason: string },
): Promise<void> {
  await resultOf(
    client.rpc('set_staff_status', {
      p_user_id: change.userId,
      p_is_active: change.isActive,
      p_reason: change.reason,
    }),
  );
}

export async function resetStaffMfa(
  client: DatabaseClient,
  userId: string,
): Promise<StaffChangeStage> {
  return staffChangeStageOf(await resultOf(client.rpc('reset_staff_mfa', { p_user_id: userId })));
}

export async function cancelStaffMfaReset(client: DatabaseClient, userId: string): Promise<void> {
  await resultOf(client.rpc('cancel_staff_mfa_reset', { p_user_id: userId }));
}

export async function cancelSuperadminPromotion(
  client: DatabaseClient,
  userId: string,
): Promise<void> {
  await resultOf(client.rpc('cancel_superadmin_promotion', { p_user_id: userId }));
}

const bookingContactSchema = z
  .object({
    pic_name: z.string(),
    pic_phone: z.string().nullable(),
    pic_email: z.string().nullable(),
  })
  .strict();
export type BookingContact = { picName: string; picPhone: string | null; picEmail: string | null };

export async function rpcRevealBookingContact(
  client: DatabaseClient,
  reveal: { bookingId: string; reason: string },
): Promise<BookingContact> {
  const contact = bookingContactSchema.parse(
    await resultOf(
      client.rpc('rpc_reveal_booking_contact', {
        p_booking_id: reveal.bookingId,
        p_reason: reveal.reason,
      }),
    ),
  );
  return { picName: contact.pic_name, picPhone: contact.pic_phone, picEmail: contact.pic_email };
}

export function rpcGetParticipants(
  client: DatabaseClient,
  bookingId: string,
): Promise<BookingParticipant[]> {
  return resultOf(client.rpc('rpc_get_participants', { p_booking_id: bookingId }));
}

// ===== Service-role entry points (admin client) =====

export function svcRateLimitHit(
  adminClient: DatabaseClient,
  limit: { key: string; limit: number; windowSeconds: number },
): Promise<boolean> {
  return resultOf(
    adminClient.rpc('svc_rate_limit_hit', {
      p_key: limit.key,
      p_limit: limit.limit,
      p_window_seconds: limit.windowSeconds,
    }),
  );
}

// True when the caller now holds the booklet's page claim: none existed, or the one there is older than
// holdSeconds (docs/Security.md §8.4; security review of PR #14, N4). rwId NULL is a kelurahan booklet.
export function svcClaimBookletPages(
  adminClient: DatabaseClient,
  claim: { bookletId: string; rwId: number | null; actorId: string; holdSeconds: number },
): Promise<boolean> {
  return resultOf(
    adminClient.rpc('svc_claim_booklet_pages', {
      p_booklet_id: claim.bookletId,
      p_actor_id: claim.actorId,
      p_hold_seconds: claim.holdSeconds,
      p_rw_id: claim.rwId ?? undefined,
    }),
  );
}

// Returns null when the message was skipped: WhatsApp to an unverified number, or a contact that has
// been anonymised (docs/Security.md GUEST-08).
export async function svcEnqueueNotification(
  adminClient: DatabaseClient,
  message: {
    bookingId: string;
    template: Enums['notification_template'];
    channel: Enums['notification_channel'];
    params: Json;
  },
): Promise<string | null> {
  const notificationId = await resultOf(
    adminClient.rpc('svc_enqueue_notification', {
      p_booking_id: message.bookingId,
      p_template: message.template,
      p_channel: message.channel,
      p_params: message.params,
    }),
  );
  return z.uuid().nullable().parse(notificationId);
}

export async function svcIncrementBookletDownload(
  adminClient: DatabaseClient,
  bookletId: string,
): Promise<void> {
  await resultOf(adminClient.rpc('svc_increment_booklet_download', { p_booklet_id: bookletId }));
}

export function svcExpireStaleBookings(adminClient: DatabaseClient): Promise<number> {
  return resultOf(adminClient.rpc('svc_expire_stale_bookings'));
}

// The jobs pg_cron runs through their /api/jobs route (0007, internal.call_job).
export type ApplicationJob =
  | 'process-notifications'
  | 'payments-poll'
  | 'anomaly-scan'
  | 'reconcile-payments'
  | 'purge-storage';

// A job route reports how its run ended; /api/health watches the last success (docs/PRD.md §8.9), and a
// failure is also a cron_failed security event.
export async function svcRecordJobRun(
  adminClient: DatabaseClient,
  run: { job: ApplicationJob; succeeded: boolean; errorCode?: string },
): Promise<void> {
  await resultOf(
    adminClient.rpc('svc_record_job_run', {
      p_job: run.job,
      p_succeeded: run.succeeded,
      p_error_code: run.errorCode,
    }),
  );
}

export type PurgeableFile = { bucket: string; path: string };

// Files the retention runs marked for deletion (docs/Security.md §7.3), oldest first.
export function svcPurgeableFiles(
  adminClient: DatabaseClient,
  limit: number,
): Promise<PurgeableFile[]> {
  return resultOf(adminClient.rpc('svc_purgeable_files', { p_limit: limit }));
}

// Clears the paths of files that are gone; returns how many marked rows let go of one.
export function svcForgetPurgedFiles(
  adminClient: DatabaseClient,
  paths: string[],
): Promise<number> {
  return resultOf(adminClient.rpc('svc_forget_purged_files', { p_paths: paths }));
}

// actorId is the staff member's profile id, or null when the server acts for a visitor; it is
// required here so no call can forget it.
export async function svcLogAudit(
  adminClient: DatabaseClient,
  event: {
    actorId: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    metadata: Json;
  },
): Promise<void> {
  await resultOf(
    adminClient.rpc('svc_log_audit', {
      p_actor_id: event.actorId ?? undefined,
      p_action: event.action,
      p_entity_type: event.entityType,
      p_entity_id: event.entityId ?? undefined,
      p_metadata: event.metadata,
    }),
  );
}
