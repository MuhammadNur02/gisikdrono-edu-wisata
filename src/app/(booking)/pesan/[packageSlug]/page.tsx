import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { WizardShell } from '@/components/booking/wizard-shell';
import { FormAlert } from '@/components/forms/form-alert';
import { copy } from '@/lib/copy/id';
import { isBookingStep } from '@/lib/utils/booking-wizard';
import { bookingPath } from '@/lib/utils/paths';
import { SLUG_PATTERN } from '@/lib/validations/content';
import {
  createBookingAction,
  listBookableSessionsAction,
  previewQuoteAction,
  requestQuotationAction,
} from '@/server/actions/booking';
import { requestPhoneOtpAction, verifyPhoneOtpAction } from '@/server/actions/otp';
import {
  listBookableSessions,
  loadBookingWizard,
  wizardPackageOf,
} from '@/server/services/booking-wizard-service';

const text = copy.booking.wizard;

// The layout makes every booking page dynamic, private and noindex (CLAUDE.md §5.1); this one says so itself too.
export const dynamic = 'force-dynamic';

interface BookingWizardPageProps {
  params: Promise<{ packageSlug: string }>;
  searchParams: Promise<{ step?: string | string[] }>;
}

// An address that is no slug at all never reaches the cached package read.
async function wizardFor(packageSlug: string) {
  return SLUG_PATTERN.test(packageSlug) ? loadBookingWizard(packageSlug) : null;
}

export async function generateMetadata({ params }: BookingWizardPageProps): Promise<Metadata> {
  const wizard = await wizardFor((await params).packageSlug);
  return wizard ? { title: text.title(wizard.package.name) } : {};
}

function BookingClosed({ packageName }: { packageName: string }) {
  return (
    <div className="mx-auto w-full max-w-md space-y-4 sm:my-auto">
      <h1 className="text-h2 text-balance">{text.title(packageName)}</h1>
      <FormAlert tone="info">
        <p className="font-medium">{text.closedTitle}</p>
        <p>{text.closed}</p>
      </FormAlert>
    </div>
  );
}

// docs/PRD.md FR-BOOK-01 (Task P3.5.01): the booking wizard of one package. The server reads the package, its
// add-ons and the sessions it can book; the browser keeps the draft and asks the server for every seat count and
// price again.
export default async function BookingWizardPage({ params, searchParams }: BookingWizardPageProps) {
  const { packageSlug } = await params;
  const wizard = await wizardFor(packageSlug);
  if (!wizard) notFound();
  if (!isBookingStep((await searchParams).step)) redirect(bookingPath(packageSlug));
  if (!wizard.isOpen) return <BookingClosed packageName={wizard.package.name} />;
  const initialLegs = await listBookableSessions(wizard);
  return (
    <div className="w-full max-w-3xl space-y-6">
      <h1 className="text-h1 text-balance">{text.title(wizard.package.name)}</h1>
      <WizardShell
        wizardPackage={wizardPackageOf(wizard)}
        addons={wizard.addons}
        initialLegs={initialLegs}
        actions={{
          listSessions: listBookableSessionsAction,
          previewQuote: previewQuoteAction,
          createBooking: createBookingAction,
          requestQuotation: requestQuotationAction,
          requestOtp: requestPhoneOtpAction,
          verifyOtp: verifyPhoneOtpAction,
        }}
      />
    </div>
  );
}
