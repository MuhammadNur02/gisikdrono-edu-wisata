import { describe, expect, it } from 'vitest';

import { DB_ENUMS } from '@/db/enums';

import {
  PAY_LINK_SENT_STATUSES,
  REMINDED_BOOKER_TYPES,
  REMINDER_KEEPING_REVIEW_REASON,
  RESEND_TEMPLATE_STATES,
  RESENDABLE_TEMPLATES,
} from './bookings';

// These lists mirror SQL (20261105175000). The literals below are the same ones
// supabase/tests/staff_payment_reminder.sql checks internal.message_fits_state, request_notification_resend and
// payments_housekeeping against, so a change on either side fails one of the two tests.

const MESSAGE_FITS_STATE =
  'booking_cancelled:cancelled,refunded; booking_created:pending_payment; ' +
  'certificate_ready:checked_in,completed; payment_received_ticket:paid,checked_in; ' +
  'payment_reminder:pending_payment; refund_processed:cancelled,refunded; visit_reminder_d1:paid,checked_in';

function statesInEnumOrder(states: readonly string[]): string {
  return DB_ENUMS.booking_status.filter((status) => states.includes(status)).join(',');
}

describe('the resend lists mirrored from SQL', () => {
  it('fit each message to the booking states message_fits_state lets it go in', () => {
    const table = [...RESENDABLE_TEMPLATES]
      .sort()
      .map((template) => `${template}:${statesInEnumOrder(RESEND_TEMPLATE_STATES[template])}`)
      .join('; ');
    expect(table).toBe(MESSAGE_FITS_STATE);
  });

  it("count a pay link as gone by the job's link_sent statuses", () => {
    expect(PAY_LINK_SENT_STATUSES).toEqual(['sent', 'delivered', 'read']);
  });

  it('remind the web bookers the job reminds', () => {
    expect(REMINDED_BOOKER_TYPES).toEqual(['school', 'university', 'government', 'company']);
  });

  it('keep the D-1 reminder under the one review reminder_day_held lets it stand', () => {
    expect(REMINDER_KEEPING_REVIEW_REASON).toBe('REVENUE_RULE_REFUSED');
  });
});
