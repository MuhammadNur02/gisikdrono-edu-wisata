import 'server-only';

import { KELURAHAN_KEY } from '@/config/finance';
import {
  financeBooking,
  financeOverview,
  revenueRecap,
  type FinanceBookingReply,
} from '@/db/rpc-finance';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { sumOf } from '@/lib/utils/kpi';
import { asFinanceWrite } from '@/server/services/finance-errors';
import type {
  BookingLedgerLine,
  FinanceBooking,
  FinancePeriod,
  FinanceRecap,
  HeldWeatherLink,
  RwFinanceRecap,
} from '@/types/finance';

// /dashboard/finance (Task P4.7.01; docs/Security.md REC-07): the superadmin's recap at AAL2, read only from the
// ledger views and the finance RPCs (finance_overview, revenue_recap) through the session client, so every check of
// the database applies again. Nothing here is computed from editable rows.

export async function loadFinanceRecap(period: FinancePeriod): Promise<FinanceRecap> {
  const supabase = await createSupabaseServerClient();
  const [overview, recap] = await Promise.all([
    financeOverview(supabase, period),
    revenueRecap(supabase, period),
  ]);
  return { overview, balances: recap.balances, shares: recap.shares };
}

// docs/PRD.md §13.1 A26 (owner, 2026-10-27): an RW admin's own recap, read only. revenue_recap alone, which
// internal.stats_scope keeps to the admin's RW: their treasury's and their vendors' shares and what each is still owed,
// never a payment, a booker or an account number (finance_overview stays the superadmin's). A kelurahan row, which
// that scope never returns, is left out here as well, so the page shows the RW's parties only.
export async function loadRwFinanceRecap(period: FinancePeriod): Promise<RwFinanceRecap> {
  const supabase = await createSupabaseServerClient();
  const recap = await revenueRecap(supabase, period);
  const shares = recap.shares.filter((share) => share.beneficiaryKey !== KELURAHAN_KEY);
  const balances = recap.balances.filter((balance) => balance.beneficiary !== 'kelurahan');
  return {
    totals: {
      settled: sumOf(shares, (share) => share.settled),
      reversed: sumOf(shares, (share) => share.reversed),
      net: sumOf(shares, (share) => share.net),
      outstanding: sumOf(balances, (balance) => balance.outstanding),
    },
    days: recap.days,
    balances,
    shares,
  };
}

// What each line still holds per beneficiary: settlement, reversal and adjustment rows summed, as the RPCs count it.
function heldLines(ledger: FinanceBookingReply['ledger']): BookingLedgerLine[] {
  const held = new Map<string, BookingLedgerLine>();
  for (const row of ledger) {
    const key = `${row.line_ref}|${row.beneficiary_key}`;
    const line = held.get(key) ?? {
      lineRef: row.line_ref,
      beneficiaryKey: row.beneficiary_key,
      amount: 0,
    };
    held.set(key, { ...line, amount: line.amount + row.amount });
  }
  return [...held.values()].filter((line) => line.amount > 0);
}

function bookingOf(
  reply: FinanceBookingReply,
  heldWeatherLinks: HeldWeatherLink[],
): FinanceBooking {
  const { booking } = reply;
  return {
    id: booking.id,
    bookingCode: booking.booking_code,
    status: booking.status,
    institutionName: booking.institution_name,
    totalAmount: booking.total_amount,
    paidAt: booking.paid_at,
    visitDate: booking.visit_date,
    needsReview: booking.needs_review,
    payments: reply.payments.map((payment) => ({
      id: payment.id,
      orderId: payment.order_id,
      method: payment.method,
      status: payment.status,
      grossAmount: payment.gross_amount,
      refundedAmount: payment.refunded_amount,
      settlementTime: payment.settlement_time,
    })),
    ledger: heldLines(reply.ledger),
    heldWeatherLinks,
  };
}

// The weather links the sweep holds for the superadmin on a booking (resolve_weather_link): window closed, no outcome.
// A manual refund may name one as the weather refund it is ("Refund cuaca untuk", PR #90's key).
async function heldWeatherLinksOf(bookingId: string): Promise<HeldWeatherLink[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('weather_notice_bookings')
    .select('id, rw_id, open_until')
    .eq('booking_id', bookingId)
    .is('resolved_at', null)
    .lte('open_until', new Date().toISOString())
    .order('open_until', { ascending: true });
  if (error) throw error;
  return data.map((link) => ({ id: link.id, rwId: link.rw_id, openUntil: link.open_until }));
}

// The booking an adjustment is proposed for, found by its code (CLAUDE.md §7.5: never by a uuid in the URL).
export async function findFinanceBooking(bookingCode: string): Promise<FinanceBooking | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('bookings')
    .select('id')
    .eq('booking_code', bookingCode)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [reply, heldWeatherLinks] = await Promise.all([
    asFinanceWrite(() => financeBooking(supabase, data.id)),
    heldWeatherLinksOf(data.id),
  ]);
  return reply ? bookingOf(reply, heldWeatherLinks) : null;
}
