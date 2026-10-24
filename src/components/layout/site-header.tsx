import { Ticket } from 'lucide-react';
import Link from 'next/link';

import { HEADER_ID, HEADER_SENTINEL_ID } from '@/components/layout/header-ids';
import { HeaderNav } from '@/components/layout/header-nav';
import { HeaderScrollObserver } from '@/components/layout/header-scroll-observer';
import { MobileMenu } from '@/components/layout/mobile-menu';
import { SiteWordmark } from '@/components/layout/site-wordmark';
import { Button } from '@/components/ui/button';
import { BOOKING_CTA, HOME_NAV_ITEM, LOOKUP_NAV_ITEM, type PublicNav } from '@/config/nav';

// Without script nothing marks the header scrolled, so over a hero photo it would stay white on the paper below; this
// keeps it solid instead. A style element needs no nonce under the public CSP (style-src 'unsafe-inline').
const NO_SCRIPT_SOLID_HEADER = `.site-header{position:sticky!important;--header-fg:var(--foreground);--header-fg-2:var(--ink-2);--header-fg-3:var(--muted-foreground);--header-line:var(--border-strong);height:var(--header-h)!important;background:var(--background)!important;border-color:var(--border)!important}`;

function LookupPill() {
  return (
    <Link
      href={LOOKUP_NAV_ITEM.href}
      className="hidden h-11 items-center gap-2 rounded-full border border-header-line px-4 text-body-sm font-medium text-header-fg transition-colors duration-200 hover:bg-header-fg/10 xl:inline-flex"
    >
      <Ticket aria-hidden className="size-4.5" />
      {LOOKUP_NAV_ITEM.label}
    </Link>
  );
}

// docs/StyleGuide.md §10.2 (DESIGN-SPEC §2.7): wordmark, five links from lg, the reservation lookup from xl and the
// booking button. Solid and sticky on every page; over a hero photo that carries [data-header-overlay] it is fixed,
// transparent and white until 24 px of scroll (.site-header in globals.css, HeaderScrollObserver). Below lg the
// links live in MobileMenu, beside a short `Pesan`.
export function SiteHeader({ nav }: { nav: PublicNav }) {
  return (
    <>
      <div
        id={HEADER_SENTINEL_ID}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-6"
      />
      <noscript>
        <style>{NO_SCRIPT_SOLID_HEADER}</style>
      </noscript>
      <header id={HEADER_ID} className="site-header">
        <div className="mx-auto flex h-full max-w-360 items-center gap-6 px-5 lg:px-14">
          {/* Named by the wordmark itself: a label that differs from the visible text fails WCAG 2.5.3. */}
          <Link href={HOME_NAV_ITEM.href} className="shrink-0 rounded-md">
            <SiteWordmark tone="header" />
          </Link>
          <HeaderNav items={nav.headerItems} className="mx-auto hidden lg:block" />
          <div className="ml-auto flex items-center gap-3 lg:ml-0">
            <LookupPill />
            <Button asChild size="sm" className="lg:hidden">
              <Link href={BOOKING_CTA.href}>{BOOKING_CTA.shortLabel}</Link>
            </Button>
            <Button asChild className="max-lg:hidden">
              <Link href={BOOKING_CTA.href}>{BOOKING_CTA.label}</Link>
            </Button>
            <MobileMenu groups={nav.groups} className="lg:hidden" />
          </div>
        </div>
      </header>
      <HeaderScrollObserver />
    </>
  );
}
