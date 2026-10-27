import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { GuestCertificateList } from '@/components/certificates/guest-certificate-list';
import { certificatesCopy } from '@/lib/copy/certificates';
import { formatDateWritten } from '@/lib/utils/dates';
import { proveCertificatePhoneAction } from '@/server/actions/guest-certificates';
import { requireGuestToken } from '@/server/auth/guards';
import { hasCertificateProof } from '@/server/auth/guest-cookies';
import { guestCertificates } from '@/server/services/document-service';

const text = certificatesCopy.guest;

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: text.title, robots: { index: false, follow: false } };

interface CertificatePageProps {
  params: Promise<{ bookingCode: string }>;
}

// docs/PRD.md FR-POST-02 (Task P4.5.03; docs/Security.md §6.7, DOC-02, GUEST-06): the booking's certificates for the
// browser holding its certificate link (bk_<code>_certificate, 90 days). Any other visitor gets the same 404 as for a
// code that does not exist (GUEST-02). The page is private and never cached (next.config.ts, /reservasi).
export default async function CertificatePage({ params }: CertificatePageProps) {
  const { bookingCode } = await params;
  const guard = await requireGuestToken(bookingCode, 'certificate');
  if (!guard.ok) notFound();
  const view = await guestCertificates(guard.guest.bookingId, await hasCertificateProof(guard.guest));
  return (
    <div className="w-full max-w-2xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-h2 font-display font-bold">{text.title}</h1>
        {view.state !== 'expired' && (
          <p className="text-body-sm text-ink-2">
            {text.description(formatDateWritten(view.availableUntil))}
          </p>
        )}
      </header>
      <GuestCertificateList
        view={view}
        bookingCode={guard.guest.bookingCode}
        prove={proveCertificatePhoneAction}
      />
    </div>
  );
}
