import { MessageCircle } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { bookingHubCopy } from '@/lib/copy/booking-hub';
import { formatIDR } from '@/lib/utils/currency';
import { formatDateLong, formatTimeRange } from '@/lib/utils/dates';
import { buildWhatsAppChatUrl } from '@/lib/utils/whatsapp';
import type { StatusHubView } from '@/types/booking-hub';

const text = bookingHubCopy;
const CARD = 'space-y-4 rounded-2xl border border-border bg-card p-5 md:p-6';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-t border-border py-3 first:border-0 first:pt-0">
      <dt className="shrink-0 text-body-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-body-sm font-medium">{children}</dd>
    </div>
  );
}

function sessionLines(view: StatusHubView): string[] {
  return view.booking.sessions.map(
    (session) => `${session.rwName} · ${formatTimeRange(session.startTime, session.endTime)}`,
  );
}

// Only a booking made while add-ons were on sale holds any (decision of 2026-10-29: UMKM products are ordered from the
// Koperasi Merah Putih now), so the row shows only then.
function addonLine(view: StatusHubView): string {
  return view.addons.map((addon) => `${addon.name} × ${String(addon.qty)}`).join(', ');
}

// DESIGN-SPEC §3.11 "Rincian": what was booked, with the PIC masked to a first name and an initial.
export function HubDetails({ view }: { view: StatusHubView }) {
  const { booking } = view;
  return (
    <section aria-labelledby="hub-details" className={CARD}>
      <h2 id="hub-details" className="text-h4 font-bold">
        {booking.packageName}
      </h2>
      <dl>
        <Row label={text.details.date}>{formatDateLong(view.visitDate)}</Row>
        <Row label={text.details.session}>
          {sessionLines(view).map((line) => (
            <span key={line} className="block tabular-nums">
              {line}
            </span>
          ))}
        </Row>
        <Row label={text.details.pax}>{text.details.paxCount(booking.paxCount)}</Row>
        {view.institutionName && <Row label={text.details.group}>{view.institutionName}</Row>}
        {view.picShortName && <Row label={text.details.pic}>{view.picShortName}</Row>}
        {view.addons.length > 0 && <Row label={text.details.addons}>{addonLine(view)}</Row>}
        <Row label={text.details.total}>
          <span className="text-h4 font-display font-extrabold tabular-nums">
            {formatIDR(booking.totalAmount)}
          </span>
        </Row>
      </dl>
    </section>
  );
}

// docs/PRD.md §13.1 A16–A17, go-live check #27: the terms in force, read from site_settings.
// The add-on term only for a booking that holds add-ons (decision of 2026-10-29: none is sold any more).
export function HubTerms({
  terms,
  hasAddons,
}: {
  terms: StatusHubView['terms'];
  hasAddons: boolean;
}) {
  return (
    <section aria-labelledby="hub-terms" className={CARD}>
      <h2 id="hub-terms" className="text-h4 font-bold">
        {text.terms.title}
      </h2>
      <ul className="list-disc space-y-1.5 pl-5 text-body-sm text-ink-2">
        {terms.refundSchedule.map((step) => (
          <li key={step.minDays}>{text.terms.refundLine(step.minDays, step.pct)}</li>
        ))}
        {hasAddons && <li>{text.terms.addons}</li>}
        <li>{text.terms.weather(terms.weatherMax, terms.weatherHours)}</li>
      </ul>
    </section>
  );
}

export function HubHelp({
  bookingCode,
  whatsappNumber,
}: {
  bookingCode: string;
  whatsappNumber: string;
}) {
  return (
    <section aria-labelledby="hub-help" className={CARD}>
      <div className="space-y-1">
        <h2 id="hub-help" className="text-h4 font-bold">
          {text.help.title}
        </h2>
        <p className="text-body-sm text-ink-2">{text.help.body}</p>
      </div>
      <Button asChild variant="outline" className="w-full">
        <a
          href={buildWhatsAppChatUrl(whatsappNumber, text.help.greeting(bookingCode))}
          target="_blank"
          rel="noopener"
        >
          <MessageCircle aria-hidden />
          {text.help.chat}
        </a>
      </Button>
    </section>
  );
}
