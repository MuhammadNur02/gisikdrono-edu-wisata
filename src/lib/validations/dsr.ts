import { z } from 'zod';

import { OTP_CODE_LENGTH } from '@/config/guest';
import { dsrCopy } from '@/lib/copy/dsr';
import { BOOKING_CODE_PATTERN } from '@/lib/utils/codes';
import { captchaTokenField, totpCodeField } from '@/lib/validations/auth';
import { DSR_CLOSE_OUTCOMES, DSR_REQUEST_TYPES } from '@/types/dsr';

// The data-request queue (Task P4.10.03), shared by the forms and src/server/actions/dsr.ts and dsr-guest.ts. The
// reason and the closing note have the bounds dsr_open and finish_dsr check (20261104140100).

const TEXT_MIN_LENGTH = 10;
const TEXT_MAX_LENGTH = 2000;

const messages = dsrCopy.validation;
const OTP_CODE_PATTERN = new RegExp(`^\\d{${String(OTP_CODE_LENGTH)}}$`);
const bookingCodeField = z.string().regex(BOOKING_CODE_PATTERN);

const reasonField = z
  .string()
  .trim()
  .min(TEXT_MIN_LENGTH, messages.reason)
  .max(TEXT_MAX_LENGTH, messages.reason);
const noteField = z
  .string()
  .trim()
  .min(TEXT_MIN_LENGTH, messages.note)
  .max(TEXT_MAX_LENGTH, messages.note);

export const openDsrSchema = z
  .object({ bookingId: z.uuid(), requestType: z.enum(DSR_REQUEST_TYPES), reason: reasonField })
  .strict();
export type OpenDsrValues = z.output<typeof openDsrSchema>;

export const dsrStepSchema = z.object({ bookingId: z.uuid(), requestId: z.uuid() }).strict();
export type DsrStepValues = z.output<typeof dsrStepSchema>;

// The finishing steps; the form also sends the authenticator code, which verifyStaffTotpAction checks first.
export const dsrFinishSchema = z
  .object({ bookingId: z.uuid(), requestId: z.uuid(), note: noteField })
  .strict();
export type DsrFinishValues = z.output<typeof dsrFinishSchema>;
export const dsrFinishFormSchema = dsrFinishSchema.extend({ code: totpCodeField });

export const closeDsrSchema = z
  .object({
    bookingId: z.uuid(),
    requestId: z.uuid(),
    outcome: z.enum(DSR_CLOSE_OUTCOMES),
    note: noteField,
  })
  .strict();
export type CloseDsrValues = z.output<typeof closeDsrSchema>;

// The guest's steps on /reservasi/<code>/privasi.
export const requestDsrCodeSchema = z
  .object({ bookingCode: bookingCodeField, turnstileToken: captchaTokenField })
  .strict();
export const confirmDsrSchema = z
  .object({
    bookingCode: bookingCodeField,
    code: z.string().trim().regex(OTP_CODE_PATTERN, dsrCopy.guest.wrongCode),
  })
  .strict();
export const downloadDsrSchema = z
  .object({ bookingCode: bookingCodeField, format: z.enum(['json', 'pdf']) })
  .strict();
