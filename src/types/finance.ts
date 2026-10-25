import type { ISSUE_RESOLUTIONS } from '@/config/finance';
import type { EnumValue } from '@/db/enums';

// The finance pages' data (Task P4.7): money in whole rupiah, days as `YYYY-MM-DD`, instants as ISO strings.

export interface FinancePeriod {
  from: string;
  to: string;
}

export interface FinanceDay {
  day: string;
  grossSettled: number;
  refunds: number;
  net: number;
  paymentsCount: number;
  qrisCount: number;
  vaCount: number;
}

export interface FinanceTotals {
  grossSettled: number;
  refunds: number;
  net: number;
  paymentsCount: number;
  qrisCount: number;
  vaCount: number;
}

// docs/PRD.md §10.3: for the bookings paid in the period, what the ledger holds against what they were paid less
// what was refunded.
export interface LedgerInvariant {
  bookings: number;
  expected: number;
  ledger: number;
  mismatchedBookings: number;
}

export interface FinanceOverview {
  daily: FinanceDay[];
  totals: FinanceTotals;
  invariant: LedgerInvariant;
}

export interface PartyBalance {
  beneficiaryKey: string;
  beneficiary: EnumValue<'revenue_beneficiary'>;
  name: string;
  accrued: number;
  paidOut: number;
  outstanding: number;
}

export interface PartyPeriodShare {
  beneficiaryKey: string;
  settled: number;
  reversed: number;
  net: number;
}

export interface FinanceRecap {
  overview: FinanceOverview;
  balances: PartyBalance[];
  shares: PartyPeriodShare[];
}

export interface RuleLine {
  beneficiary: EnumValue<'revenue_beneficiary'>;
  rwId: number | null;
  vendorId: string | null;
  pct: number;
}

export interface RevenueRule {
  id: string;
  scope: EnumValue<'revenue_rule_scope'>;
  rwId: number | null;
  packageId: string | null;
  productId: string | null;
  name: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  lines: RuleLine[];
}

export interface RuleTargetOption {
  id: string;
  name: string;
}

export interface VendorOption {
  id: string;
  name: string;
  rwId: number | null;
}

export interface RevenueRuleTargets {
  packages: RuleTargetOption[];
  products: RuleTargetOption[];
  vendors: VendorOption[];
}

export interface PayoutBatch {
  id: string;
  beneficiaryKey: string;
  periodFrom: string;
  periodTo: string;
  totalAmount: number;
  reference: string | null;
  paidAt: string | null;
  hasProof: boolean;
  createdAt: string;
}

export interface SavedRule {
  ruleId: string;
  closedRuleId: string | null;
}

export interface Adjustment {
  id: string;
  bookingId: string;
  bookingCode: string | null;
  paymentId: string | null;
  type: EnumValue<'adjustment_type'>;
  status: EnumValue<'adjustment_status'>;
  amount: number;
  reason: string;
  details: AdjustmentDetails;
  proposedBy: string;
  proposedByName: string | null;
  proposedAt: string;
  approvedByName: string | null;
  approvedAt: string | null;
  applyNotBefore: string | null;
  appliedAt: string | null;
  rejectedReason: string | null;
}

// reclassify_share moves an amount of one ledger line from one beneficiary to another.
export interface AdjustmentDetails {
  lineRef?: string;
  fromKey?: string;
  toKey?: string;
}

export interface BookingPayment {
  id: string;
  orderId: string;
  method: EnumValue<'payment_method'> | null;
  status: EnumValue<'payment_status'>;
  grossAmount: number;
  refundedAmount: number;
  settlementTime: string | null;
}

export interface BookingLedgerLine {
  lineRef: string;
  beneficiaryKey: string;
  amount: number;
}

export interface FinanceBooking {
  id: string;
  bookingCode: string;
  status: EnumValue<'booking_status'>;
  institutionName: string | null;
  totalAmount: number;
  paidAt: string | null;
  visitDate: string | null;
  needsReview: boolean;
  payments: BookingPayment[];
  // What each line holds per beneficiary now: settlement, reversal and adjustment rows summed.
  ledger: BookingLedgerLine[];
}

export interface ReconciliationRun {
  id: string;
  runDate: string;
  source: string;
  startedAt: string;
  finishedAt: string | null;
  paymentsChecked: number;
  issuesFound: number;
  ledgerChainOk: boolean | null;
  auditChainOk: boolean | null;
}

// reconciliation_issues.resolution (20261103120000): the cause was fixed, or it was checked and needs no action.
export type IssueResolution = (typeof ISSUE_RESOLUTIONS)[number];

export interface ReconciliationIssue {
  id: string;
  runId: string;
  bookingId: string | null;
  bookingCode: string | null;
  paymentId: string | null;
  orderId: string | null;
  issueType: string;
  severity: EnumValue<'alert_severity'>;
  createdAt: string;
  resolvedAt: string | null;
  resolution: IssueResolution | null;
  resolutionNote: string | null;
}

export interface ChainState {
  ok: boolean;
  checked: number;
  firstBrokenId: number | null;
}

export interface ChainStatus {
  audit: ChainState;
  ledger: ChainState;
}

export interface RecheckOutcome {
  result: 'applied' | 'unchanged' | 'not_found';
  status: string | null;
}
