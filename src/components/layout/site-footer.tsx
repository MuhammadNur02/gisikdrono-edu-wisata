import { Mail, MapPin, MessageCircle, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { NavLinkLabel } from '@/components/layout/nav-link-label';
import { SiteWordmark } from '@/components/layout/site-wordmark';
import { WaveDivider } from '@/components/layout/wave-divider';
import { LEGAL_NAV_ITEMS, type PublicNavGroup, type PublicNavItem } from '@/config/nav';
import { siteConfig } from '@/config/site';
import { copy } from '@/lib/copy/id';
import { formatPhone } from '@/lib/utils/phone';
import { buildWhatsAppChatUrl } from '@/lib/utils/whatsapp';

const linkClassName =
  'inline-flex min-h-11 items-center rounded-md text-body-sm text-muted-foreground transition-colors hover:text-foreground md:min-h-0 md:py-1';

function FooterLink({ item }: { item: PublicNavItem }) {
  return (
    <Link href={item.href} className={linkClassName}>
      <NavLinkLabel item={item} />
    </Link>
  );
}

function FooterIntro() {
  const { district, city } = siteConfig.locality;
  return (
    <div className="space-y-4 xl:col-span-4">
      <SiteWordmark />
      <p className="max-w-sm text-body-sm text-muted-foreground">{copy.layout.footerAbout}</p>
      <p className="text-body-sm">
        {copy.layout.footerManagedBy} <span className="font-medium">{siteConfig.ownerName}</span>,{' '}
        {district}, {city}.
      </p>
    </div>
  );
}

function FooterNav({ groups }: { groups: readonly PublicNavGroup[] }) {
  return (
    <nav
      aria-label={copy.layout.footerNav}
      className="grid gap-8 sm:grid-cols-3 md:col-span-2 xl:col-span-6"
    >
      {groups.map((group) => (
        <div key={group.title} className="space-y-3">
          <h2 className="text-overline text-foreground">{group.title}</h2>
          <ul className="space-y-1">
            {group.items.map((item) => (
              <li key={item.href}>
                <FooterLink item={item} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

const contactLinkClassName =
  'flex min-h-11 gap-2 rounded-md text-body-sm text-muted-foreground transition-colors hover:text-foreground';

function FooterWhatsApp() {
  const chatUrl = buildWhatsAppChatUrl(
    siteConfig.whatsappContactNumber,
    copy.layout.whatsAppGreeting(siteConfig.name),
  );
  return (
    <a href={chatUrl} target="_blank" rel="noopener noreferrer" className={contactLinkClassName}>
      <MessageCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>
        <span className="block">{copy.layout.footerWhatsApp}</span>
        <span className="block font-medium whitespace-nowrap text-foreground tabular-nums">
          {formatPhone(siteConfig.whatsappContactNumber)}
        </span>
      </span>
    </a>
  );
}

function FooterEmail({ email }: { email: string }) {
  return (
    <a href={`mailto:${email}`} className={contactLinkClassName}>
      <Mail aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">
        <span className="block">{copy.layout.footerEmail}</span>
        <span className="block font-medium break-all text-foreground">{email}</span>
      </span>
    </a>
  );
}

export interface FooterContactDetails {
  // From site_settings; NULL while the value is missing or still the seeded sample.
  email: string | null;
  address: string | null;
}

// A contact detail the kelurahan has not given yet is left out, not announced (docs/StyleGuide.md §6.9).
// Office hours have no site_settings key, so they are not shown at all.
function FooterContact({ contact }: { contact: FooterContactDetails }) {
  return (
    <div className="space-y-3 xl:order-last xl:col-span-2">
      <h2 className="text-overline text-foreground">{copy.layout.footerContactTitle}</h2>
      <FooterWhatsApp />
      {contact.email ? <FooterEmail email={contact.email} /> : null}
      {contact.address ? (
        <p className="flex gap-2 text-body-sm text-muted-foreground">
          <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
          {contact.address}
        </p>
      ) : null}
    </div>
  );
}

// pb-24 leaves 96 px under the last line, more than the WhatsApp button's 56 px plus its 24 px offset,
// so at the end of the page the button floats over empty space (docs/StyleGuide.md §5.16).
function FooterBottom() {
  return (
    <div className="border-t border-border">
      <Container className="flex flex-col gap-4 pt-6 pb-24 md:flex-row md:items-center md:justify-between">
        <p className="flex max-w-2xl gap-2 text-caption text-muted-foreground">
          <ShieldCheck aria-hidden className="size-4 shrink-0 text-success" />
          {copy.layout.paymentTrust}
        </p>
        <ul className="flex flex-wrap gap-x-6">
          {LEGAL_NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <FooterLink item={item} />
            </li>
          ))}
        </ul>
      </Container>
    </div>
  );
}

export interface SiteFooterProps {
  contact: FooterContactDetails;
  navGroups: readonly PublicNavGroup[];
}

// The footer of every public page sits on the warm tone under a gentle wave (decision of 2026-10-23). The wave
// needs a band above the footer it can stand in, whatever the page's last section is, so the top margin matches
// its height and the wave never covers that section's content.
export function SiteFooter({ contact, navGroups }: SiteFooterProps) {
  return (
    <footer className="relative mt-6 bg-surface-warm text-surface-warm-foreground md:mt-10 lg:mt-16">
      <WaveDivider tone="warm" />
      {/* Below xl the contact block sits beside the intro and the links take a full row; from xl all three
          share one row, links in the middle. */}
      <Container className="grid gap-10 py-12 md:grid-cols-2 md:py-16 xl:grid-cols-12 xl:gap-x-8">
        <FooterIntro />
        <FooterContact contact={contact} />
        <FooterNav groups={navGroups} />
      </Container>
      <FooterBottom />
    </footer>
  );
}
