import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { AuthCard } from '@/components/auth/auth-card';
import { VerifiedDocumentCard } from '@/components/booking/verified-document-card';
import { FormAlert } from '@/components/forms/form-alert';
import { copy } from '@/lib/copy/id';
import { clientIpFrom } from '@/lib/utils/client-ip';
import { verifyDocumentCode } from '@/server/services/document-service';

const text = copy.documents.verifyPage;
// Ten Crockford symbols, as internal.new_verify_code draws them; typed in any case.
const VERIFY_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{10}$/i;

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: text.title, robots: { index: false, follow: false } };

interface VerifyPageProps {
  params: Promise<{ code: string }>;
}

// docs/PRD.md FR-PUB-20 (Task P3.6.05): a quotation or certificate by its verify code, rate-limited per IP, 404 for
// any code that names nothing, and never the document itself.
export default async function VerifyDocumentPage({ params }: VerifyPageProps) {
  const { code } = await params;
  if (!VERIFY_CODE_PATTERN.test(code)) notFound();
  const verified = await verifyDocumentCode(code.toUpperCase(), clientIpFrom(await headers()));
  if (verified.kind === 'rate_limited') {
    return (
      <div className="w-full max-w-md sm:my-auto">
        <AuthCard title={text.title} description={text.description}>
          <FormAlert tone="info">{text.rateLimited}</FormAlert>
        </AuthCard>
      </div>
    );
  }
  if (verified.document === null) notFound();
  return (
    <div className="w-full max-w-xl sm:my-auto">
      <VerifiedDocumentCard document={verified.document} />
    </div>
  );
}
