import 'server-only';

import { z } from 'zod';

import { DB_ENUMS } from '@/db/enums';
import { resultOf, type DatabaseClient } from '@/db/rpc-result';
import type {
  ChainStatus,
  FinanceOverview,
  FinancePeriod,
  PartyBalance,
  PartyPeriodShare,
  PayoutBatch,
  RuleLine,
  SavedRule,
} from '@/types/finance';

// The finance RPCs of Task P4.7 (20261101130000 to 20261104100100) and the stats RPCs they sit beside
// (20261027080200), on the signed-in superadmin's session client: auth.uid(), AAL2, the fresh-TOTP checks and RLS
// all apply. Every reply is jsonb, parsed here into the camelCase shapes of src/types/finance.ts.

const money = z.number().int();
const count = z.number().int().nonnegative();

const financeDaySchema = z.looseObject({
  day: z.string(),
  gross_settled: money,
  refunds: money,
  net: money,
  payments_count: count,
  qris_count: count,
  va_count: count,
});

const totalsSchema = z.object({
  gross_settled: money,
  refunds: money,
  net: money,
  payments_count: count,
  qris_count: count,
  va_count: count,
});

const overviewSchema = z.object({
  daily: z.array(financeDaySchema),
  totals: totalsSchema,
  invariant: z.object({ bookings: count, expected: money, ledger: money, mismatched_bookings: count }),
});

function totalsOf(row: z.infer<typeof totalsSchema>) {
  return {
    grossSettled: row.gross_settled,
    refunds: row.refunds,
    net: row.net,
    paymentsCount: row.payments_count,
    qrisCount: row.qris_count,
    vaCount: row.va_count,
  };
}

export async function financeOverview(
  client: DatabaseClient,
  period: FinancePeriod,
): Promise<FinanceOverview> {
  const reply = await resultOf(
    client.rpc('finance_overview', { p_from: period.from, p_to: period.to }),
  );
  const parsed = overviewSchema.parse(reply);
  return {
    daily: parsed.daily.map((row) => ({ day: row.day, ...totalsOf(row) })),
    totals: totalsOf(parsed.totals),
    invariant: {
      bookings: parsed.invariant.bookings,
      expected: parsed.invariant.expected,
      ledger: parsed.invariant.ledger,
      mismatchedBookings: parsed.invariant.mismatched_bookings,
    },
  };
}

const recapSchema = z.object({
  by_beneficiary: z.array(
    z.looseObject({
      beneficiary_key: z.string(),
      settled_amount: money.nullable(),
      reversed_amount: money.nullable(),
      net_amount: money.nullable(),
    }),
  ),
  outstanding: z.array(
    z.looseObject({
      beneficiary_key: z.string(),
      beneficiary: z.enum(DB_ENUMS.revenue_beneficiary),
      beneficiary_name: z.string().nullable(),
      accrued: money.nullable(),
      paid_out: money.nullable(),
      outstanding: money.nullable(),
    }),
  ),
});

export interface RevenueRecap {
  shares: PartyPeriodShare[];
  balances: PartyBalance[];
}

// revenue_recap: what each party earned in the period, and what it is owed in all (v_revenue_recap_by_party).
export async function revenueRecap(
  client: DatabaseClient,
  period: FinancePeriod,
): Promise<RevenueRecap> {
  const reply = await resultOf(client.rpc('revenue_recap', { p_from: period.from, p_to: period.to }));
  const parsed = recapSchema.parse(reply);
  return {
    shares: parsed.by_beneficiary.map((row) => ({
      beneficiaryKey: row.beneficiary_key,
      settled: row.settled_amount ?? 0,
      reversed: row.reversed_amount ?? 0,
      net: row.net_amount ?? 0,
    })),
    balances: parsed.outstanding.map((row) => ({
      beneficiaryKey: row.beneficiary_key,
      beneficiary: row.beneficiary,
      name: row.beneficiary_name ?? '',
      accrued: row.accrued ?? 0,
      paidOut: row.paid_out ?? 0,
      outstanding: row.outstanding ?? 0,
    })),
  };
}

const bookingReplySchema = z
  .object({
    booking: z.looseObject({
      id: z.uuid(),
      booking_code: z.string(),
      status: z.enum(DB_ENUMS.booking_status),
      institution_name: z.string().nullable(),
      total_amount: money,
      paid_at: z.string().nullable(),
      visit_date: z.string().nullable(),
      needs_review: z.boolean(),
    }),
    payments: z.array(
      z.looseObject({
        id: z.uuid(),
        order_id: z.string(),
        method: z.enum(DB_ENUMS.payment_method).nullable(),
        status: z.enum(DB_ENUMS.payment_status),
        gross_amount: money,
        refunded_amount: money,
        settlement_time: z.string().nullable(),
      }),
    ),
    ledger: z.array(
      z.looseObject({ line_ref: z.string(), beneficiary_key: z.string(), amount: money }),
    ),
  })
  .loose();

export type FinanceBookingReply = z.infer<typeof bookingReplySchema>;

// finance_booking: null for a booking that does not exist.
export async function financeBooking(
  client: DatabaseClient,
  bookingId: string,
): Promise<FinanceBookingReply | null> {
  const reply = await resultOf(client.rpc('finance_booking', { p_booking_id: bookingId }));
  return reply === null ? null : bookingReplySchema.parse(reply);
}

export interface RuleToSave {
  scope: (typeof DB_ENUMS.revenue_rule_scope)[number];
  rwId: number | null;
  packageId: string | null;
  productId: string | null;
  name: string;
  effectiveFrom: string;
  lines: RuleLine[];
}

const savedRuleSchema = z.object({ rule_id: z.uuid(), closed_rule_id: z.uuid().nullable() });

export async function saveRevenueRule(client: DatabaseClient, rule: RuleToSave): Promise<SavedRule> {
  const lines = rule.lines.map((line) => ({
    beneficiary: line.beneficiary,
    rw_id: line.rwId,
    vendor_id: line.vendorId,
    pct: line.pct,
  }));
  const reply = await resultOf(
    client.rpc('save_revenue_rule', {
      p_scope: rule.scope,
      p_name: rule.name,
      p_effective_from: rule.effectiveFrom,
      p_lines: lines,
      p_rw_id: rule.rwId ?? undefined,
      p_package_id: rule.packageId ?? undefined,
      p_product_id: rule.productId ?? undefined,
    }),
  );
  const parsed = savedRuleSchema.parse(reply);
  return { ruleId: parsed.rule_id, closedRuleId: parsed.closed_rule_id };
}

const batchSchema = z.looseObject({
  id: z.uuid(),
  beneficiary_key: z.string(),
  period_from: z.string(),
  period_to: z.string(),
  total_amount: money,
  reference: z.string().nullable(),
  paid_at: z.string().nullable(),
  proof_path: z.string().nullable(),
  created_at: z.string(),
});

export function payoutBatchOf(row: z.infer<typeof batchSchema>): PayoutBatch {
  return {
    id: row.id,
    beneficiaryKey: row.beneficiary_key,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    totalAmount: row.total_amount,
    reference: row.reference,
    paidAt: row.paid_at,
    hasProof: row.proof_path !== null,
    createdAt: row.created_at,
  };
}

export interface PayoutToSettle {
  beneficiaryKey: string;
  from: string;
  to: string;
  reference: string;
  proofPath: string;
}

export async function settleRevenueEntries(
  client: DatabaseClient,
  payout: PayoutToSettle,
): Promise<PayoutBatch> {
  const reply = await resultOf(
    client.rpc('settle_revenue_entries', {
      p_beneficiary_key: payout.beneficiaryKey,
      p_from: payout.from,
      p_to: payout.to,
      p_reference: payout.reference,
      p_proof_path: payout.proofPath,
    }),
  );
  return payoutBatchOf(batchSchema.parse(reply));
}

const chainSchema = z.object({ ok: z.boolean(), checked: count, first_broken_id: z.number().int().nullable() });
const chainsSchema = z.object({ audit: chainSchema, ledger: chainSchema });

// verify_audit_chain: the superadmin at AAL2, six times an hour at most (RATE_LIMITED beyond).
export async function verifyAuditChain(client: DatabaseClient): Promise<ChainStatus> {
  const parsed = chainsSchema.parse(await resultOf(client.rpc('verify_audit_chain')));
  const stateOf = (chain: z.infer<typeof chainSchema>) => ({
    ok: chain.ok,
    checked: chain.checked,
    firstBrokenId: chain.first_broken_id,
  });
  return { audit: stateOf(parsed.audit), ledger: stateOf(parsed.ledger) };
}
