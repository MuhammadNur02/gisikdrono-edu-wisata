import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AuthCard } from '@/components/auth/auth-card';
import { ReviewForm } from '@/components/reviews/review-form';
import { reviewsCopy } from '@/lib/copy/reviews';
import { submitReviewAction } from '@/server/actions/reviews';
import { requireGuestToken } from '@/server/auth/guards';

const text = reviewsCopy.form;

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: text.title,
  robots: { index: false, follow: false },
};

interface ReviewPageProps {
  params: Promise<{ bookingCode: string }>;
}

// docs/PRD.md FR-POST-06 (Task P4.11.02): the review form of the booking whose review link this browser holds
// (bk_<code>, scope review, 14 days; CLAUDE.md §7.5). Any other visitor gets the same 404 as for a code that does not
// exist (GUEST-02), and so does the visitor whose review was sent, since the link dies with it (FR-POST-05).
// internal.submit_review checks the used ticket, one review per booking and the pending status itself.
export default async function ReviewPage({ params }: ReviewPageProps) {
  const { bookingCode } = await params;
  const guard = await requireGuestToken(bookingCode, 'review');
  if (!guard.ok) notFound();
  return (
    <div className="w-full max-w-lg">
      <AuthCard title={text.title} description={text.description}>
        <ReviewForm bookingCode={guard.guest.bookingCode} submitAction={submitReviewAction} />
      </AuthCard>
    </div>
  );
}
