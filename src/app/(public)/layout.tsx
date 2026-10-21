import type { ReactNode } from 'react';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { WhatsAppFab } from '@/components/layout/whatsapp-fab';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { publicNavFor } from '@/config/nav';
import { copy } from '@/lib/copy/id';
import { listRwUnits } from '@/lib/queries/rw-units';
import { getPublicSiteSettings } from '@/lib/queries/settings';

const MAIN_CONTENT_ID = 'konten';

// Each page renders its own BreadcrumbList through PageHeader: a layout is shared by many pages and
// cannot know the current page's name without reading the request, which would end ISR.
export default async function PublicLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [settings, rwUnits] = await Promise.all([getPublicSiteSettings(), listRwUnits()]);
  const nav = publicNavFor(rwUnits);
  return (
    <ThemeProvider scope="public">
      <div className="flex min-h-dvh flex-col">
        <a
          href={`#${MAIN_CONTENT_ID}`}
          className="sr-only rounded-xl bg-background px-4 py-3 text-body-sm font-medium shadow-modal focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
        >
          {copy.layout.skipToContent}
        </a>
        <SiteHeader nav={nav} />
        <main id={MAIN_CONTENT_ID} className="flex-1">
          {children}
        </main>
        <SiteFooter
          contact={{ email: settings.contactEmail, address: settings.kelurahanAddress }}
          navGroups={nav.groups}
          rwCount={rwUnits.length}
        />
        <WhatsAppFab />
      </div>
    </ThemeProvider>
  );
}
