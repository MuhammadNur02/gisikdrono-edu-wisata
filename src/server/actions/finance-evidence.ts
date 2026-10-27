'use server';

import { mapError, ok } from '@/lib/errors';
import { evidenceLinkSchema } from '@/lib/validations/finance';
import { requireAal2, requireRole } from '@/server/auth/guards';
import { signFinanceEvidence } from '@/server/services/document-service';
import type { ActionResult } from '@/types/action-result';
import type { EvidenceLink } from '@/types/finance';

// Review of PR #80, M-3 (docs/Security.md §6.6, §10.3): "Lihat bukti" on the adjustments and payouts pages. The
// superadmin at AAL2 gets a 300 s link to an adjustment's evidence or a payout's proof; the database names the file and
// records the view (rpc_reveal_finance_evidence) before anything is signed.
export async function viewFinanceEvidenceAction(
  input: unknown,
): Promise<ActionResult<EvidenceLink>> {
  const parsed = evidenceLinkSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const superadmin = await requireRole('superadmin');
  if (!superadmin.ok) return superadmin;
  const guard = await requireAal2();
  if (!guard.ok) return guard;

  try {
    return ok(await signFinanceEvidence(parsed.data.kind, parsed.data.id));
  } catch (error) {
    return mapError(error);
  }
}
