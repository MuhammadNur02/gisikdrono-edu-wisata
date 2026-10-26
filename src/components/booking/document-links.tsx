import { Download, FileText, ReceiptText, Ticket } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { GUEST_BOOKING_PATH } from '@/config/guest';
import { bookingHubCopy } from '@/lib/copy/booking-hub';
import { cn } from '@/lib/utils/cn';
import { formatDateLong } from '@/lib/utils/dates';
import { guestDocumentPath } from '@/lib/utils/paths';
import type { StatusHubView } from '@/types/booking-hub';

const text = bookingHubCopy.documents;

interface DocumentRowProps {
  icon: ReactNode;
  title: string;
  detail: string;
  href: string | null;
}

function DocumentRowBody(props: DocumentRowProps) {
  return (
    <>
      <span aria-hidden className="text-ink-2">
        {props.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-label leading-snug font-semibold',
            props.href ? 'text-foreground' : 'text-ink-2',
          )}
        >
          {props.title}
        </span>
        <span className="block text-caption text-muted-foreground">{props.detail}</span>
      </span>
      {props.href && <Download aria-hidden className="size-4.5 shrink-0 text-primary-ink" />}
    </>
  );
}

function DocumentRow(props: DocumentRowProps) {
  const body = <DocumentRowBody {...props} />;
  if (!props.href) {
    return <li className="flex min-h-14 items-center gap-3 rounded-xl px-3 py-2.5">{body}</li>;
  }
  return (
    <li>
      <a
        href={props.href}
        target="_blank"
        rel="noopener"
        className="flex min-h-14 items-center gap-3 rounded-xl bg-muted px-3 py-2.5 transition-colors duration-200 hover:bg-border"
      >
        {body}
      </a>
    </li>
  );
}

function TicketRow({ code, ticketCount }: { code: string; ticketCount: number }) {
  return (
    <li className="pt-1">
      {ticketCount > 0 ? (
        <Link
          href={`${GUEST_BOOKING_PATH}/${code}/tiket`}
          className="flex min-h-14 items-center gap-3 rounded-xl bg-primary-tint px-3 py-2.5 text-primary-ink transition-colors duration-200 hover:bg-primary-tint/70"
        >
          <Ticket aria-hidden className="size-5" />
          <span className="text-label font-semibold">{text.seeTickets}</span>
        </Link>
      ) : (
        <span className="flex min-h-14 items-center gap-3 px-3 py-2.5 text-ink-2">
          <Ticket aria-hidden className="size-5 text-ink-2" />
          <span>
            <span className="block text-label font-semibold">{text.tickets}</span>
            <span className="block text-caption text-muted-foreground">{text.afterPaid}</span>
          </span>
        </span>
      )}
    </li>
  );
}

// DESIGN-SPEC §3.11 "Dokumen": the Surat Penawaran, the invoice and receipt once paid, and the tickets, each opened
// through the booking's own document address (src/lib/utils/paths.ts guestDocumentPath), where its cookie reaches the
// server. What does not exist yet is named, faded, with when it comes.
export function DocumentLinks({ view }: { view: StatusHubView }) {
  const code = view.booking.bookingCode;
  const { quotation, invoice } = view;
  return (
    <section
      aria-labelledby="hub-documents"
      className="space-y-4 rounded-2xl border border-border bg-card p-5 md:p-6"
    >
      <h2 id="hub-documents" className="text-h4 font-bold">
        {text.title}
      </h2>
      <ul className="space-y-2">
        {quotation && (
          <DocumentRow
            icon={<FileText className="size-5" />}
            title={text.quotation}
            detail={`${quotation.number} · ${text.quotationValid(formatDateLong(quotation.validUntil))}`}
            href={guestDocumentPath(code, 'quotation', quotation.id)}
          />
        )}
        <DocumentRow
          icon={<ReceiptText className="size-5" />}
          title={text.invoice}
          detail={invoice ? `${invoice.number} · ${text.pdf}` : text.afterPaid}
          href={invoice ? guestDocumentPath(code, 'invoice', invoice.id) : null}
        />
        {invoice?.receiptNumber && (
          <DocumentRow
            icon={<ReceiptText className="size-5" />}
            title={text.receipt}
            detail={`${invoice.receiptNumber} · ${text.pdf}`}
            href={guestDocumentPath(code, 'receipt', invoice.id)}
          />
        )}
        <TicketRow code={code} ticketCount={view.ticketCount} />
      </ul>
    </section>
  );
}
