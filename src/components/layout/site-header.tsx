import { CalendarCheck } from 'lucide-react';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { HeaderNav } from '@/components/layout/header-nav';
import { MobileMenu } from '@/components/layout/mobile-menu';
import { SiteWordmark } from '@/components/layout/site-wordmark';
import { Button } from '@/components/ui/button';
import { BOOKING_CTA, HOME_NAV_ITEM, type PublicNav } from '@/config/nav';
import { copy } from '@/lib/copy/id';

// docs/StyleGuide.md §4.3, §10.2: sticky with the blurred bar; below xl the links live in MobileMenu.
// The booking button is `secondary` because a page's own primary action must stay the only one (§1.3 G9).
export function SiteHeader({ nav }: { nav: PublicNav }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <Container className="flex h-16 items-center gap-6">
        <Link
          href={HOME_NAV_ITEM.href}
          aria-label={copy.layout.homeLink}
          className="shrink-0 rounded-lg"
        >
          <SiteWordmark />
        </Link>
        <HeaderNav items={nav.headerItems} className="hidden xl:block" />
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="secondary" size="sm" className="max-md:min-h-11">
            <Link href={BOOKING_CTA.href}>
              <CalendarCheck aria-hidden />
              <span className="md:hidden">{BOOKING_CTA.shortLabel}</span>
              <span className="max-md:hidden">{BOOKING_CTA.label}</span>
            </Link>
          </Button>
          <MobileMenu groups={nav.groups} className="xl:hidden" />
        </div>
      </Container>
    </header>
  );
}
