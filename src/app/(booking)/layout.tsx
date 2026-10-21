import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Container } from '@/components/layout/container';
import { SiteWordmark } from '@/components/layout/site-wordmark';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { HOME_NAV_ITEM } from '@/config/nav';
import { copy } from '@/lib/copy/id';
import { requestNonce } from '@/lib/request-nonce';

// Booking and reservation pages hold a visitor's own booking, so none is cached or indexed (CLAUDE.md §5.1);
// next.config.ts adds `private, no-store`, noindex and no-referrer headers for these routes as well. The wizard's
// stepper joins this slim header in P3.5.01.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function BookingLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ThemeProvider scope="public" nonce={await requestNonce()}>
      <div className="flex min-h-dvh flex-col bg-linear-to-b from-brand-ice to-background dark:from-secondary">
        <Container className="py-6">
          <Link
            href={HOME_NAV_ITEM.href}
            aria-label={copy.layout.homeLink}
            className="inline-flex rounded-lg"
          >
            <SiteWordmark />
          </Link>
        </Container>
        <main className="flex flex-1 justify-center px-4 pt-2 pb-16 sm:items-center sm:pt-0">
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
    </ThemeProvider>
  );
}
