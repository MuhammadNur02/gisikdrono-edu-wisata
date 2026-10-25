import { z } from 'zod';

import { CERTIFICATE_REASON_LIMITS } from '@/config/certificates';
import { copy } from '@/lib/copy/id';
import { isSafeFreeText } from '@/lib/validations/free-text';

// /dashboard/certificates (Task P4.5.03), shared by the forms and src/server/actions/certificates.ts. The reason of a
// waiver or a revocation lands in audit_logs or on the certificate row, which staff read later, so it follows the
// free-text rules: no phone numbers, addresses or links.

const messages = copy.cms.validation;

const reasonField = z
  .string()
  .trim()
  .min(CERTIFICATE_REASON_LIMITS.min, messages.required)
  .max(CERTIFICATE_REASON_LIMITS.max)
  .refine(isSafeFreeText, { message: copy.validation.freeText });

// Issuing again and rendering again name the booking alone.
export const certificateBookingSchema = z.object({ bookingId: z.uuid() }).strict();

export const waiveCertificatesSchema = z
  .object({ bookingId: z.uuid(), reason: reasonField })
  .strict();

export const revokeCertificateSchema = z
  .object({ certificateId: z.uuid(), reason: reasonField })
  .strict();

export type WaiveCertificatesInput = z.input<typeof waiveCertificatesSchema>;
export type WaiveCertificatesValues = z.output<typeof waiveCertificatesSchema>;
export type RevokeCertificateInput = z.input<typeof revokeCertificateSchema>;
export type RevokeCertificateValues = z.output<typeof revokeCertificateSchema>;
