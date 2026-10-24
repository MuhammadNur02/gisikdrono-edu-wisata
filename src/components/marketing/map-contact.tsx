import {
  BookOpen,
  CalendarClock,
  MapPin,
  Navigation,
  Palette,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';

import { SectionShell } from '@/components/layout/section';
import { SectionHeading } from '@/components/layout/section-heading';
import { WhatsAppIcon } from '@/components/layout/whatsapp-icon';
import { RwPinsMap } from '@/components/map/rw-pins-map';
import { Button } from '@/components/ui/button';
import { ARTS_KAMPUNG_STREET } from '@/config/home';
import { siteConfig } from '@/config/site';
import { homeCopy } from '@/lib/copy/home';
import { copy } from '@/lib/copy/id';
import { googleMapsDirectionsUrl } from '@/lib/utils/geo';
import { bookletPath } from '@/lib/utils/paths';
import { describeSlotHours, type SessionSummary } from '@/lib/utils/session-summary';
import type { BookletSummary } from '@/types/booklet';
import type { RwPin } from '@/types/map';
import type { RwUnitProfile } from '@/types/rw-unit';

export interface MapContactProps {
  id: string;
  // site_settings `kelurahan.address`; NULL while it is still the seeded sample.
  address: string | null;
  units: readonly RwUnitProfile[];
  sessions: SessionSummary;
  booklets: readonly BookletSummary[];
  // The wa.me link with the visit greeting.
  chatUrl: string;
}

interface Detail {
  icon: LucideIcon;
  label: string;
  value: string;
}

// The details the kelurahan has given: the address, the arts kampung's street, the days and times sessions run.
function detailsOf({ address, units, sessions }: MapContactProps): Detail[] {
  const details: Detail[] = [];
  if (address) details.push({ icon: MapPin, label: homeCopy.map.address, value: address });
  const arts = units.find((unit) => unit.scheduleEnabled);
  if (arts) {
    details.push({
      icon: Palette,
      label: arts.shortName,
      value: `${ARTS_KAMPUNG_STREET}, ${arts.label}`,
    });
  }
  const hours = describeSlotHours(sessions.slots);
  if (sessions.weekdays && hours) {
    details.push({
      icon: CalendarClock,
      label: homeCopy.map.sessions,
      value: `${sessions.weekdays} · ${hours}`,
    });
  }
  return details;
}

function DetailList({ details }: { details: readonly Detail[] }) {
  return (
    <dl className="space-y-4">
      {details.map(({ icon, label, value }) => {
        const Icon = icon;
        return (
          <div key={label} className="flex gap-3.5">
            <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-rw05" />
            <div className="space-y-0.5">
              <dt className="text-caption font-semibold text-muted-foreground">{label}</dt>
              <dd className="text-body text-foreground">{value}</dd>
            </div>
          </div>
        );
      })}
    </dl>
  );
}

// The WhatsApp line of DESIGN-SPEC §3.1 on the RW 05 tint: the number is never written out (§0), only the button.
function WhatsAppLine({ chatUrl, routeUrl }: { chatUrl: string; routeUrl: string }) {
  return (
    <div className="space-y-4 rounded-xl bg-rw05-tint p-6">
      <p className="flex items-start gap-3 font-display text-lg leading-snug font-bold text-rw05-strong">
        <WhatsAppIcon className="mt-0.5 size-6.5 shrink-0" />
        {homeCopy.map.whatsAppTitle}
      </p>
      <p className="text-body-md text-ink-2">{homeCopy.map.whatsAppBody}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button variant="whatsapp" asChild className="rounded-full">
          <a href={chatUrl} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon className="size-5" />
            {copy.layout.whatsAppChat}
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href={routeUrl} target="_blank" rel="noopener noreferrer">
            {homeCopy.map.directions}
            <Navigation aria-hidden />
          </a>
        </Button>
      </div>
    </div>
  );
}

// docs/PRD.md FR-PUB-07: the e-booklets keep their place under the contact, each opening its flipbook page.
function BookletLinks({ booklets }: { booklets: readonly BookletSummary[] }) {
  if (booklets.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-meta-caps text-muted-foreground">{homeCopy.map.booklets}</p>
      <ul className="flex flex-wrap gap-x-5 gap-y-1">
        {booklets.map((booklet) => (
          <li key={booklet.id}>
            <Link
              href={bookletPath(booklet.slug)}
              className="inline-flex min-h-11 items-center gap-2 text-label font-semibold text-primary-ink underline-offset-4 hover:underline"
            >
              <BookOpen aria-hidden className="size-4.5" />
              {booklet.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function pinsOf(units: readonly RwUnitProfile[]): RwPin[] {
  return units.flatMap((unit) =>
    unit.mapLat !== null && unit.mapLng !== null
      ? [
          {
            lat: unit.mapLat,
            lng: unit.mapLng,
            label: unit.label,
            name: `${unit.label} · ${unit.shortName}`,
            path: unit.path,
            accentKey: unit.accentKey,
          },
        ]
      : [],
  );
}

// DESIGN-SPEC §3.1 `Peta & kontak`: the map with a pin per kampung beside the contact column, the WhatsApp line last.
// A phone stacks the heading, the map and the details.
export function MapContact(props: MapContactProps) {
  const titleId = `${props.id}-judul`;
  const pins = pinsOf(props.units);
  const routeUrl = googleMapsDirectionsUrl(
    props.address ?? `${siteConfig.ownerName}, ${siteConfig.locality.city}`,
  );
  return (
    <SectionShell id={props.id} labelledBy={titleId}>
      <div className="grid gap-8 lg:grid-cols-12 lg:items-center lg:gap-x-6">
        <SectionHeading
          titleId={titleId}
          eyebrow={homeCopy.map.eyebrow}
          title={homeCopy.map.title}
          description={homeCopy.map.description}
          size="compact"
          className="lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:self-end lg:pl-10"
        />
        {pins.length > 0 ? (
          <div className="lg:col-span-7 lg:row-span-2 lg:row-start-1">
            <RwPinsMap pins={pins} label={homeCopy.map.mapLabel} />
          </div>
        ) : null}
        <div className="reveal space-y-8 lg:col-span-5 lg:col-start-8">
          <DetailList details={detailsOf(props)} />
          <WhatsAppLine chatUrl={props.chatUrl} routeUrl={routeUrl} />
          <BookletLinks booklets={props.booklets} />
        </div>
      </div>
    </SectionShell>
  );
}
