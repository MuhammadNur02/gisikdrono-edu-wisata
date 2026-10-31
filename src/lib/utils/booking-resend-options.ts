import {
  PAY_LINK_SENT_STATUSES,
  REMINDED_BOOKER_TYPES,
  REMINDER_KEEPING_REVIEW_REASON,
  RESEND_CHANNELS,
  RESEND_TEMPLATE_STATES,
  RESENDABLE_TEMPLATES,
} from '@/config/bookings';
import { sessionStartsAt, todayInJakarta } from '@/lib/utils/dates';
import type { BookingDetail } from '@/types/booking-admin';
import type { MessageHistoryEntry, ResendChannelOption, ResendOption } from '@/types/booking-staff';

// Which messages the "Kirim pesan" sheet of /dashboard/bookings/[id] offers (docs/PRD.md FR-ADMIN-17), by the rules of
// request_notification_resend (20261105175000): a message whose state the booking still fits, sent before on that
// channel, or a first payment reminder to a booking the poll job would remind. Only what the sheet shows: the RPC has
// the final word. It also checks a D-1 reminder's day against the weather notices and the day its last reminder
// named, which the page cannot read, and the outbox's switches and email cap still refuse with NOT_SENT.

type ResendBooking = Pick<
  BookingDetail,
  | 'status'
  | 'needsReview'
  | 'reviewReason'
  | 'expiresAt'
  | 'channel'
  | 'bookerType'
  | 'legs'
  | 'isPhoneVerified'
  | 'emailMasked'
>;
type ResendTemplate = ResendOption['template'];
type ResendChannel = ResendChannelOption['channel'];

function lastQueuedAt(
  history: readonly MessageHistoryEntry[],
  template: ResendTemplate,
  channel: ResendChannel,
): string | null {
  const times = history
    .filter((message) => message.template === template && message.channel === channel)
    .map((message) => message.createdAt)
    .sort();
  return times.at(-1) ?? null;
}

function hasSentPayLink(history: readonly MessageHistoryEntry[]): boolean {
  return history.some(
    (message) =>
      message.template === 'booking_created' && PAY_LINK_SENT_STATUSES.includes(message.status),
  );
}

// When the poll job reminds at the latest: the deadline, and for an officer's hold its first session's start if sooner.
function remindBy(booking: ResendBooking): number | null {
  if (booking.expiresAt === null) return null;
  const deadline = Date.parse(booking.expiresAt);
  if (booking.channel !== 'admin') return deadline;
  const starts = booking.legs.map((leg) =>
    sessionStartsAt(leg.sessionDate, leg.startTime).getTime(),
  );
  return Math.min(deadline, ...starts);
}

// The poll job's reminder rule, only earlier: an institution's web hold or an officer's hold, unpaid, not under
// review, before remindBy, and an officer's hold only once its pay link went out.
function waitsForPayment(
  booking: ResendBooking,
  history: readonly MessageHistoryEntry[],
  now: Date,
): boolean {
  if (booking.status !== 'pending_payment' || booking.needsReview) return false;
  const latest = remindBy(booking);
  if (latest === null || latest <= now.getTime()) return false;
  if (booking.channel === 'admin') return hasSentPayLink(history);
  return booking.bookerType !== null && REMINDED_BOOKER_TYPES.includes(booking.bookerType);
}

// reminder_day_held as far as the page can tell: a seat still held from today on, outside a review that suspends the
// tickets.
function mayHoldReminderDay(booking: ResendBooking, now: Date): boolean {
  if (booking.needsReview && booking.reviewReason !== REMINDER_KEEPING_REVIEW_REASON) return false;
  const today = todayInJakarta(now);
  return booking.legs.some((leg) => leg.status === 'reserved' && leg.sessionDate >= today);
}

// The outbox sends WhatsApp only to a verified number, and an email only where the booking has an address.
function reachesPic(booking: ResendBooking, channel: ResendChannel): boolean {
  return channel === 'whatsapp' ? booking.isPhoneVerified : booking.emailMasked !== null;
}

function channelsFor(
  template: ResendTemplate,
  booking: ResendBooking,
  history: readonly MessageHistoryEntry[],
  now: Date,
): ResendChannelOption[] {
  const isFirstReminderDue =
    template === 'payment_reminder' && waitsForPayment(booking, history, now);
  const reachable = RESEND_CHANNELS.filter((channel) => reachesPic(booking, channel));
  return reachable.flatMap((channel): ResendChannelOption[] => {
    const queuedAt = lastQueuedAt(history, template, channel);
    if (queuedAt !== null) return [{ channel, lastQueuedAt: queuedAt }];
    return isFirstReminderDue ? [{ channel, lastQueuedAt: null }] : [];
  });
}

function fitsNow(template: ResendTemplate, booking: ResendBooking, now: Date): boolean {
  if (!RESEND_TEMPLATE_STATES[template].includes(booking.status)) return false;
  return template !== 'visit_reminder_d1' || mayHoldReminderDay(booking, now);
}

export function resendOptionsFor(
  booking: ResendBooking,
  history: readonly MessageHistoryEntry[],
  now: Date,
): ResendOption[] {
  return RESENDABLE_TEMPLATES.filter((template) => fitsNow(template, booking, now))
    .map((template) => ({ template, channels: channelsFor(template, booking, history, now) }))
    .filter((option) => option.channels.length > 0);
}
