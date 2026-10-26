import 'server-only';

import { z } from 'zod';

import { DB_ENUMS } from '@/db/enums';
import type { DatabaseClient } from '@/db/rpc-result';
import { AppError } from '@/lib/errors';
import type { SnapAddon, SnapBooking } from '@/lib/midtrans/snap';
import type { OpenPaymentAttempt, PaymentPageView } from '@/types/payment';

// The reads behind a payment (Task P3.7.04), on the service-role client payment-service.ts hands in, each keyed by a
// booking id a verified guest link gave (CLAUDE.md §6.1). Nothing here writes.

const packageSnapshotSchema = z.object({
  name: z.string(),
  pricing_basis: z.enum(DB_ENUMS.pricing_basis),
  unit_price: z.int().nonnegative(),
});

const OPEN_STATUSES = ['initiated', 'pending', 'needs_review'] as const;

export async function openAttemptOf(
  adminClient: DatabaseClient,
  bookingId: string,
): Promise<OpenPaymentAttempt | null> {
  const { data, error } = await adminClient
    .from('payments')
    .select('id, order_id, status, snap_redirect_url, created_at')
    .eq('booking_id', bookingId)
    .in('status', OPEN_STATUSES)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    paymentId: data.id,
    orderId: data.order_id,
    status: data.status,
    redirectUrl: data.snap_redirect_url,
    createdAt: data.created_at,
  };
}

// What the Snap request is built from, before the attempt gives it an order id and the hold its deadline: the
// booking's own money snapshot and its PIC, never a participant (PAY-07). expiresAt is null for a quoted booking.
export interface PreparedSnapBooking {
  booking: Omit<SnapBooking, 'orderId' | 'expiresAt'> & { expiresAt: string | null };
  addons: SnapAddon[];
}

export async function snapBookingOf(
  adminClient: DatabaseClient,
  bookingId: string,
): Promise<PreparedSnapBooking> {
  const { data, error } = await adminClient
    .from('bookings')
    .select(
      'id, booking_code, total_amount, subtotal_package, discount_amount, pax_count, package_snapshot, pic_name, pic_email, pic_phone, expires_at',
    )
    .eq('id', bookingId)
    .single();
  if (error) throw error;
  // The retention run clears the contact of a booking long past paying (docs/Security.md §7.3).
  const { pic_email: picEmail, pic_phone: picPhone } = data;
  if (picEmail === null || picPhone === null) throw new AppError('STATE_INVALID');
  const packageLine = packageSnapshotSchema.parse(data.package_snapshot);
  const booking: PreparedSnapBooking['booking'] = {
    bookingId: data.id,
    bookingCode: data.booking_code,
    totalAmount: data.total_amount,
    packageName: packageLine.name,
    packageQuantity: packageLine.pricing_basis === 'flat_group' ? 1 : data.pax_count,
    packageUnitPrice: packageLine.unit_price,
    subtotalPackage: data.subtotal_package,
    discountAmount: data.discount_amount,
    picName: data.pic_name,
    picEmail,
    picPhone,
    expiresAt: data.expires_at,
  };
  return { booking, addons: await addonsOf(adminClient, bookingId) };
}

async function addonsOf(adminClient: DatabaseClient, bookingId: string): Promise<SnapAddon[]> {
  const { data, error } = await adminClient
    .from('booking_addons')
    .select('product_id, product_name_snapshot, unit_price, qty, line_total')
    .eq('booking_id', bookingId)
    .order('created_at')
    .order('id');
  if (error) throw error;
  return data.map((addon) => ({
    productId: addon.product_id,
    name: addon.product_name_snapshot,
    unitPrice: addon.unit_price,
    qty: addon.qty,
    lineTotal: addon.line_total,
  }));
}

async function latestPaymentOf(adminClient: DatabaseClient, bookingId: string) {
  const { data, error } = await adminClient
    .from('payments')
    .select('status, method, va_bank, va_number')
    .eq('booking_id', bookingId)
    .order('attempt_no', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function sessionsOf(adminClient: DatabaseClient, bookingId: string) {
  const { data, error } = await adminClient
    .from('booking_legs')
    .select('leg_order, rw_units(name), visit_sessions(session_date, start_time, end_time)')
    .eq('booking_id', bookingId)
    .order('leg_order');
  if (error) throw error;
  return data.map((leg) => ({
    rwName: leg.rw_units.name,
    sessionDate: leg.visit_sessions.session_date,
    startTime: leg.visit_sessions.start_time,
    endTime: leg.visit_sessions.end_time,
  }));
}

// /reservasi/[bookingCode]/bayar: the booking as the visitor pays for it, and how its last attempt stands. The PIC's
// contact stays out; the page shows what was booked and what to pay.
export async function paymentPageOf(
  adminClient: DatabaseClient,
  bookingId: string,
): Promise<PaymentPageView> {
  const { data, error } = await adminClient
    .from('bookings')
    .select(
      'booking_code, status, package_snapshot, pax_count, total_amount, expires_at, needs_review',
    )
    .eq('id', bookingId)
    .single();
  if (error) throw error;
  const [payment, sessions] = await Promise.all([
    latestPaymentOf(adminClient, bookingId),
    sessionsOf(adminClient, bookingId),
  ]);
  return {
    bookingCode: data.booking_code,
    status: data.status,
    packageName: packageSnapshotSchema.parse(data.package_snapshot).name,
    paxCount: data.pax_count,
    totalAmount: data.total_amount,
    expiresAt: data.expires_at,
    needsReview: data.needs_review,
    sessions,
    payment: payment && {
      status: payment.status,
      method: payment.method,
      vaBank: payment.va_bank,
      vaNumber: payment.va_number,
    },
  };
}

// The order a refund request refunds (re-review of PR #69, M-3), for the server's own Status API look.
export async function refundOrderOf(
  adminClient: DatabaseClient,
  requestId: string,
): Promise<string> {
  const { data: request, error } = await adminClient
    .from('refund_requests')
    .select('payment_id')
    .eq('id', requestId)
    .maybeSingle();
  if (error) throw error;
  if (request === null) throw new AppError('NOT_FOUND');
  const { data: payment, error: paymentError } = await adminClient
    .from('payments')
    .select('order_id')
    .eq('id', request.payment_id)
    .single();
  if (paymentError) throw paymentError;
  return payment.order_id;
}
