import { z } from 'zod';

import { PHONE_LAST_DIGITS } from '@/config/guest';
import { BOOKING_CODE_PATTERN } from '@/lib/utils/codes';

// The visitor's certificate page (Task P4.5.03), shared by its forms and src/server/actions/guest-certificates.ts.

const bookingCode = z.string().regex(BOOKING_CODE_PATTERN);

export const certificatePhoneSchema = z
  .object({
    bookingCode,
    lastFour: z.string().regex(new RegExp(`^[0-9]{${String(PHONE_LAST_DIGITS)}}$`)),
  })
  .strict();
