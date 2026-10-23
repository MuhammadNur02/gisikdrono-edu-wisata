import { z } from 'zod';

import { totpCodeField } from '@/lib/validations/auth';

// A signed-in staff member re-typing their authenticator code: to unlock the idle screen (docs/Security.md AUTH-11)
// or to step up before a critical action (§5.3). Shared by the forms and src/server/actions/staff-totp.ts.
export const stepUpSchema = z.object({ code: totpCodeField }).strict();

export type StepUpInput = z.input<typeof stepUpSchema>;
