import { z } from 'zod';

import {
  ADJUSTMENT_REASON_MAX_LENGTH,
  ADJUSTMENT_REASON_MIN_LENGTH,
  FINANCE_DEFAULT_PERIOD_DAYS,
  FINANCE_MAX_PERIOD_DAYS,
  ISSUE_NOTE_MAX_LENGTH,
  ISSUE_NOTE_MIN_LENGTH,
  ISSUE_RESOLUTIONS,
  LEDGER_KEY_MAX_LENGTH,
  PAYOUT_ACCOUNT_DIGITS,
  PAYOUT_REFERENCE_MAX_LENGTH,
  PAYOUT_REFERENCE_MIN_LENGTH,
  RULE_MAX_LINES,
  RULE_NAME_MAX_LENGTH,
  RULE_PCT_DECIMALS,
  RULE_TOTAL_PCT,
  UPLOAD_PATH_MAX_LENGTH,
} from '@/config/finance';
import { DB_ENUMS } from '@/db/enums';
import { financeCopy } from '@/lib/copy/finance';
import { BOOKING_CODE_PATTERN } from '@/lib/utils/codes';
import { totpCodeField } from '@/lib/validations/auth';

// The finance pages' URL period and their forms (Task P4.7), shared by the dialogs and src/server/actions/finance*.ts.
// Each form carries the step-up code too (the *FormSchema variants); withStepUp sends it to verifyStaffTotpAction
// first and the rest to the action. Money is whole rupiah; the database checks every figure again.

type SearchParams = Record<string, string | string[] | undefined>;

const MS_PER_DAY = 86_400_000;
const DECIMAL_BASE = 10;
const PCT_SCALE = DECIMAL_BASE ** RULE_PCT_DECIMALS;
// A share typed as 12.34 may read back as 12.339999…; anything this close to a whole hundredth is one.
const PCT_TOLERANCE = 1e-6;
const ISO_DATE_LENGTH = 'YYYY-MM-DD'.length;
const isoDate = z.iso.date();
const rupiah = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const stepUpField = { code: totpCodeField };

function firstOf(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / MS_PER_DAY;
}

function daysBefore(day: string, days: number): string {
  return new Date(Date.parse(day) - days * MS_PER_DAY).toISOString().slice(0, ISO_DATE_LENGTH);
}

export interface PeriodRead {
  from: string;
  to: string;
  // The URL asked for a period that cannot be read; the page says so and shows the default.
  isInvalid: boolean;
}

// `?from=&to=` of the recap: the last 30 days up to today unless both name a valid period of at most 12 months.
export function parseFinancePeriod(params: SearchParams, today: string): PeriodRead {
  const fallback = { from: daysBefore(today, FINANCE_DEFAULT_PERIOD_DAYS), to: today };
  const from = firstOf(params, 'from');
  const to = firstOf(params, 'to');
  if (from === undefined && to === undefined) return { ...fallback, isInvalid: false };
  const parsed = z.object({ from: isoDate, to: isoDate }).safeParse({ from, to });
  if (!parsed.success) return { ...fallback, isInvalid: true };
  const span = daysBetween(parsed.data.from, parsed.data.to);
  if (span < 0 || span >= FINANCE_MAX_PERIOD_DAYS) return { ...fallback, isInvalid: true };
  return { ...parsed.data, isInvalid: false };
}

// ===== Revenue rules =====

const pctField = z
  .number()
  .positive()
  .max(RULE_TOTAL_PCT)
  .refine((pct) => Math.abs(pct * PCT_SCALE - Math.round(pct * PCT_SCALE)) < PCT_TOLERANCE, {
    message: financeCopy.rules.errors.RULE_LINES_INVALID,
  });

export const ruleLineSchema = z
  .object({
    beneficiary: z.enum(DB_ENUMS.revenue_beneficiary),
    rwId: z.number().int().positive().nullable(),
    vendorId: z.uuid().nullable(),
    pct: pctField,
  })
  .strict();

// The shares add up to exactly 100, compared in hundredths so no float rounding decides.
export function sharesTotalHundredths(lines: readonly { pct: number }[]): number {
  return lines.reduce((total, line) => total + Math.round(line.pct * PCT_SCALE), 0);
}

const ruleFields = {
  scope: z.enum(DB_ENUMS.revenue_rule_scope),
  rwId: z.number().int().positive().nullable(),
  packageId: z.uuid().nullable(),
  productId: z.uuid().nullable(),
  name: z.string().trim().min(1).max(RULE_NAME_MAX_LENGTH),
  effectiveFrom: isoDate,
  lines: z.array(ruleLineSchema).min(1).max(RULE_MAX_LINES),
};

function checkRule(rule: z.infer<z.ZodObject<typeof ruleFields>>, context: z.RefinementCtx) {
  if (sharesTotalHundredths(rule.lines) !== RULE_TOTAL_PCT * PCT_SCALE) {
    context.addIssue({ code: 'custom', path: ['lines'], message: financeCopy.rules.totalMustBe });
  }
  if (rule.scope === 'package' && rule.packageId === null) {
    context.addIssue({ code: 'custom', path: ['packageId'], message: financeCopy.rules.errors.RULE_TARGET_INVALID });
  }
  if (rule.scope === 'product' && rule.productId === null) {
    context.addIssue({ code: 'custom', path: ['productId'], message: financeCopy.rules.errors.RULE_TARGET_INVALID });
  }
}

export const saveRevenueRuleSchema = z.object(ruleFields).strict().superRefine(checkRule);
export const saveRevenueRuleFormSchema = z
  .object({ ...ruleFields, ...stepUpField })
  .strict()
  .superRefine(checkRule);
export type SaveRevenueRuleValues = z.output<typeof saveRevenueRuleSchema>;

// ===== Payouts =====

const payoutFields = {
  beneficiaryKey: z.string().regex(/^(kelurahan|rw:[0-9]{1,2}|vendor:[0-9a-f-]{36})$/),
  from: isoDate,
  to: isoDate,
  reference: z.string().trim().min(PAYOUT_REFERENCE_MIN_LENGTH).max(PAYOUT_REFERENCE_MAX_LENGTH),
  accountDigits: z.string().regex(new RegExp(`^[0-9]{${String(PAYOUT_ACCOUNT_DIGITS)}}$`)),
  // The uploads-quarantine path api/uploads/sign issued for the proof.
  proofUpload: z.string().min(1).max(UPLOAD_PATH_MAX_LENGTH),
};

function checkPayoutPeriod(payout: { from: string; to: string }, context: z.RefinementCtx) {
  if (payout.to < payout.from) {
    context.addIssue({ code: 'custom', path: ['to'], message: financeCopy.period.invalid });
  }
}

export const settlePayoutSchema = z.object(payoutFields).strict().superRefine(checkPayoutPeriod);
export const settlePayoutFormSchema = z
  .object({ ...payoutFields, ...stepUpField })
  .strict()
  .superRefine(checkPayoutPeriod);
export type SettlePayoutValues = z.output<typeof settlePayoutSchema>;

// ===== Adjustments =====

export const PROPOSABLE_ADJUSTMENTS = ['manual_refund', 'reclassify_share', 'write_off'] as const;

export const bookingLookupSchema = z
  .object({ bookingCode: z.string().trim().toUpperCase().pipe(z.string().regex(BOOKING_CODE_PATTERN)) })
  .strict();

const reasonField = z.string().trim().min(ADJUSTMENT_REASON_MIN_LENGTH).max(ADJUSTMENT_REASON_MAX_LENGTH);

const proposalFields = {
  type: z.enum(PROPOSABLE_ADJUSTMENTS),
  bookingId: z.uuid(),
  paymentId: z.uuid().nullable(),
  amount: rupiah,
  reason: reasonField,
  lineRef: z.string().max(LEDGER_KEY_MAX_LENGTH).nullable(),
  fromKey: z.string().max(LEDGER_KEY_MAX_LENGTH).nullable(),
  toKey: z.string().max(LEDGER_KEY_MAX_LENGTH).nullable(),
  evidenceUpload: z.string().min(1).max(UPLOAD_PATH_MAX_LENGTH),
};

function checkProposal(proposal: z.infer<z.ZodObject<typeof proposalFields>>, context: z.RefinementCtx) {
  if (proposal.type === 'manual_refund' && proposal.paymentId === null) {
    context.addIssue({ code: 'custom', path: ['paymentId'], message: 'Pilih pembayaran yang dikembalikan.' });
  }
  const isMove = proposal.type === 'reclassify_share';
  if (isMove && (!proposal.lineRef || !proposal.fromKey || !proposal.toKey || proposal.fromKey === proposal.toKey)) {
    context.addIssue({ code: 'custom', path: ['toKey'], message: 'Pilih baris dan dua pihak yang berbeda.' });
  }
}

export const proposeAdjustmentSchema = z.object(proposalFields).strict().superRefine(checkProposal);
export const proposeAdjustmentFormSchema = z
  .object({ ...proposalFields, ...stepUpField })
  .strict()
  .superRefine(checkProposal);
export type ProposeAdjustmentValues = z.output<typeof proposeAdjustmentSchema>;

export const adjustmentIdSchema = z.object({ adjustmentId: z.uuid() }).strict();
const rejectionFields = { adjustmentId: z.uuid(), reason: reasonField };
export const rejectAdjustmentSchema = z.object(rejectionFields).strict();
export const rejectAdjustmentFormSchema = z.object({ ...rejectionFields, ...stepUpField }).strict();

// ===== Reconciliation =====

export const resolveIssueSchema = z
  .object({
    issueId: z.uuid(),
    resolution: z.enum(ISSUE_RESOLUTIONS),
    note: z.string().trim().min(ISSUE_NOTE_MIN_LENGTH).max(ISSUE_NOTE_MAX_LENGTH),
  })
  .strict();
export type ResolveIssueValues = z.output<typeof resolveIssueSchema>;

export const recheckPaymentSchema = z.object({ paymentId: z.uuid() }).strict();
