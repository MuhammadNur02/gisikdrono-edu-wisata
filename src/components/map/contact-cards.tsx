import { CalendarClock, ExternalLink, MapPin } from 'lucide-react';

import { WhatsAppIcon } from '@/components/layout/whatsapp-icon';
import { Button } from '@/components/ui/button';
import { copy } from '@/lib/copy/id';
import { mapCopy } from '@/lib/copy/map';
import { formatTimeRange } from '@/lib/utils/dates';
import type { SessionSummary } from '@/lib/utils/session-summary';

export interface ContactCardsProps {
  address: string;
  // `Kampung Budaya & Seni: Jl. Jatisari, RW 13`; NULL while the arts kampung is offline.
  artsLine: string | null;
  // site_settings `contact.email`, once the kelurahan sets it.
  email: string | null;
  placeUrl: string;
  chatUrl: string;
  // The opening line the WhatsApp chat starts with, shown in the bubble.
  greeting: string;
  sessions: SessionSummary;
}

const CARD = 'flex flex-col gap-4 rounded-2xl p-7 md:p-8';

function AddressCard({
  address,
  artsLine,
  email,
  placeUrl,
}: Pick<ContactCardsProps, 'address' | 'artsLine' | 'email' | 'placeUrl'>) {
  return (
    <section aria-labelledby="kontak-alamat" className={`${CARD} border border-border bg-card`}>
      <h2 id="kontak-alamat" className="flex items-center gap-3 font-display text-xl font-bold">
        <MapPin aria-hidden className="size-5 text-rw05" />
        {mapCopy.addressTitle}
      </h2>
      <address className="space-y-2 text-body text-ink-2 not-italic">
        <p>{address}</p>
        {artsLine ? <p>{artsLine}</p> : null}
        {email ? (
          <p>
            <a
              href={`mailto:${email}`}
              className="break-all text-primary-ink underline-offset-4 hover:underline"
            >
              {email}
            </a>
          </p>
        ) : null}
        <p className="text-body-sm text-muted-foreground">{mapCopy.meetingPoint}</p>
      </address>
      <Button variant="outline" asChild className="mt-auto w-full">
        <a href={placeUrl} target="_blank" rel="noopener noreferrer">
          {mapCopy.openGoogle}
          <ExternalLink aria-hidden />
        </a>
      </Button>
    </section>
  );
}

// The WhatsApp number is never written out (DESIGN-SPEC §0): the bubble shows the prepared greeting, the button opens it.
function ChatCard({ chatUrl, greeting }: Pick<ContactCardsProps, 'chatUrl' | 'greeting'>) {
  return (
    <section aria-labelledby="kontak-whatsapp" className={`${CARD} bg-rw05-tint`}>
      <h2
        id="kontak-whatsapp"
        className="flex items-center gap-3 font-display text-xl font-bold text-rw05-strong"
      >
        <WhatsAppIcon className="size-6 shrink-0" />
        {mapCopy.chatTitle}
      </h2>
      <p className="text-body-md text-ink-2">{mapCopy.chatBody}</p>
      <p className="rounded-lg rounded-bl-sm bg-card px-4 py-3 text-body-md text-foreground">
        “{greeting}”
      </p>
      <Button variant="whatsapp" asChild className="mt-auto w-full rounded-full">
        <a href={chatUrl} target="_blank" rel="noopener noreferrer">
          <WhatsAppIcon className="size-5" />
          {copy.layout.whatsAppChat}
        </a>
      </Button>
    </section>
  );
}

function SessionsCard({ sessions }: { sessions: SessionSummary }) {
  const rows = [
    ...(sessions.weekdays ? [{ key: mapCopy.sessionDays, value: sessions.weekdays }] : []),
    ...sessions.slots.map((slot) => ({
      key: slot.label ?? formatTimeRange(slot.startTime, slot.endTime),
      value: formatTimeRange(slot.startTime, slot.endTime),
    })),
    ...(sessions.capacity === null
      ? []
      : [{ key: mapCopy.sessionCapacity, value: mapCopy.sessionCapacityValue(sessions.capacity) }]),
  ];
  return (
    <section aria-labelledby="kontak-sesi" className={`${CARD} border border-border bg-card`}>
      <h2 id="kontak-sesi" className="flex items-center gap-3 font-display text-xl font-bold">
        <CalendarClock aria-hidden className="size-5 text-rw13" />
        {mapCopy.sessionsTitle}
      </h2>
      <dl className="divide-y divide-border border-t border-border">
        {rows.map((row) => (
          <div key={row.key} className="flex items-baseline justify-between gap-4 py-3">
            <dt className="text-body-md text-muted-foreground">{row.key}</dt>
            <dd className="text-right text-body-md font-semibold tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-caption text-muted-foreground">{mapCopy.sessionsNote}</p>
    </section>
  );
}

// DESIGN-SPEC §3.9 contact blocks: the address and the way there, the chat with the prepared greeting (first on a
// phone), and the session days and times as the booking view gives them. A block without data is left out.
export function ContactCards(props: ContactCardsProps) {
  const hasSessions = props.sessions.slots.length > 0;
  return (
    <div className="grid gap-6 reveal-stagger md:grid-cols-2 lg:grid-cols-3">
      <div className="flex reveal *:flex-1">
        <AddressCard
          address={props.address}
          artsLine={props.artsLine}
          email={props.email}
          placeUrl={props.placeUrl}
        />
      </div>
      <div className="flex reveal *:flex-1 max-md:order-first">
        <ChatCard chatUrl={props.chatUrl} greeting={props.greeting} />
      </div>
      {hasSessions ? (
        <div className="flex reveal *:flex-1">
          <SessionsCard sessions={props.sessions} />
        </div>
      ) : null}
    </div>
  );
}
