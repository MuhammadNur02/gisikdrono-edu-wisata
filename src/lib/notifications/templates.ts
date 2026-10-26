import 'server-only';

import { z } from 'zod';

import { DB_ENUMS, type EnumValue } from '@/db/enums';
import { freeTextSchema } from '@/lib/validations/free-text';

export type NotificationTemplate = EnumValue<'notification_template'>;

// The body parameters of every WhatsApp template, in the order of docs/Task.md Appendix B, typed so a
// message is checked before it is queued or sent (CLAUDE.md Recipe C). Codes, dates and amounts have
// exact shapes and free text goes through freeTextSchema, so no parameter can carry a link, a host or a
// phone number. Links travel only in URL buttons, minted by the worker from params.link_scope.
const BOOKING_CODE = /^GSK-[0-9A-HJKMNP-TV-Z]{8}$/;
const QUOTATION_NUMBER = /^SP\/GSK\/\d{4}\/\d{2}\/\d{4,}$/;
const OTP_CODE = /^\d{6}$/;
const REVIEW_REASON = /^[A-Z][A-Z_]{2,59}$/;
const ALERT_RULE = /^[a-z][a-z0-9_]{1,59}$/;
const FIRST_NAME_MAX_LENGTH = 60;
const LABEL_MAX_LENGTH = 120;

const name = freeTextSchema(FIRST_NAME_MAX_LENGTH);
const label = freeTextSchema(LABEL_MAX_LENGTH);
const bookingCode = z.string().regex(BOOKING_CODE);
const visitDate = z.iso.date();
const moment = z.iso.datetime({ offset: true });
const pax = z.int().positive();
const amountIdr = z.int().nonnegative();

export const templateParamsSchemas = {
  phone_otp: z.strictObject({ code: z.string().regex(OTP_CODE) }),
  booking_created: z.strictObject({
    name,
    booking_code: bookingCode,
    package: label,
    date: visitDate,
    session: label,
    pax,
    total: amountIdr,
    deadline: moment,
  }),
  quotation_ready: z.strictObject({
    name,
    booking_code: bookingCode,
    quotation_number: z.string().regex(QUOTATION_NUMBER),
    valid_until: visitDate,
  }),
  payment_reminder: z.strictObject({
    name,
    booking_code: bookingCode,
    total: amountIdr,
    deadline: moment,
  }),
  payment_received_ticket: z.strictObject({
    name,
    booking_code: bookingCode,
    package: label,
    date: visitDate,
    session: label,
    pax,
  }),
  booking_expired: z.strictObject({ name, booking_code: bookingCode }),
  booking_cancelled: z.strictObject({ name, booking_code: bookingCode }),
  visit_reminder_d1: z.strictObject({ name, date: visitDate, session: label, gate: label }),
  checked_in_thanks: z.strictObject({ name, institution: label }),
  certificate_ready: z.strictObject({ name, booking_code: bookingCode }),
  review_invite: z.strictObject({ name }),
  refund_processed: z.strictObject({ name, booking_code: bookingCode, amount: amountIdr }),
  admin_new_paid_booking: z.strictObject({
    booking_code: bookingCode,
    institution: label,
    date: visitDate,
    pax,
    total: amountIdr,
  }),
  admin_booking_needs_review: z.strictObject({
    booking_code: bookingCode,
    reason: z.string().regex(REVIEW_REASON),
  }),
  security_alert: z.strictObject({
    severity: z.enum(DB_ENUMS.alert_severity),
    rule: z.string().regex(ALERT_RULE),
    time: moment,
  }),
  booking_link: z.strictObject({ name, booking_code: bookingCode }),
  weather_disruption: z.strictObject({
    name,
    booking_code: bookingCode,
    rw: label,
    date: visitDate,
    deadline: moment,
    moves: z.int().positive(),
  }),
} satisfies Record<NotificationTemplate, z.ZodType>;

export type TemplateParams<Template extends NotificationTemplate> = z.infer<
  (typeof templateParamsSchemas)[Template]
>;

// Throws a ZodError for params that do not fit the template, which mapError turns into VALIDATION.
export function parseTemplateParams(
  template: NotificationTemplate,
  params: unknown,
): TemplateParams<NotificationTemplate> {
  const schema: z.ZodType<TemplateParams<NotificationTemplate>> = templateParamsSchemas[template];
  return schema.parse(params);
}
