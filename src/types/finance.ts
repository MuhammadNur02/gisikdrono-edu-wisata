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
// what was refunded less the Midtrans fees of their weather refunds (20261104080200, A18: the visitor bears the fee,
// the parties keep nothing), which the recap shows as its own line.
export interface LedgerInvariant {
  bookings: number;
  expected: number;
  ledger: number;
  weatherRefundFees: number;
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

// One day of the ledger's net, for the daily chart.
export interface RecapDay {
  day: string;
  net: number;
}

// An RW admin's own recap (docs/PRD.md §13.1 A26): their RW's treasury and UMKM vendors, read only.
export interface RwFinanceRecap {
  totals: { settled: number; reversed: number; net: number; outstanding: number };
  days: RecapDay[];
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
  hasEvidence: boolean;
  // An applied manual_refund Midtrans lists under its key with another amount, still blocking (L6, review of PR #80
  // L-1): the superadmin may release it.
  hasOpenKeyMismatch: boolean;
}

// reclassify_share moves an amount of one ledger line from one beneficiary to another; a manual_refund may name the
// held weather link it answers (PR #90's key).
export interface AdjustmentDetails {
  lineRef?: string;
  fromKey?: string;
  toKey?: string;
  weatherLinkId?: string;
  // A manual transfer's QR key id, from the server (A28).
  keyId?: string;
}

// A finance list reads at most FINANCE_LIST_LIMIT rows; hasMore says there are older ones to filter for (L-5).
export interface FinanceList<T> {
  items: T[];
  hasMore: boolean;
}

// A weather link the sweep holds for the superadmin on a booking (20261104080200, resolve_weather_link): its window
// closed with no outcome.
export interface HeldWeatherLink {
  id: string;
  rwId: number;
  openUntil: string;
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
  heldWeatherLinks: HeldWeatherLink[];
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

// reconciliation_issues.resolution (20261104190000): the cause was fixed, or it was checked and needs no action.
export type IssueResolution = (typeof ISSUE_RESOLUTIONS)[number];

// What a Midtrans statement row said beside what the payment holds (review of PR #99, M2); null for other issues.
export interface StatementFacts {
  midtransStatus: string | null;
  midtransAmount: number | null;
  ourStatus: string | null;
  ourAmount: number | null;
}

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
  statement: StatementFacts | null;
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

// What an adjustment RPC answers (20261101130200): the row's id, its status and when it may apply.
export interface AdjustmentReply {
  id: string;
  status: EnumValue<'adjustment_status'>;
  applyNotBefore: string | null;
}

// An applied manual transfer also names the Midtrans orders it closed, which the server ends next (A28).
export interface AppliedAdjustmentReply extends AdjustmentReply {
  closeOrders: string[];
}

// apply_adjustment (20261104080200, review of PR #69, M-2) answers a bank transfer whose visit-terms request Midtrans
// refunded meanwhile with the row rejected, not an error, so its refund_paid_twice_detected alert stays: 'overtaken'.
export type ApplyOutcome = 'applied' | 'overtaken';

export interface AppliedAdjustment extends AdjustmentReply {
  outcome: ApplyOutcome;
}

// Review of PR #80, M-2: what a payout of one party would stamp, read by payout_preview as of the server's time.
export interface PayoutPreview {
  beneficiaryKey: string;
  oldestUnpaid: string | null;
  from: string;
  to: string;
  // Null while the period is not one a payout may cover.
  total: number | null;
  entries: number | null;
  // Review of PR #103, M-1: the day of an unpaid negative row before the period, which no payout of it may leave behind.
  blockedSince: string | null;
}

// What the payout form shows of the preview while it is asked again.
export type PayoutPreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; preview: PayoutPreview }
  | { status: 'failed'; message: string };

// Review of PR #80, M-3: what a "Lihat bukti" link opens, valid for EVIDENCE_LINK_SECONDS.
export type EvidenceKind = 'adjustment' | 'payout';

export interface EvidenceLink {
  url: string;
  expiresInSeconds: number;
}
