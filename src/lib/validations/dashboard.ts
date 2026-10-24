import { z } from 'zod';

import { FULL_NAME_MAX_LENGTH, RW_SCOPE_ALL } from '@/config/dashboard';
import { staffCopy } from '@/lib/copy/staff';
import { normalizePhone, PHONE_PATTERN } from '@/lib/utils/phone';
import { freeTextSchema } from '@/lib/validations/free-text';
import { rwIdSchema } from '@/lib/validations/rw-unit';

// The dashboard shell's own forms (Task P2.8.03): the superadmin's RW scope and the staff member's profile.

const PHONE_INPUT_MAX_LENGTH = 32;

export const rwScopeSchema = z
  .object({ scope: z.union([z.literal(RW_SCOPE_ALL), rwIdSchema]) })
  .strict();

export type RwScopeInput = z.input<typeof rwScopeSchema>;

// profiles.phone (Task P4.8.03): blank clears it; anything else is an Indonesian number in E.164, as its CHECK wants.
const profilePhoneField = z
  .string()
  .trim()
  .max(PHONE_INPUT_MAX_LENGTH, staffCopy.profile.phoneInvalid)
  .nullable()
  .transform((value) => (value === null || value === '' ? null : (normalizePhone(value) ?? value)))
  .refine((value) => value === null || PHONE_PATTERN.test(value), staffCopy.profile.phoneInvalid);

// The name can reach messages and documents later, so it follows the free-text rules (no links, addresses or
// phone numbers; academic titles such as S.Pd. pass). A form that leaves the phone out leaves it as it is.
export const updateProfileSchema = z
  .object({ fullName: freeTextSchema(FULL_NAME_MAX_LENGTH), phone: profilePhoneField.optional() })
  .strict();

export type UpdateProfileInput = z.input<typeof updateProfileSchema>;
export type UpdateProfileValues = z.output<typeof updateProfileSchema>;
