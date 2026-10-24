import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { ThemeProvider } from '@/components/providers/theme-provider';
import { requestNonce } from '@/lib/request-nonce';

// Booking and reservation pages hold a visitor's own booking, so none is cached or indexed (CLAUDE.md §5.1);
// next.config.ts adds `private, no-store`, noindex and no-referrer headers for these routes as well. The chrome
// differs by page (DESIGN-SPEC §2.7): the wizard has its own calm header with no site navigation, and the pages under
// (site) carry the site's header and footer, so this layout gives only the theme and the paper.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function BookingLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ThemeProvider scope="public" nonce={await requestNonce()}>
      <div className="flex min-h-dvh flex-col bg-background">{children}</div>
    </ThemeProvider>
  );
}
