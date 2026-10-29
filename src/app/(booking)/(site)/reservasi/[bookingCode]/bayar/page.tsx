import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BookingClosedNotice } from '@/components/booking/booking-closed-notice';
import { PaymentCard } from '@/components/booking/payment-card';
import { isPrelaunch } from '@/config/launch';
import { copy } from '@/lib/copy/id';
import { startPaymentAction } from '@/server/actions/payment';
import { requireGuestToken } from '@/server/auth/guards';
import { loadPaymentPage } from '@/server/services/payment-service';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: copy.booking.payment.title,
  robots: { index: false, follow: false },
};

interface PaymentPageProps {
  params: Promise<{ bookingCode: string }>;
}

// docs/PRD.md FR-BOOK-10 (Task P3.7.03, P3.7.04): the hold of the booking whose pay link this browser holds (bk_<code>,
// scope pay or manage). Any other visitor gets the same 404 as for a code that does not exist (GUEST-02). A pre-launch
// build takes no payment, so it reads no booking and says booking opens soon (docs/Security.md §8.9).
export default async function PaymentPage({ params }: PaymentPageProps) {
  if (isPrelaunch()) return <BookingClosedNotice isPrelaunch />;
  const { bookingCode } = await params;
  const guard = await requireGuestToken(bookingCode, 'pay');
  if (!guard.ok) notFound();
  const view = await loadPaymentPage(guard.guest.bookingId);
  return (
    <div className="w-full max-w-160">
      <PaymentCard view={view} action={startPaymentAction} />
    </div>
  );
}
