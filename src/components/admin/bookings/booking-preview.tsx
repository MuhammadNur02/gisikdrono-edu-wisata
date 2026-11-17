'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';

import { ResponsiveSheet } from '@/components/admin/shell/responsive-sheet';
import { StatusBadge } from '@/components/admin/status/status-badge';
import { RwTag } from '@/components/layout/rw-tag';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { bookingDetailPath } from '@/config/bookings';
import { bookingsAdminCopy } from '@/lib/copy/bookings-admin';
import { bookingEventReason } from '@/lib/utils/booking-event-text';
import { formatIDR } from '@/lib/utils/currency';
import { formatDateTimeShort, formatSessionStart, formatWeekdayDayMonth } from '@/lib/utils/dates';
import { rwBadgeFor } from '@/lib/utils/rw-units';
import type { ActionResult } from '@/types/action-result';
import type { BookingDetail, BookingPreview } from '@/types/booking-admin';
import type { RwBadge } from '@/types/rw-unit';

const text = bookingsAdminCopy.list.preview;
const detail = bookingsAdminCopy.detail;

export type PreviewLoader = (input: unknown) => Promise<ActionResult<BookingPreview>>;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 border-b border-border py-4 last:border-b-0">
      <h3 className="text-micro font-semibold text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Pair({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-4 text-caption">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium break-words text-ink-2">{value ?? '—'}</span>
    </div>
  );
}

function Visit({ booking, rws }: { booking: BookingDetail; rws: readonly RwBadge[] }) {
  return (
    <Section title={detail.visit}>
      <ul className="flex flex-col gap-2">
        {booking.legs.map((leg) => (
          <li
            key={`${String(leg.rwId)}-${leg.sessionDate}`}
            className="flex items-center gap-3 rounded-lg bg-muted p-3"
          >
            <RwTag rw={rwBadgeFor(leg.rwId, rws)} size="sm" />
            <span className="min-w-0 text-caption">
              <span className="block font-semibold text-foreground">
                {formatWeekdayDayMonth(leg.sessionDate)} · {formatSessionStart(leg.startTime)}
              </span>
              <span className="block text-muted-foreground">
                {[leg.label, text.pax(leg.pax)].filter(Boolean).join(' · ')}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Contact({ booking }: { booking: BookingDetail }) {
  return (
    <Section title={text.contact}>
      <Pair label={text.name} value={booking.picFirstName} />
      <Pair label={text.whatsapp} value={booking.phoneMasked} />
      <Pair label={text.email} value={booking.emailMasked} />
      <p className="text-caption text-muted-foreground">{text.contactHint}</p>
    </Section>
  );
}

function Payment({ booking }: { booking: BookingDetail }) {
  const latest = booking.payments.at(-1);
  return (
    <Section title={detail.payments}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-h4 font-bold text-foreground tabular-nums">
          {booking.amounts ? formatIDR(booking.amounts.total) : bookingsAdminCopy.list.amountHidden}
        </span>
        {latest ? <StatusBadge kind="payment_status" value={latest.status} /> : null}
      </div>
      {latest?.settlementTime ? (
        <p className="text-caption text-muted-foreground">
          {detail.settledAt(formatDateTimeShort(latest.settlementTime))}
        </p>
      ) : null}
    </Section>
  );
}

function Tickets({ booking }: { booking: BookingDetail }) {
  if (booking.tickets.length === 0) return null;
  return (
    <Section title={detail.tickets}>
      <ul className="flex flex-col gap-2">
        {booking.tickets.map((ticket) => (
          <li
            key={ticket.ticketCode}
            className="flex items-center justify-between gap-3 text-caption"
          >
            <span className="min-w-0">
              <span className="block font-mono text-foreground">{ticket.ticketCode}</span>
              <span className="block text-muted-foreground">
                {text.validOn(formatWeekdayDayMonth(ticket.validOn))}
              </span>
            </span>
            <StatusBadge kind="ticket_status" value={ticket.status} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function History({ preview }: { preview: BookingPreview }) {
  if (preview.events.length === 0) return null;
  return (
    <Section title={text.history}>
      <ol className="flex flex-col gap-3 border-l border-border pl-3">
        {preview.events.map((event) => (
          <li key={event.id} className="text-caption">
            <span className="block font-medium text-foreground">
              {event.reason ? bookingEventReason(event.reason) : detail.created}
            </span>
            <span className="block text-muted-foreground">
              {formatDateTimeShort(event.occurredAt)} · {detail.actors[event.actorType]}
            </span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function PreviewBody({ preview, rws }: { preview: BookingPreview; rws: readonly RwBadge[] }) {
  const { booking } = preview;
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-1.5 pb-2">
        <StatusBadge kind="booking_status" value={booking.status} />
        {booking.needsReview ? (
          <span className="text-caption text-warning">{bookingsAdminCopy.list.needsReview}</span>
        ) : null}
        {booking.channel ? (
          <span className="text-caption text-muted-foreground">
            · {detail.channel[booking.channel]}
          </span>
        ) : null}
      </div>
      <Visit booking={booking} rws={rws} />
      <Contact booking={booking} />
      <Payment booking={booking} />
      <Tickets booking={booking} />
      <History preview={preview} />
      <Button asChild className="mt-2 min-h-11 w-full">
        <Link href={bookingDetailPath(booking.id)}>{text.openDetail}</Link>
      </Button>
    </div>
  );
}

type LoadState = { id: string; result: ActionResult<BookingPreview> } | null;

function usePreview(bookingId: string | null, load: PreviewLoader): LoadState {
  const [state, setState] = useState<LoadState>(null);
  useEffect(() => {
    if (bookingId === null) return;
    let isCurrent = true;
    void load({ bookingId }).then((result) => {
      if (isCurrent) setState({ id: bookingId, result });
    });
    return () => {
      isCurrent = false;
    };
  }, [bookingId, load]);
  return state !== null && state.id === bookingId ? state : null;
}

export interface BookingPreviewSheetProps {
  // The booking whose row was opened, or null when the panel is closed.
  bookingId: string | null;
  // Its code, for the title while the rest loads.
  bookingCode: string | null;
  rws: readonly RwBadge[];
  load: PreviewLoader;
  onClose: () => void;
}

// The bookings list's preview panel (Dasbor Gelap): a sheet from the right (a drawer on a phone) with the visit, the
// masked contact, the money, the tickets and the newest events, read through loadBookingPreviewAction. Revealing a
// contact, changing a booking and sending messages stay on the detail page, one tap away.
function titleOf(preview: BookingPreview | null, bookingCode: string | null): string {
  return (
    preview?.booking.institutionName ?? preview?.booking.picFirstName ?? bookingCode ?? text.loading
  );
}

// What the panel shows: a skeleton while the booking loads, the booking, or why it could not be read.
function PreviewContent({ state, rws }: { state: LoadState; rws: readonly RwBadge[] }) {
  if (state === null) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3" aria-label={text.loading}>
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (state.result.ok) return <PreviewBody preview={state.result.data} rws={rws} />;
  return (
    <p role="alert" className="text-caption text-muted-foreground">
      {state.result.error.message || text.failed}
    </p>
  );
}

export function BookingPreviewSheet({
  bookingId,
  bookingCode,
  rws,
  load,
  onClose,
}: BookingPreviewSheetProps) {
  const state = usePreview(bookingId, load);
  const preview = state?.result.ok ? state.result.data : null;
  return (
    <ResponsiveSheet
      open={bookingId !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      title={titleOf(preview, bookingCode)}
      description={bookingCode ?? undefined}
    >
      <PreviewContent state={state} rws={rws} />
    </ResponsiveSheet>
  );
}
