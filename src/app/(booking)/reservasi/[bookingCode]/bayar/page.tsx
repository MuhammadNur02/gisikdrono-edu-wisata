import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PaymentCard } from '@/components/booking/payment-card';
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
// scope pay or manage). Any other visitor gets the same 404 as for a code that does not exist (GUEST-02).
export default async function PaymentPage({ params }: PaymentPageProps) {
  const { bookingCode } = await params;
  const guard = await requireGuestToken(bookingCode, 'pay');
  if (!guard.ok) notFound();
  const view = await loadPaymentPage(guard.guest.bookingId);
  return (
    <div className="w-full max-w-lg">
      <PaymentCard view={view} action={startPaymentAction} />
    </div>
  );
}
