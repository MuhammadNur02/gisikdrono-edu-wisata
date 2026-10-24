import { ArrowRight, ExternalLink, Mail, MapPin, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { RwEyebrow } from '@/components/layout/rw-eyebrow';
import { Button } from '@/components/ui/button';
import { siteConfig } from '@/config/site';
import { copy } from '@/lib/copy/id';
import { mapCopy } from '@/lib/copy/map';
import { formatPhone } from '@/lib/utils/phone';
import { buildWhatsAppChatUrl } from '@/lib/utils/whatsapp';
import type { RwUnitSummary } from '@/types/rw-unit';

export interface ContactBlockProps {
  // site_settings `contact.whatsapp_number`, or the env number when the kelurahan has not set one, as /privasi
  // reads it (review of PR #29); E.164.
  whatsappNumber: string;
  // From site_settings; NULL while the value is missing or still the seeded sample (left out, §6.9).
  email: string | null;
  address: string | null;
  // "Rute di Google Maps": to the office address, or to the map's centre; NULL when neither is known.
  routeUrl: string | null;
  units: readonly RwUnitSummary[];
}

function ContactRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary-ink">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-caption text-muted-foreground">{label}</p>
        <div className="text-body font-medium">{children}</div>
      </div>
    </li>
  );
}

// The kelurahan's WhatsApp number, with the greeting of the floating button.
function WhatsAppRow({ number }: { number: string }) {
  const chatUrl = buildWhatsAppChatUrl(number, copy.layout.whatsAppGreeting(siteConfig.name));
  return (
    <ContactRow
      icon={<MessageCircle aria-hidden className="size-5" />}
      label={mapCopy.contactWhatsApp}
    >
      <a
        href={chatUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center tabular-nums underline-offset-4 hover:underline md:min-h-0"
      >
        {formatPhone(number)}
      </a>
    </ContactRow>
  );
}

function ContactDetails({
  whatsappNumber,
  email,
  address,
  routeUrl,
}: Omit<ContactBlockProps, 'units'>) {
  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-5 shadow-card md:p-6">
      <ul className="space-y-4">
        <WhatsAppRow number={whatsappNumber} />
        {email ? (
          <ContactRow icon={<Mail aria-hidden className="size-5" />} label={mapCopy.contactEmail}>
            <a
              href={`mailto:${email}`}
              className="inline-flex min-h-11 items-center break-all underline-offset-4 hover:underline md:min-h-0"
            >
              {email}
            </a>
          </ContactRow>
        ) : null}
        {address ? (
          <ContactRow
            icon={<MapPin aria-hidden className="size-5" />}
            label={mapCopy.contactAddress}
          >
            <p className="text-pretty">{address}</p>
          </ContactRow>
        ) : null}
      </ul>
      {routeUrl ? (
        <Button asChild>
          <a href={routeUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden />
            {mapCopy.routeToOffice}
          </a>
        </Button>
      ) : null}
    </div>
  );
}

function RwLinks({ units }: Pick<ContactBlockProps, 'units'>) {
  return (
    <div className="space-y-4">
      <h3 className="text-h4">{mapCopy.allRws}</h3>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {units.map((unit) => (
          <li key={unit.id}>
            <Link
              href={unit.path}
              className="flex min-h-14 items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-muted/40"
            >
              <span className="space-y-0.5">
                <RwEyebrow rw={unit} />
                <span className="block text-body font-medium">{unit.shortName}</span>
              </span>
              <ArrowRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// docs/PRD.md FR-PUB-18: how to reach the kelurahan, from site_settings and the public WhatsApp number, with
// the way to each kampung's page beside it.
export function ContactBlock({ units, ...details }: ContactBlockProps) {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <ContactDetails {...details} />
      {units.length > 0 ? <RwLinks units={units} /> : null}
    </div>
  );
}
