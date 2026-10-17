import { MapPin, MessageCircle, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { NavLinkLabel } from '@/components/layout/nav-link-label';
import { SiteWordmark } from '@/components/layout/site-wordmark';
import { LEGAL_NAV_ITEMS, SITE_NAV_GROUPS, type PublicNavItem } from '@/config/nav';
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

function FooterNav() {
  return (
    <nav
      aria-label={copy.layout.footerNav}
      className="grid gap-8 sm:grid-cols-3 md:col-span-2 xl:col-span-6"
    >
      {SITE_NAV_GROUPS.map((group) => (
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

// The street address, email and office hours are site_settings values the public queries of
// Task P2.3.02 will read; until then the footer says they are on their way instead of guessing.
function FooterContact() {
  const chatUrl = buildWhatsAppChatUrl(
    siteConfig.whatsappContactNumber,
    copy.layout.whatsAppGreeting(siteConfig.name),
  );
  return (
    <div className="space-y-3 xl:order-last xl:col-span-2">
      <h2 className="text-overline text-foreground">{copy.layout.footerContactTitle}</h2>
      <a
        href={chatUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-11 gap-2 rounded-md text-body-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <MessageCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          <span className="block">{copy.layout.footerWhatsApp}</span>
          <span className="block font-medium whitespace-nowrap text-foreground tabular-nums">
            {formatPhone(siteConfig.whatsappContactNumber)}
          </span>
        </span>
      </a>
      <p className="flex gap-2 text-body-sm text-muted-foreground">
        <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
        {copy.layout.footerAddressPending}
      </p>
    </div>
  );
}

function FooterBottom() {
  return (
    <div className="border-t border-border">
      <Container className="flex flex-col gap-4 py-6 md:flex-row md:items-center md:justify-between">
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

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-muted/40">
      {/* Below xl the contact block sits beside the intro and the links take a full row; from xl all three
          share one row, links in the middle. */}
      <Container className="grid gap-10 py-12 md:grid-cols-2 md:py-16 xl:grid-cols-12 xl:gap-x-8">
        <FooterIntro />
        <FooterContact />
        <FooterNav />
      </Container>
      <FooterBottom />
    </footer>
  );
}
