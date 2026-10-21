import { z } from 'zod';

import { FULL_NAME_MAX_LENGTH, RW_SCOPE_ALL } from '@/config/dashboard';
import { freeTextSchema } from '@/lib/validations/free-text';
import { rwIdSchema } from '@/lib/validations/rw-unit';

// The dashboard shell's own forms (Task P2.8.03): the superadmin's RW scope and the staff member's profile.

export const rwScopeSchema = z
  .object({ scope: z.union([z.literal(RW_SCOPE_ALL), rwIdSchema]) })
  .strict();

export type RwScopeInput = z.input<typeof rwScopeSchema>;

// The name can reach messages and documents later, so it follows the free-text rules (no links, addresses or
// phone numbers; academic titles such as S.Pd. pass).
export const updateProfileSchema = z
  .object({ fullName: freeTextSchema(FULL_NAME_MAX_LENGTH) })
  .strict();

export type UpdateProfileInput = z.input<typeof updateProfileSchema>;
