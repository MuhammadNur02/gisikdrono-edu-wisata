import { Mail, MapPin, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { NavLinkLabel } from '@/components/layout/nav-link-label';
import { SiteWordmark } from '@/components/layout/site-wordmark';
import { WaveDivider } from '@/components/layout/wave-divider';
import { LEGAL_NAV_ITEMS, type PublicNavGroup, type PublicNavItem } from '@/config/nav';
import { siteConfig } from '@/config/site';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';

const LINK_CLASS =
  'inline-flex min-h-11 items-center text-body-md text-on-dark-2 transition-colors duration-200 hover:text-white md:min-h-0';

// An RW link reads `RW 05 · Ecowastreme`: the number and the programme on one line (DESIGN-SPEC §2.8).
function linkLabel(item: PublicNavItem): string {
  return item.rw ? `${item.rw.label} · ${item.rw.shortName}` : item.label;
}

// The office's place when site_settings has no written address yet (`kelurahan.address` still the sample).
function fallbackAddress(): string {
  const { district, city, province } = siteConfig.locality;
  return `${siteConfig.ownerName}, ${district}, ${city}, ${province}`;
}

function FooterBrand({ contact }: { contact: FooterContactDetails }) {
  return (
    <div className="space-y-5 lg:col-span-5 lg:max-w-95">
      <SiteWordmark tone="light" />
      <p className="text-body-md text-on-dark-2">{copy.layout.footerAbout}</p>
      <p className="flex gap-2.5 text-body-sm text-on-dark-3">
        <MapPin aria-hidden className="mt-0.5 size-4.5 shrink-0 text-gold" />
        {contact.address ?? fallbackAddress()}
      </p>
      {contact.email ? (
        <a
          href={`mailto:${contact.email}`}
          className="flex gap-2.5 text-body-sm break-all text-on-dark-2 hover:text-white"
        >
          <Mail aria-hidden className="mt-0.5 size-4.5 shrink-0 text-gold" />
          <span>
            <span className="sr-only">{copy.layout.footerEmail}: </span>
            {contact.email}
          </span>
        </a>
      ) : null}
    </div>
  );
}

// EDU WISATA takes the whole row on a phone; KUNJUNGAN and INFORMASI then share the next one.
function FooterNav({ groups }: { groups: readonly PublicNavGroup[] }) {
  return (
    <nav
      aria-label={copy.layout.footerNav}
      className="grid grid-cols-2 gap-x-6 gap-y-9 sm:flex sm:flex-wrap sm:gap-x-12 lg:col-span-7 lg:justify-end lg:gap-x-16"
    >
      {groups.map((group, index) => (
        <div
          key={group.title}
          className={cn('space-y-3', index === 0 && 'col-span-2 sm:col-span-1')}
        >
          <h2 className="text-meta-caps text-gold">{group.title}</h2>
          <ul className="md:space-y-3.5">
            {group.items.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={LINK_CLASS}>
                  <NavLinkLabel item={item} label={linkLabel(item)} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function PaymentNote() {
  return (
    <p className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-5 py-4.5 text-body-sm text-on-dark-2">
      <ShieldCheck aria-hidden className="size-5 shrink-0 text-rw05-hi" />
      {copy.layout.paymentTrust}
    </p>
  );
}

// pb-24 on a phone leaves room under the last line for the 56 px WhatsApp button and its 16 px offset (§5.16).
function FooterBottom() {
  const year = new Date().getFullYear();
  return (
    <div className="flex flex-col gap-3 border-t border-white/10 pt-6 pb-24 text-caption text-on-dark-3 md:flex-row md:items-center md:justify-between md:pb-0">
      <p>
        <span className="md:hidden">{copy.layout.footerRightsShort(year)}</span>
        <span className="max-md:hidden">{copy.layout.footerRights(year)}</span>
      </p>
      <div className="flex items-center gap-6">
        {LEGAL_NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="inline-flex min-h-11 items-center text-on-dark-2 underline underline-offset-4 hover:text-white md:min-h-0"
          >
            {item.label}
          </Link>
        ))}
        <span className="max-md:hidden">{copy.layout.paymentMethods}</span>
      </div>
    </div>
  );
}

export interface FooterContactDetails {
  // From site_settings; NULL while the value is missing or still the seeded sample.
  email: string | null;
  address: string | null;
}

export interface SiteFooterProps {
  contact: FooterContactDetails;
  navGroups: readonly PublicNavGroup[];
}

// docs/StyleGuide.md §5.17 (DESIGN-SPEC §2.8): the night band with the kawung at 6 %, under a wave that steps down into
// it from whatever the page ends with; the top margin is the wave's own band, so it never covers that section. The
// WhatsApp number is never printed (the button opens the chat); an email shows once the kelurahan has given one.
export function SiteFooter({ contact, navGroups }: SiteFooterProps) {
  return (
    <footer className="kawung relative mt-6 bg-night text-on-dark-2 ring-on-dark kawung-6 md:mt-10 lg:mt-14">
      <WaveDivider tone="night" />
      <Container className="space-y-9 pt-14 pb-8 md:space-y-12 md:pt-22 md:pb-10">
        <div className="grid gap-9 lg:grid-cols-12 lg:gap-16">
          <FooterBrand contact={contact} />
          <FooterNav groups={navGroups} />
        </div>
        <PaymentNote />
        <FooterBottom />
      </Container>
    </footer>
  );
}
