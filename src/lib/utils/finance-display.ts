import { KELURAHAN_KEY, RW_KEY_PREFIX, VENDOR_KEY_PREFIX } from '@/config/finance';
import { financeCopy } from '@/lib/copy/finance';
import type { DailyValue } from '@/lib/utils/kpi';
import type {
  AdjustmentReply,
  ApplyOutcome,
  FinanceDay,
  FinancePeriod,
  PayoutPreviewState,
  RecapDay,
  RevenueRule,
} from '@/types/finance';

// What the finance pages show of their figures (Task P4.7): a beneficiary's name, a rule version's state, the days of a
// period and the net series of the recap chart. Pure, so the pages and their tests read the same thing.

const MS_PER_DAY = 86_400_000;
const ISO_DATE_LENGTH = 'YYYY-MM-DD'.length;
const RW_PAD = 2;

// The beneficiary of a ledger key: the kelurahan, an RW's treasury, or a vendor by the name the recap view gives it.
export function partyLabel(key: string, name: string | null): string {
  if (key === KELURAHAN_KEY) return financeCopy.parties.kelurahan;
  if (key.startsWith(RW_KEY_PREFIX)) {
    const rw = key.slice(RW_KEY_PREFIX.length).padStart(RW_PAD, '0');
    return financeCopy.parties.rw(name ?? `RW ${rw}`);
  }
  if (key.startsWith(VENDOR_KEY_PREFIX))
    return financeCopy.parties.vendor(name ?? financeCopy.parties.unknown);
  return name ?? financeCopy.parties.unknown;
}

export type RuleState = 'inForce' | 'upcoming' | 'closed';

export function ruleState(
  rule: Pick<RevenueRule, 'effectiveFrom' | 'effectiveTo'>,
  today: string,
): RuleState {
  if (rule.effectiveFrom > today) return 'upcoming';
  if (rule.effectiveTo !== null && rule.effectiveTo < today) return 'closed';
  return 'inForce';
}

// Every day of a period, oldest first.
export function periodDays(period: FinancePeriod): string[] {
  const days: string[] = [];
  for (let at = Date.parse(period.from); at <= Date.parse(period.to); at += MS_PER_DAY) {
    days.push(new Date(at).toISOString().slice(0, ISO_DATE_LENGTH));
  }
  return days;
}

// One point per day of the period, zero where nothing was paid, so the chart never skips a quiet day.
export function netSeries(
  daily: readonly (FinanceDay | RecapDay)[],
  period: FinancePeriod,
): DailyValue[] {
  const net = new Map(daily.map((day) => [day.day, day.net]));
  return periodDays(period).map((day) => ({ day, value: net.get(day) ?? 0 }));
}

// A select's value as a number, or null for its empty option ("every RW", "the RWs of each visit").
export function numberOrNull(value: string): number | null {
  return value === '' ? null : Number(value);
}

// What apply_adjustment came to: applied, or rejected because Midtrans refunded the request the transfer answered
// (20261104080200, refund_paid_twice_detected). Any other status after an apply is the overtaken rejection too, since
// the RPC raises rather than answer one.
export function applyOutcomeOf(status: AdjustmentReply['status']): ApplyOutcome {
  return status === 'applied' ? 'applied' : 'overtaken';
}

// Review of PR #80, M-2: a payout is recorded only once the server's figure for the period is in and above nothing.
export function hasPayableTotal(state: PayoutPreviewState): boolean {
  return state.status === 'ready' && (state.preview.total ?? 0) > 0;
}
