import { z } from 'zod';

import { PHONE_LAST_DIGITS } from '@/config/guest';
import { BOOKING_CODE_PATTERN } from '@/lib/utils/codes';
import { captchaTokenField } from '@/lib/validations/auth';

// The visitor's certificate page (Task P4.5.03), shared by its forms and src/server/actions/guest-certificates.ts.
// The step-up carries a Turnstile token like every other public form (CLAUDE.md §5.2; follow-up of the review of
// PR #94).

const bookingCode = z.string().regex(BOOKING_CODE_PATTERN);

export const certificatePhoneSchema = z
  .object({
    bookingCode,
    lastFour: z.string().regex(new RegExp(`^[0-9]{${String(PHONE_LAST_DIGITS)}}$`)),
    turnstileToken: captchaTokenField,
  })
  .strict();
