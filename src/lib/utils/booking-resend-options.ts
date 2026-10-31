import {
  PAY_LINK_SENT_STATUSES,
  RESEND_CHANNELS,
  RESEND_TEMPLATE_STATES,
  RESENDABLE_TEMPLATES,
} from '@/config/bookings';
import type { BookingDetail } from '@/types/booking-admin';
import type { MessageHistoryEntry, ResendChannelOption, ResendOption } from '@/types/booking-staff';

// Which messages the "Kirim pesan" sheet of /dashboard/bookings/[id] offers (docs/PRD.md FR-ADMIN-17), by the rules of
// request_notification_resend (20261105175000): a message whose state the booking still fits, sent before on that
// channel, or a first payment reminder while the booking waits for its payment. Only what the sheet shows: the RPC
// decides again, and the outbox's switches and email cap still refuse with NOT_SENT.

type ResendBooking = Pick<
  BookingDetail,
  'status' | 'needsReview' | 'expiresAt' | 'channel' | 'isPhoneVerified' | 'emailMasked'
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

// The poll job's reminder rule: unpaid, not under review, the deadline ahead, and an officer's hold only once its pay
// link went out.
function waitsForPayment(
  booking: ResendBooking,
  history: readonly MessageHistoryEntry[],
  now: Date,
): boolean {
  if (booking.status !== 'pending_payment' || booking.needsReview) return false;
  if (booking.expiresAt === null || Date.parse(booking.expiresAt) <= now.getTime()) return false;
  return booking.channel !== 'admin' || hasSentPayLink(history);
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

export function resendOptionsFor(
  booking: ResendBooking,
  history: readonly MessageHistoryEntry[],
  now: Date,
): ResendOption[] {
  return RESENDABLE_TEMPLATES.filter((template) =>
    RESEND_TEMPLATE_STATES[template].includes(booking.status),
  )
    .map((template) => ({ template, channels: channelsFor(template, booking, history, now) }))
    .filter((option) => option.channels.length > 0);
}
