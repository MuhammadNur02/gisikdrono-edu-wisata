import { z } from 'zod';

import { copy } from '@/lib/copy/id';
import { isSafeFreeText } from '@/lib/validations/free-text';

// The superadmin marking a submitted QRIS refund failed (re-review of PR #69, M-3), shared by the finance screen of
// Task P4.7 and src/server/actions/refund-requests.ts. The reason lands in refund_requests.failure_reason (at most 200
// characters) and mark_refund_request_failed asks for at least 10.

const REASON_MIN_LENGTH = 10;
const REASON_MAX_LENGTH = 200;

export const markRefundFailedSchema = z
  .object({
    requestId: z.uuid(),
    reason: z
      .string()
      .trim()
      .min(REASON_MIN_LENGTH, copy.cms.validation.required)
      .max(REASON_MAX_LENGTH)
      .refine(isSafeFreeText, { message: copy.validation.freeText }),
  })
  .strict();

export type MarkRefundFailedValues = z.infer<typeof markRefundFailedSchema>;
