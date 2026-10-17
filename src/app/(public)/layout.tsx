import type { ReactNode } from 'react';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { WhatsAppFab } from '@/components/layout/whatsapp-fab';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { copy } from '@/lib/copy/id';

const MAIN_CONTENT_ID = 'konten';

// Each page renders its own BreadcrumbList through PageHeader: a layout is shared by many pages and
// cannot know the current page's name without reading the request, which would end ISR.
export default function PublicLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ThemeProvider scope="public">
      <div className="flex min-h-dvh flex-col">
        <a
          href={`#${MAIN_CONTENT_ID}`}
          className="sr-only rounded-xl bg-background px-4 py-3 text-body-sm font-medium shadow-modal focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
        >
          {copy.layout.skipToContent}
        </a>
        <SiteHeader />
        <main id={MAIN_CONTENT_ID} className="flex-1">
          {children}
        </main>
        <SiteFooter />
        <WhatsAppFab />
      </div>
    </ThemeProvider>
  );
}
