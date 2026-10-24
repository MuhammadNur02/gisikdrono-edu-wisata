import type { ReactNode } from 'react';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { publicNavFor } from '@/config/nav';
import { copy } from '@/lib/copy/id';
import { listRwUnits } from '@/lib/queries/rw-units';
import { getPublicSiteSettings } from '@/lib/queries/settings';

const MAIN_CONTENT_ID = 'konten';

// DESIGN-SPEC §3.11–§3.13: the reservation pages keep the site's solid header and footer, so a visitor who paid can
// find their way back to the site. They are task pages, so no WhatsApp button floats over them (§2.2); each page sets
// its own column width inside the centred main.
export default async function BookingSiteLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [settings, rwUnits] = await Promise.all([getPublicSiteSettings(), listRwUnits()]);
  const nav = publicNavFor(rwUnits);
  return (
    <>
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only rounded-xl bg-background px-4 py-3 text-body-sm font-medium shadow-modal focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        {copy.layout.skipToContent}
      </a>
      <SiteHeader nav={nav} />
      <main
        id={MAIN_CONTENT_ID}
        className="flex flex-1 flex-col items-center px-5 pt-10 pb-16 md:pt-14 md:pb-28"
      >
        {children}
      </main>
      <SiteFooter
        contact={{ email: settings.contactEmail, address: settings.kelurahanAddress }}
        navGroups={nav.groups}
      />
    </>
  );
}
