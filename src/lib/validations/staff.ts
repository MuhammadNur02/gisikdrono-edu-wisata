import { z } from 'zod';

import { STATUS_REASON_MAX_LENGTH, STATUS_REASON_MIN_LENGTH } from '@/config/staff';
import { copy } from '@/lib/copy/id';
import { staffCopy } from '@/lib/copy/staff';
import { emailField } from '@/lib/validations/auth';
import { isSafeFreeText } from '@/lib/validations/free-text';
import { rwIdSchema } from '@/lib/validations/rw-unit';

// /dashboard/users (Task P4.8.02), shared by the forms and src/server/actions/staff.ts. The TOTP code of the step-up
// is not part of them: the form sends it to verifyStaffTotpAction first (src/lib/utils/step-up.ts).

const messages = copy.cms.validation;

// The two roles a person is invited to or given; 'none' is what deactivation leaves, never something chosen.
export const STAFF_ROLES = ['superadmin', 'admin_rw'] as const;
export type AssignableRole = (typeof STAFF_ROLES)[number];

// profiles_role_rw_ok and staff_invites_role_rw_ok: an RW admin has exactly one RW, a superadmin none.
function requireRwForRwAdmin(
  value: { role: AssignableRole; rwId: number | null },
  context: z.RefinementCtx,
): void {
  if (value.role === 'admin_rw' && value.rwId === null) {
    context.addIssue({ code: 'custom', path: ['rwId'], message: staffCopy.validation.rwRequired });
  }
  if (value.role === 'superadmin' && value.rwId !== null) {
    context.addIssue({
      code: 'custom',
      path: ['rwId'],
      message: staffCopy.validation.rwNotAllowed,
    });
  }
}

const roleFields = { role: z.enum(STAFF_ROLES), rwId: rwIdSchema.nullable() };

export const inviteStaffSchema = z
  .object({ email: emailField, ...roleFields })
  .strict()
  .superRefine(requireRwForRwAdmin);

export type InviteStaffInput = z.input<typeof inviteStaffSchema>;
export type InviteStaffValues = z.output<typeof inviteStaffSchema>;

const staffTarget = { userId: z.uuid() };

export const setStaffRoleSchema = z
  .object({ ...staffTarget, ...roleFields })
  .strict()
  .superRefine(requireRwForRwAdmin);

export type SetStaffRoleInput = z.input<typeof setStaffRoleSchema>;
export type SetStaffRoleValues = z.output<typeof setStaffRoleSchema>;

// The reason lands in audit_logs.metadata, which the superadmin reads later, so it follows the free-text rules: no
// phone numbers, addresses or links.
export const setStaffStatusSchema = z
  .object({
    ...staffTarget,
    isActive: z.boolean(),
    reason: z
      .string()
      .trim()
      .min(STATUS_REASON_MIN_LENGTH, messages.required)
      .max(STATUS_REASON_MAX_LENGTH)
      .refine(isSafeFreeText, { message: copy.validation.freeText }),
  })
  .strict();

export type SetStaffStatusInput = z.input<typeof setStaffStatusSchema>;
export type SetStaffStatusValues = z.output<typeof setStaffStatusSchema>;

export const cancelPromotionSchema = z.object(staffTarget).strict();

export const revokeInviteSchema = z.object({ inviteId: z.uuid() }).strict();
