import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Container } from '@/components/layout/container';
import { SiteWordmark } from '@/components/layout/site-wordmark';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { HOME_NAV_ITEM } from '@/config/nav';
import { requestNonce } from '@/lib/request-nonce';

// Booking and reservation pages hold a visitor's own booking, so none is cached or indexed (CLAUDE.md §5.1);
// next.config.ts adds `private, no-store`, noindex and no-referrer headers for these routes as well. Each page sets
// its own width: a short form a narrow card, the booking wizard the wider column it needs (docs/StyleGuide.md §4.1).
// The wizard's stepper sits in the wizard, since a layout is not told the step in the address.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function BookingLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ThemeProvider scope="public" nonce={await requestNonce()}>
      <div className="flex min-h-dvh flex-col bg-linear-to-b from-brand-ice to-background dark:from-secondary">
        <Container className="py-6">
          {/* Named by the wordmark itself: a label that differs from the visible text fails WCAG 2.5.3. */}
          <Link href={HOME_NAV_ITEM.href} className="inline-flex rounded-lg">
            <SiteWordmark />
          </Link>
        </Container>
        <main className="flex flex-1 flex-col items-center px-4 pt-2 pb-16">{children}</main>
      </div>
    </ThemeProvider>
  );
}
