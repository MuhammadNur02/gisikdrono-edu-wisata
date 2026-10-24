import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { WizardHeader } from '@/components/booking/wizard-header';
import { WizardPackageCard } from '@/components/booking/wizard-package-card';
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

const MAIN_CONTENT_ID = 'konten';

function BookingClosed() {
  return (
    <div className="mx-auto w-full max-w-md px-5 py-16 md:py-24">
      <FormAlert tone="info">
        <p className="font-medium">{text.closedTitle}</p>
        <p>{text.closed}</p>
      </FormAlert>
    </div>
  );
}

// docs/PRD.md FR-BOOK-01 (Task P3.5.01): the booking wizard of one package. The server reads the package, its
// add-ons and the sessions it can book; the browser keeps the draft and asks the server for every seat count and
// price again. DESIGN-SPEC §3.10: the wizard header in place of the site's, then the steps beside the summary.
export default async function BookingWizardPage({ params, searchParams }: BookingWizardPageProps) {
  const { packageSlug } = await params;
  const wizard = await wizardFor(packageSlug);
  if (!wizard) notFound();
  if (!isBookingStep((await searchParams).step)) redirect(bookingPath(packageSlug));
  const header = <WizardHeader packageName={wizard.package.name} packageSlug={packageSlug} />;
  if (!wizard.isOpen) {
    return (
      <>
        {header}
        <main id={MAIN_CONTENT_ID} className="flex-1">
          <BookingClosed />
        </main>
      </>
    );
  }
  const initialLegs = await listBookableSessions(wizard);
  return (
    <>
      {header}
      <main id={MAIN_CONTENT_ID} className="flex-1">
        <WizardShell
          wizardPackage={wizardPackageOf(wizard)}
          packageCard={<WizardPackageCard pkg={wizard.package} />}
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
      </main>
    </>
  );
}
