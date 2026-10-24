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

// The sign-in pages are light like the public site (decision D3): the dashboard's theme starts after AAL2.
export default async function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ThemeProvider scope="public" nonce={await requestNonce()}>
      <div className="flex min-h-dvh flex-col bg-linear-to-b from-brand-ice to-background">
        <Container className="py-6">
          {/* Named by the wordmark itself: a label that differs from the visible text fails WCAG 2.5.3. */}
          <Link href={HOME_NAV_ITEM.href} className="inline-flex rounded-lg">
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
