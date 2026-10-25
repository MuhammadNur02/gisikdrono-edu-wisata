import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Container } from '@/components/layout/container';
import { SiteWordmark } from '@/components/layout/site-wordmark';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { HOME_NAV_ITEM } from '@/config/nav';
import { requestNonce } from '@/lib/request-nonce';

// Every sign-in page reads the session, so none is cached; next.config.ts adds `private, no-store` and noindex
// headers for these routes as well (CLAUDE.md §5.1).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

// The sign-in pages are light like the public site (decision D3): the dashboard's theme starts after AAL2. Paper, the
// wordmark over a hairline and the card on a faint ink kawung (DESIGN-SPEC §1.8), with no screen of their own.
export default async function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ThemeProvider scope="public" nonce={await requestNonce()}>
      <div className="flex min-h-dvh flex-col bg-background">
        <header className="border-b border-border">
          <Container className="flex h-16 items-center md:h-18">
            {/* Named by the wordmark itself: a label that differs from the visible text fails WCAG 2.5.3. */}
            <Link href={HOME_NAV_ITEM.href} className="inline-flex rounded-md">
              <SiteWordmark />
            </Link>
          </Container>
        </header>
        <main className="kawung flex flex-1 justify-center px-4 pt-8 pb-16 kawung-6 kawung-ink sm:items-center sm:py-16">
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
    </ThemeProvider>
  );
}
