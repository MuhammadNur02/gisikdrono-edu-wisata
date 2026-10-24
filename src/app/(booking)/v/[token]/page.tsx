import { CheckCircle2, XCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';

import { AuthCard } from '@/components/auth/auth-card';
import { FormAlert } from '@/components/forms/form-alert';
import { copy } from '@/lib/copy/id';
import { clientIpFrom } from '@/lib/utils/client-ip';
import { formatDateLong } from '@/lib/utils/dates';
import { readTicketLanding } from '@/server/services/ticket-service';

const text = copy.booking.ticket.landing;

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: text.title, robots: { index: false, follow: false } };

interface TicketLandingPageProps {
  params: Promise<{ token: string }>;
}

// docs/PRD.md FR-PUB-21 (Task P3.10.03): what anyone who scans a ticket with an ordinary camera sees. Valid with its RW
// and day, or not valid; never the booking, its code, its PIC or whether the group has checked in. The gate scanner
// checks in through POST /api/tickets/verify instead.
export default async function TicketLandingPage({ params }: TicketLandingPageProps) {
  const { token } = await params;
  const landing = await readTicketLanding(token, clientIpFrom(await headers()));
  return (
    <div className="w-full max-w-md sm:my-auto">
      <AuthCard title={text.title}>
        {landing.kind === 'rate_limited' && <FormAlert tone="info">{text.rateLimited}</FormAlert>}
        {landing.kind === 'valid' && (
          <div className="flex items-start gap-3">
            <CheckCircle2 aria-hidden className="mt-0.5 size-6 shrink-0 text-success" />
            <div className="space-y-1">
              <p className="text-h3">{text.valid}</p>
              <p className="text-body-sm text-muted-foreground">
                {text.validFor(landing.rwName, formatDateLong(landing.validOn))}
              </p>
            </div>
          </div>
        )}
        {landing.kind === 'invalid' && (
          <div className="flex items-start gap-3">
            <XCircle aria-hidden className="mt-0.5 size-6 shrink-0 text-danger" />
            <div className="space-y-1">
              <p className="text-h3">{text.invalid}</p>
              <p className="text-body-sm text-muted-foreground">{text.invalidHint}</p>
            </div>
          </div>
        )}
      </AuthCard>
    </div>
  );
}
