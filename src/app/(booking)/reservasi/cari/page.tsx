import type { Metadata } from 'next';

import { AuthCard } from '@/components/auth/auth-card';
import { BookingLookupForm } from '@/components/booking/booking-lookup-form';
import { copy } from '@/lib/copy/id';
import { lookupBookingAction } from '@/server/actions/guest';

const text = copy.booking.lookup;

export const metadata: Metadata = { title: text.title };

// docs/PRD.md FR-BOOK-16, Task P3.3.03: sends a link again and never shows a booking.
export default function BookingLookupPage() {
  return (
    <AuthCard title={text.title} description={text.description}>
      <BookingLookupForm action={lookupBookingAction} />
    </AuthCard>
  );
}
