import 'server-only';

import { z } from 'zod';

import { templateParamsSchemas, type NotificationTemplate } from '@/lib/notifications/templates';
import { formatIDR } from '@/lib/utils/currency';
import { formatDateLong, formatDateTimeShort } from '@/lib/utils/dates';

// Task P3.11.02 (docs/Task.md Appendix B): each message's parameters, built at send time from the booking as it stands
// now, since the outbox row keeps only its link scope (notifications_guest_guard refuses anything that could carry a
// link). The template's own schema checks them, and its order is the order WhatsApp numbers them ({{1}}, {{2}}, ...).

// What a guest message may say about its booking, read by the worker (src/server/services/notification-service.ts).
export interface BookingFacts {
  bookingCode: string;
  packageName: string;
  // 'YYYY-MM-DD', the first leg's day.
  visitDate: string;
  // The legs' sessions, as the visitor reads them: '09.05–10.05 WIB', or one per RW for a combo.
  session: string;
  // Where the group reports: the first leg's RW.
  gate: string;
  pax: number;
  total: number;
  // The hold's deadline, ISO with offset; null for a booking no longer held.
  deadline: string | null;
  institution: string | null;
  quotationNumber: string | null;
  quotationValidUntil: string | null;
  refundedAmount: number;
}

export type GuestTemplate = Exclude<
  NotificationTemplate,
  'phone_otp' | 'security_alert' | 'admin_new_paid_booking' | 'admin_booking_needs_review'
>;

const rowParamsSchema = z.looseObject({
  quotation_number: z.string().optional(),
  valid_until: z.string().optional(),
});

interface GuestParamsInput {
  name: string;
  facts: BookingFacts;
  queued: z.infer<typeof rowParamsSchema> | undefined;
}

function named({ name, facts }: GuestParamsInput) {
  return { name, booking_code: facts.bookingCode };
}

const GUEST_PARAMS: Record<GuestTemplate, (input: GuestParamsInput) => Record<string, unknown>> = {
  booking_created: (input) => ({
    ...named(input),
    package: input.facts.packageName,
    date: input.facts.visitDate,
    session: input.facts.session,
    pax: input.facts.pax,
    total: input.facts.total,
    deadline: input.facts.deadline,
  }),
  quotation_ready: (input) => ({
    ...named(input),
    quotation_number: input.queued?.quotation_number ?? input.facts.quotationNumber,
    valid_until: input.queued?.valid_until ?? input.facts.quotationValidUntil,
  }),
  payment_reminder: (input) => ({
    ...named(input),
    total: input.facts.total,
    deadline: input.facts.deadline,
  }),
  payment_received_ticket: (input) => ({
    ...named(input),
    package: input.facts.packageName,
    date: input.facts.visitDate,
    session: input.facts.session,
    pax: input.facts.pax,
  }),
  visit_reminder_d1: ({ name, facts }) => ({
    name,
    date: facts.visitDate,
    session: facts.session,
    gate: facts.gate,
  }),
  checked_in_thanks: ({ name, facts }) => ({ name, institution: facts.institution }),
  review_invite: ({ name }) => ({ name }),
  refund_processed: (input) => ({ ...named(input), amount: input.facts.refundedAmount }),
  booking_expired: named,
  booking_cancelled: named,
  certificate_ready: named,
  booking_link: named,
};

// The named parameters of a guest template, before its schema checks them.
export function guestTemplateParams(
  template: GuestTemplate,
  name: string,
  facts: BookingFacts,
  rowParams: unknown,
): Record<string, unknown> {
  return GUEST_PARAMS[template]({ name, facts, queued: rowParamsSchema.safeParse(rowParams).data });
}

// A staff message keeps what notify_staff wrote: the superadmin's copy with the institution and the total, an RW
// admin's with that RW's leg and never the total (decision of 2026-10-24, Q2). Staff messages go by email only.
export const staffParamsSchema = z.object({
  booking_code: templateParamsSchemas.booking_link.shape.booking_code,
  institution: templateParamsSchemas.checked_in_thanks.shape.institution.optional(),
  rw_name: templateParamsSchemas.visit_reminder_d1.shape.gate.optional(),
  visit_date: z.iso.date(),
  start_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .optional(),
  end_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .optional(),
  pax: z.int().positive(),
  total: z.int().nonnegative().optional(),
  reason: templateParamsSchemas.admin_booking_needs_review.shape.reason.optional(),
});

const DATE_KEYS: ReadonlySet<string> = new Set(['date', 'valid_until', 'visit_date']);
const MOMENT_KEYS: ReadonlySet<string> = new Set(['deadline', 'time']);
const RUPIAH_KEYS: ReadonlySet<string> = new Set(['total', 'amount']);

function displayValue(key: string, value: unknown): string {
  if (DATE_KEYS.has(key) && typeof value === 'string') return formatDateLong(value);
  if (MOMENT_KEYS.has(key) && typeof value === 'string') return formatDateTimeShort(value);
  if (RUPIAH_KEYS.has(key) && typeof value === 'number') return formatIDR(value);
  return String(value);
}

// The checked parameters as the message shows them, in their order: dates and times in Indonesian, amounts in
// rupiah. A parameter left out (an RW admin's copy has no total) is left out here too.
export function displayParams(params: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, displayValue(key, value)]),
  );
}
