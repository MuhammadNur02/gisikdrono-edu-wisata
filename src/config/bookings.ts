// /dashboard/bookings (Task P4.3.02, docs/PRD.md FR-ADMIN-05; docs/StyleGuide.md §6.10).

// docs/PRD.md §13.1 A23 addendum (delta review of PR #91, L-2c): `?category=admin_unpaid` on /dashboard/bookings
// narrows the list to the officers' bookings still waiting for their payment.
export const ADMIN_UNPAID_VIEW = 'admin_unpaid';

export const BOOKINGS_DASHBOARD_PATH = '/dashboard/bookings';

export function bookingDetailPath(bookingId: string): string {
  return `${BOOKINGS_DASHBOARD_PATH}/${bookingId}`;
}

// The columns the list may be ordered by, through `?sort=`; anything else in the URL is ignored.
export const BOOKING_SORT_COLUMNS = ['visit_date', 'created_at'] as const;
export const BOOKING_DEFAULT_SORT = 'created_at.desc';

// rpc_reveal_booking_contact asks for a reason of 3 to 300 characters (0005).
export const REVEAL_REASON_LIMITS = { min: 3, max: 300 } as const;

// admin_notes has no CHECK of its own; this is the app's cap for a staff member's note on a booking.
export const ADMIN_NOTES_MAX_LENGTH = 2000;

// The fulfilment steps a kitchen marks. Cancelling a line changes what was paid for, which only an approved
// adjustment may do (P4.7.03), so it is not offered here.
export const STAFF_FULFILLMENT_STATUSES = ['pending', 'prepared', 'handed_over'] as const;

// A booking code typed into the search box is looked up by its code; anything else searches the institution.
export const BOOKING_CODE_SEARCH_PREFIX = 'GSK-';

// Review of PR #76, F-76-6: a hidden participant list stays in the page's memory this long, so showing it again soon
// costs no second audited reveal, and is then dropped.
export const PARTICIPANTS_HIDDEN_KEEP_MS = 5 * 60 * 1000;

// Who moved a booking, as booking_events.actor_type records it (its CHECK in 0003_tables.sql).
export const BOOKING_EVENT_ACTORS = ['system', 'webhook', 'admin', 'cron', 'visitor'] as const;

// Task P4.3.08, docs/PRD.md §13.1 A28: why staff cancel a paid booking, which decides its refund (the visit terms at
// the guest's request, the whole payment from the kelurahan or RW), and how the superadmin resolves a booking paid after
// its seats were gone. The reasons follow the RPCs' own limits (20261104220200, 20261104220300).
export const STAFF_CANCEL_CATEGORIES = ['guest_request', 'kelurahan'] as const;
export const REVIEW_RESOLUTIONS = ['move', 'refund'] as const;
export const CANCEL_REASON_LIMITS = { min: 3, max: 300 } as const;
export const REVIEW_REASON_LIMITS = { min: 10, max: 300 } as const;
// The PIC's messages a staff member may send again (request_notification_resend's own list, the ones a PIC acts on).
export const RESENDABLE_TEMPLATES = [
  'booking_created',
  'payment_reminder',
  'payment_received_ticket',
  'booking_cancelled',
  'visit_reminder_d1',
  'certificate_ready',
  'refund_processed',
] as const;
// The review a booking paid after its hold lapsed and its session filled waits in (internal.settle_payment).
export const NO_SEATS_REVIEW_REASON = 'PAID_AFTER_EXPIRY_NO_QUOTA';
// What public.extend_booking_hold allows, for the hint staff read. These mirror SQL and change only with it: maxDays
// is the `interval '14 days'` of internal.latest_hold_deadline, and webMarginHours is
// internal.hold_margin_before_session() (both 20261105130000), which internal.hold_deadline and
// internal.move_released_legs (20261105130500) read too.
export const HOLD_EXTENSION_LIMITS = { maxDays: 14, webMarginHours: 1 } as const;
