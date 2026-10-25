import 'server-only';

import { financeBooking, financeOverview, revenueRecap, type FinanceBookingReply } from '@/db/rpc-finance';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { asFinanceWrite } from '@/server/services/finance-errors';
import type { BookingLedgerLine, FinanceBooking, FinancePeriod, FinanceRecap } from '@/types/finance';

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

// What each line still holds per beneficiary: settlement, reversal and adjustment rows summed, as the RPCs count it.
function heldLines(ledger: FinanceBookingReply['ledger']): BookingLedgerLine[] {
  const held = new Map<string, BookingLedgerLine>();
  for (const row of ledger) {
    const key = `${row.line_ref}|${row.beneficiary_key}`;
    const line = held.get(key) ?? { lineRef: row.line_ref, beneficiaryKey: row.beneficiary_key, amount: 0 };
    held.set(key, { ...line, amount: line.amount + row.amount });
  }
  return [...held.values()].filter((line) => line.amount > 0);
}

function bookingOf(reply: FinanceBookingReply): FinanceBooking {
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
  };
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
  const reply = await asFinanceWrite(() => financeBooking(supabase, data.id));
  return reply ? bookingOf(reply) : null;
}
