import 'server-only';

import { z } from 'zod';

import {
  GUEST_BOOKING_PATH,
  GUEST_LINK_PARAM,
  GUEST_LINK_SCOPES,
  type GuestLinkScope,
} from '@/config/guest';
import type { OutboxRow } from '@/db/rpc-outbox';
import type { DatabaseClient } from '@/db/rpc-result';
import { mintGuestLink } from '@/lib/links/mint';
import { grantsScope } from '@/lib/links/verify';
import {
  displayParams,
  guestTemplateParams,
  isStaleReminder,
  staffParamsSchema,
  type BookingFacts,
  type GuestTemplate,
  type VisitDay,
} from '@/lib/notifications/compose';
import { sendFailure, type SendFailure } from '@/lib/notifications/send-result';
import { templateParamsSchemas, type NotificationTemplate } from '@/lib/notifications/templates';
import type { MessageLink, OutgoingMessage } from '@/lib/notifications/types';
import { publicEnv } from '@/lib/public-env';
import { formatTimeRange } from '@/lib/utils/dates';
import { ticketWhatsAppDocument } from '@/server/services/document-service';

// One outbox row made into the message its provider sends (Task P3.11.02, P3.11.05). The worker hands in the
// service-role client it was given (src/server/services/notification-service.ts); every booking read here is the one
// the claimed row names.

export type Composed = { ok: true; message: OutgoingMessage } | { ok: false; failure: SendFailure };

const STAFF_TEMPLATES: ReadonlySet<NotificationTemplate> = new Set([
  'admin_new_paid_booking',
  'admin_booking_needs_review',
]);
// A name the guard let into the outbox but the template's own check refuses still gets a greeting.
const FALLBACK_NAME = 'Bapak/Ibu';
const CATALOGUE_PATH = '/paket-wisata';
const DASHBOARD_PATH = '/dashboard';
const SECURITY_ALERTS_PATH = '/dashboard/security-alerts';

// The page each guest message opens, and the scope that page needs (review of PR #47: a review link opens
// /ulasan, never the hub). A link whose scope does not reach the page opens the booking's hub instead.
const PAGE_OF_TEMPLATE: Partial<
  Record<NotificationTemplate, { page: string; needs: GuestLinkScope }>
> = {
  booking_created: { page: 'bayar', needs: 'pay' },
  payment_reminder: { page: 'bayar', needs: 'pay' },
  payment_received_ticket: { page: 'tiket', needs: 'view' },
  visit_reminder_d1: { page: 'tiket', needs: 'view' },
  review_invite: { page: 'ulasan', needs: 'review' },
  certificate_ready: { page: 'sertifikat', needs: 'certificate' },
};

// The guest templates whose WhatsApp button carries a guest link: without one in the row, there is nothing to send.
const LINKED_TEMPLATES: ReadonlySet<NotificationTemplate> = new Set([
  'booking_created',
  'quotation_ready',
  'payment_reminder',
  'payment_received_ticket',
  'visit_reminder_d1',
  'certificate_ready',
  'review_invite',
  'booking_link',
]);

// The legs that still hold a seat: a released leg (a booking paid after its seats were gone, a weather refund) or one
// never reserved is no visit day of the booking (review of PR #109, L2).
const SEAT_HOLDING_LEG_STATUSES: ReadonlySet<string> = new Set(['reserved', 'checked_in']);

const BOOKING_COLUMNS = `booking_code, token_version, email_verified_at, package_snapshot, visit_date, pax_count,
  total_amount, expires_at, institution_name,
  booking_legs(leg_order, status, rw_units(name),
    visit_sessions(session_date, start_time, end_time, weather_notices(id))),
  quotations(quotation_number, valid_until, issued_at), payments(refunded_amount)`;

const linkScopeSchema = z.object({ link_scope: z.enum(GUEST_LINK_SCOPES) });
const snapshotSchema = z.object({ name: z.string() });

function refusal(errorCode: string, error: string): Composed {
  return { ok: false, failure: sendFailure(errorCode, error, true) };
}

function staticLink(path: string): MessageLink {
  return { url: `${publicEnv.NEXT_PUBLIC_SITE_URL}${path}`, buttonSuffix: null };
}

function greetingName(recipientName: string | null): string {
  return (
    templateParamsSchemas.booking_link.shape.name.safeParse(recipientName).data ?? FALLBACK_NAME
  );
}

async function loadBooking(adminClient: DatabaseClient, bookingId: string) {
  const { data, error } = await adminClient
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('id', bookingId)
    .single();
  if (error) throw error;
  return data;
}

type LoadedBooking = Awaited<ReturnType<typeof loadBooking>>;

type LoadedLeg = LoadedBooking['booking_legs'][number];

function sessionOf(leg: LoadedLeg): string {
  return formatTimeRange(leg.visit_sessions.start_time, leg.visit_sessions.end_time);
}

// One leg's session as it is; a combo's each with its RW.
function sessionsOf(legs: readonly LoadedLeg[]): string {
  const [only] = legs;
  if (legs.length === 1 && only) return sessionOf(only);
  return legs.map((leg) => `${leg.rw_units.name} ${sessionOf(leg)}`).join(', ');
}

function isVisitedLeg(leg: LoadedLeg): boolean {
  return SEAT_HOLDING_LEG_STATUSES.has(leg.status) && leg.visit_sessions.weather_notices === null;
}

// The booking's visit days in date order, each with the sessions and the gate of its own legs, as the D-1 reminder
// names them. A leg in a session the weather stopped is no visit of that day (last review of PR #109, item 4): on a
// one-day combo whose RW 05 session is stopped, the reminder names the RW 08 session and gate only, and a day left with
// stopped legs only is a stale day, as internal.reminder_day_held reads it.
function daysOf(allLegs: readonly LoadedLeg[]): VisitDay[] {
  const legs = allLegs.filter(isVisitedLeg);
  const dates = [...new Set(legs.map((leg) => leg.visit_sessions.session_date))].sort(
    (left, right) => left.localeCompare(right),
  );
  return dates.map((date) => {
    const legsOfDay = legs.filter((leg) => leg.visit_sessions.session_date === date);
    return { date, session: sessionsOf(legsOfDay), gate: legsOfDay[0]?.rw_units.name ?? '' };
  });
}

function factsOf(booking: LoadedBooking): BookingFacts {
  const legs = [...booking.booking_legs].sort((left, right) => left.leg_order - right.leg_order);
  const quotation = [...booking.quotations].sort((a, b) =>
    b.issued_at.localeCompare(a.issued_at),
  )[0];
  return {
    bookingCode: booking.booking_code,
    packageName: snapshotSchema.safeParse(booking.package_snapshot).data?.name ?? '',
    visitDate: booking.visit_date,
    session: sessionsOf(legs),
    gate: legs[0]?.rw_units.name ?? '',
    days: daysOf(legs),
    pax: booking.pax_count,
    total: booking.total_amount,
    deadline: booking.expires_at,
    institution: booking.institution_name,
    quotationNumber: quotation?.quotation_number ?? null,
    quotationValidUntil: quotation?.valid_until ?? null,
    refundedAmount: booking.payments.reduce((sum, payment) => sum + payment.refunded_amount, 0),
  };
}

// docs/Security.md §6.7: only the OTP-verified WhatsApp number receives manage; an email address nobody has
// confirmed receives view links, whatever the row asked for.
function scopeFor(row: OutboxRow, asked: GuestLinkScope, booking: LoadedBooking): GuestLinkScope {
  const isUnconfirmedEmail = row.channel === 'email' && booking.email_verified_at === null;
  return isUnconfirmedEmail && (asked === 'manage' || asked === 'pay') ? 'view' : asked;
}

async function guestLink(row: OutboxRow, booking: LoadedBooking, nowSeconds: number) {
  const asked = linkScopeSchema.safeParse(row.params);
  if (!asked.success) return null;
  const scope = scopeFor(row, asked.data.link_scope, booking);
  const token = await mintGuestLink({
    bookingCode: booking.booking_code,
    scope,
    tokenVersion: booking.token_version,
    nowSeconds,
  });
  const page = PAGE_OF_TEMPLATE[row.template];
  const subpath = page && grantsScope(scope, page.needs) ? `/${page.page}` : '';
  const buttonSuffix = `${booking.booking_code}${subpath}?${GUEST_LINK_PARAM}=${token}`;
  return {
    url: `${publicEnv.NEXT_PUBLIC_SITE_URL}${GUEST_BOOKING_PATH}/${buttonSuffix}`,
    buttonSuffix,
  };
}

function composeFromParams(
  row: OutboxRow,
  schema: z.ZodType<Record<string, unknown>>,
  link: MessageLink,
) {
  const params = schema.safeParse(row.params);
  if (!params.success)
    return refusal('bad_params', 'The message holds parameters its template refuses');
  return {
    ok: true as const,
    message: messageOf(row, displayParams(params.data), link),
  };
}

function messageOf(row: OutboxRow, bodyParams: Record<string, string>, link: MessageLink | null) {
  return {
    notificationId: row.id,
    channel: row.channel,
    template: row.template,
    recipient: row.recipient,
    bodyParams,
    link,
  };
}

async function composeGuest(
  adminClient: DatabaseClient,
  row: OutboxRow & { template: GuestTemplate },
  nowSeconds: number,
): Promise<Composed> {
  if (row.booking_id === null) return refusal('bad_params', 'The message names no booking');
  const booking = await loadBooking(adminClient, row.booking_id);
  const facts = factsOf(booking);
  // The booking changed, nothing failed: internal.fail_notification cancels a stale_day row rather than dead-letter it
  // and raise notification_dead (20261105140100).
  if (isStaleReminder(row.template, facts, row.params)) {
    return refusal('stale_day', 'The reminder names a day the booking no longer visits');
  }
  const named = guestTemplateParams(
    row.template,
    greetingName(row.recipient_name),
    facts,
    row.params,
  );
  const params = templateParamsSchemas[row.template].safeParse(named);
  if (!params.success)
    return refusal('bad_params', 'The booking gives this template no valid parameters');
  const link =
    row.template === 'booking_expired'
      ? staticLink(CATALOGUE_PATH)
      : await guestLink(row, booking, nowSeconds);
  if (link === null && LINKED_TEMPLATES.has(row.template)) {
    return refusal('bad_params', 'The message names no link scope for its button');
  }
  return withTicketDocument(adminClient, row, messageOf(row, displayParams(params.data), link));
}

// gsk_ticket_issued_v1 carries the ticket PDF in its document header (Task P3.11.03), minted now and never stored.
// Without a file that may be kept the message waits for the next try rather than going out without its header,
// which Meta would refuse; the email goes out meanwhile with its link.
async function withTicketDocument(
  adminClient: DatabaseClient,
  row: OutboxRow,
  message: OutgoingMessage,
): Promise<Composed> {
  if (row.channel !== 'whatsapp' || row.template !== 'payment_received_ticket' || !row.booking_id) {
    return { ok: true, message };
  }
  const document = await ticketWhatsAppDocument(adminClient, row.booking_id);
  if (document === null) {
    return {
      ok: false,
      failure: sendFailure('ticket_pdf_unavailable', 'The ticket file is not ready yet', false),
    };
  }
  return { ok: true, message: { ...message, document } };
}

function isGuestTemplate(row: OutboxRow): row is OutboxRow & { template: GuestTemplate } {
  return (
    row.template !== 'phone_otp' &&
    row.template !== 'security_alert' &&
    !STAFF_TEMPLATES.has(row.template)
  );
}

export async function composeMessage(
  adminClient: DatabaseClient,
  row: OutboxRow,
  nowSeconds: number,
): Promise<Composed> {
  if (row.template === 'phone_otp') {
    const params = templateParamsSchemas.phone_otp.safeParse(row.params);
    if (!params.success) return refusal('bad_params', 'The OTP message holds no code');
    return { ok: true, message: messageOf(row, params.data, null) };
  }
  if (row.template === 'security_alert') {
    return composeFromParams(
      row,
      templateParamsSchemas.security_alert,
      staticLink(SECURITY_ALERTS_PATH),
    );
  }
  if (isGuestTemplate(row)) return composeGuest(adminClient, row, nowSeconds);
  return composeFromParams(row, staffParamsSchema, staticLink(DASHBOARD_PATH));
}
