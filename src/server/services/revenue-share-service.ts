import 'server-only';

import { z } from 'zod';

import { FINANCE_LIST_LIMIT, PAYOUT_ACCOUNT_DIGITS } from '@/config/finance';
import { EDITABLE_SETTING_KEYS } from '@/config/site-settings';
import { DB_ENUMS } from '@/db/enums';
import { payoutPreview, saveRevenueRule, settleRevenueEntries } from '@/db/rpc-finance';
import { financeCopy } from '@/lib/copy/finance';
import { AppError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { failureFor } from '@/lib/uploads/outcomes';
import { createUuidV7 } from '@/lib/utils/uuid-v7';
import type {
  PayoutPreviewValues,
  SaveRevenueRuleValues,
  SettlePayoutValues,
} from '@/lib/validations/finance';
import type { StaffContext } from '@/server/auth/guards';
import { removeFinanceEvidence, storeFinanceEvidence } from '@/server/services/document-service';
import { asFinanceWrite } from '@/server/services/finance-errors';
import type {
  PayoutBatch,
  PayoutPreview,
  RevenueRule,
  RevenueRuleTargets,
  SavedRule,
} from '@/types/finance';

// /dashboard/finance/revenue-share (Task P4.7.02; docs/Security.md REC-05, REC-10, PAY-16): the rule versions, the
// targets a rule may name, and the payouts. Reads go through the superadmin's session client under RLS; writes through
// save_revenue_rule and settle_revenue_entries, which check the fresh TOTP themselves. A payout's proof is put in the
// documents bucket by document-service.ts before the RPC names it.

const ruleRowSchema = z.object({
  id: z.uuid(),
  scope: z.enum(DB_ENUMS.revenue_rule_scope),
  rw_id: z.number().nullable(),
  package_id: z.uuid().nullable(),
  product_id: z.uuid().nullable(),
  name: z.string(),
  effective_from: z.string(),
  effective_to: z.string().nullable(),
  revenue_share_rule_lines: z.array(
    z.object({
      beneficiary: z.enum(DB_ENUMS.revenue_beneficiary),
      rw_id: z.number().nullable(),
      vendor_id: z.uuid().nullable(),
      pct: z.number(),
    }),
  ),
});

export async function listRevenueRules(): Promise<RevenueRule[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('revenue_share_rules')
    .select(
      'id, scope, rw_id, package_id, product_id, name, effective_from, effective_to, revenue_share_rule_lines(beneficiary, rw_id, vendor_id, pct)',
    )
    .eq('is_active', true)
    .order('effective_from', { ascending: false })
    .limit(FINANCE_LIST_LIMIT);
  if (error) throw error;
  return z
    .array(ruleRowSchema)
    .parse(data)
    .map((row) => ({
      id: row.id,
      scope: row.scope,
      rwId: row.rw_id,
      packageId: row.package_id,
      productId: row.product_id,
      name: row.name,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
      lines: row.revenue_share_rule_lines.map((line) => ({
        beneficiary: line.beneficiary,
        rwId: line.rw_id,
        vendorId: line.vendor_id,
        pct: line.pct,
      })),
    }));
}

export async function listRuleTargets(): Promise<RevenueRuleTargets> {
  const supabase = await createSupabaseServerClient();
  const [packages, products, vendors] = await Promise.all([
    supabase.from('tour_packages').select('id, name').neq('status', 'archived').order('name'),
    supabase.from('products_umkm').select('id, name').neq('status', 'archived').order('name'),
    supabase.from('umkm_vendors').select('id, name, rw_id').eq('is_active', true).order('name'),
  ]);
  if (packages.error) throw packages.error;
  if (products.error) throw products.error;
  if (vendors.error) throw vendors.error;
  return {
    packages: packages.data,
    products: products.data,
    vendors: vendors.data.map((vendor) => ({
      id: vendor.id,
      name: vendor.name,
      rwId: vendor.rw_id,
    })),
  };
}

export async function saveRule(values: SaveRevenueRuleValues): Promise<SavedRule> {
  const supabase = await createSupabaseServerClient();
  return asFinanceWrite(() => saveRevenueRule(supabase, values));
}

const batchRowSchema = z.object({
  id: z.uuid(),
  beneficiary_key: z.string(),
  period_from: z.string(),
  period_to: z.string(),
  total_amount: z.number().int(),
  reference: z.string().nullable(),
  paid_at: z.string().nullable(),
  proof_path: z.string().nullable(),
  created_at: z.string(),
});

export async function listPayouts(): Promise<PayoutBatch[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('payout_batches')
    .select(
      'id, beneficiary_key, period_from, period_to, total_amount, reference, paid_at, proof_path, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(FINANCE_LIST_LIMIT);
  if (error) throw error;
  return z
    .array(batchRowSchema)
    .parse(data)
    .map((row) => ({
      id: row.id,
      beneficiaryKey: row.beneficiary_key,
      periodFrom: row.period_from,
      periodTo: row.period_to,
      totalAmount: row.total_amount,
      reference: row.reference,
      paidAt: row.paid_at,
      hasProof: row.proof_path !== null,
      createdAt: row.created_at,
    }));
}

// site_settings.finance.expected_payout_account_masked (PAY-16), as the superadmin's session reads it; null when unset.
export async function readExpectedPayoutAccount(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', EDITABLE_SETTING_KEYS.expectedPayoutAccountMasked)
    .maybeSingle();
  if (error) throw error;
  const value = typeof data?.value === 'string' ? data.value.trim() : '';
  return value === '' ? null : value;
}

// REC-10: the last four digits the superadmin read off the Midtrans dashboard must be those of the expected account.
function checkPayoutAccount(expected: string | null, typedDigits: string): void {
  if (expected === null) throw new AppError('VALIDATION', financeCopy.payouts.errors.ACCOUNT_UNSET);
  const expectedDigits = expected.replace(/\D/g, '').slice(-PAYOUT_ACCOUNT_DIGITS);
  if (expectedDigits !== typedDigits) {
    throw new AppError('FORBIDDEN', financeCopy.payouts.errors.ACCOUNT_MISMATCH);
  }
}

export async function settlePayout(
  ctx: StaffContext,
  values: SettlePayoutValues,
): Promise<PayoutBatch> {
  checkPayoutAccount(await readExpectedPayoutAccount(), values.accountDigits);
  const stored = await storeFinanceEvidence(
    ctx,
    values.proofUpload,
    `payouts/${createUuidV7()}/bukti`,
  );
  if (!stored.ok) throw new AppError('VALIDATION', failureFor(stored.problem).error.message);
  const supabase = await createSupabaseServerClient();
  try {
    return await asFinanceWrite(() =>
      settleRevenueEntries(supabase, {
        beneficiaryKey: values.beneficiaryKey,
        from: values.from,
        to: values.to,
        reference: values.reference,
        proofPath: stored.path,
        expectedTotal: values.expectedTotal,
      }),
    );
  } catch (error) {
    await removeFinanceEvidence(stored.path);
    throw error;
  }
}

// Review of PR #80, M-2: what a payout of one party would stamp, the figure the superadmin transfers and then confirms.
export async function previewPayout(values: PayoutPreviewValues): Promise<PayoutPreview> {
  const supabase = await createSupabaseServerClient();
  return asFinanceWrite(() => payoutPreview(supabase, values));
}
