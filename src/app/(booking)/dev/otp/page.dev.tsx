import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AuthCard } from '@/components/auth/auth-card';
import { PhoneOtpField } from '@/components/booking/phone-otp-field';
import { LOCAL_MAILPIT_URL } from '@/config/guest';
import { isLocalDevelopment } from '@/lib/local-development';
import { requestPhoneOtpAction, verifyPhoneOtpAction } from '@/server/actions/otp';

// A developer's page for trying the WhatsApp code before the booking wizard exists (Task P3.2.03). It is a
// page.dev.tsx, which only `next dev` serves (next.config.ts), and it answers 404 unless the server is a local
// development one as well (src/lib/local-development.ts). The code never appears here: the local outbox delivers it
// to Mailpit, as WhatsApp would deliver it to the phone.

export const metadata: Metadata = { title: 'Coba kode WhatsApp (lokal)' };

export default function DevOtpPage() {
  if (!isLocalDevelopment()) notFound();
  return (
    <AuthCard
      title="Coba kode WhatsApp"
      description={`Halaman ini hanya ada di server pengembangan lokal. Kode tidak dikirim ke WhatsApp; bacalah di Mailpit (${LOCAL_MAILPIT_URL}).`}
    >
      <PhoneOtpField requestAction={requestPhoneOtpAction} verifyAction={verifyPhoneOtpAction} />
    </AuthCard>
  );
}
