'use client';

import { ChevronRight, CloudOff, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { Container } from '@/components/layout/container';
import { WhatsAppIcon } from '@/components/layout/whatsapp-icon';
import { FilterBarSkeleton } from '@/components/marketing/catalogue-skeletons';
import { CatalogueState } from '@/components/marketing/catalogue-state';
import { Button } from '@/components/ui/button';
import { HOME_NAV_ITEM } from '@/config/public-nav';
import { siteConfig } from '@/config/site';
import { catalogueStateCopy as text } from '@/lib/copy/catalogue-ui';
import { layoutCopy } from '@/lib/copy/ui';
import { buildWhatsAppChatUrl } from '@/lib/utils/whatsapp';

export interface CatalogueErrorProps {
  // The page's own title and its name in the trail, kept in their place above the state (DESIGN-SPEC §3.14).
  title: string;
  crumb: string;
  // `Paket`, `Produk`, `Artikel`: the first word of `Paket belum bisa dimuat`.
  noun: string;
  // The error boundary's reset, which renders the segment again.
  reset: () => void;
}

// The page head as the list draws it: `Beranda › Paket wisata` and the display title.
function ErrorHead({ title, crumb }: Pick<CatalogueErrorProps, 'title' | 'crumb'>) {
  return (
    <Container className="space-y-5 pt-8 pb-8 md:space-y-6 md:pt-18 md:pb-12">
      <nav aria-label={layoutCopy.breadcrumb}>
        <ol className="flex flex-wrap items-center gap-1 text-body-sm text-muted-foreground">
          <li className="flex items-center gap-1">
            <Link
              href={HOME_NAV_ITEM.href}
              className="rounded-md underline-offset-4 hover:text-foreground hover:underline"
            >
              {HOME_NAV_ITEM.label}
            </Link>
            <ChevronRight aria-hidden className="size-4" />
          </li>
          <li aria-current="page" className="font-medium text-foreground">
            {crumb}
          </li>
        </ol>
      </nav>
      <h1 className="text-display text-balance">{title}</h1>
    </Container>
  );
}

function useRetry(reset: () => void): [boolean, () => void] {
  const router = useRouter();
  const [isRetrying, startRetry] = useTransition();
  return [
    isRetrying,
    () => {
      startRetry(() => {
        router.refresh();
        reset();
      });
    },
  ];
}

// The error state of a catalogue list (DESIGN-SPEC §3.14): the page head and the filter bar stay, then the danger
// emblem with CloudOff, no shake, `Coba lagi` with a spinner while the page is fetched again, and WhatsApp to tell the
// kelurahan. The error itself is never shown. The bar's chips come with the data, so it shows their shapes only.
export function CatalogueError({ title, crumb, noun, reset }: CatalogueErrorProps) {
  const [isRetrying, retry] = useRetry(reset);
  const chatUrl = buildWhatsAppChatUrl(
    siteConfig.whatsappContactNumber,
    text.whatsAppGreeting(crumb),
  );
  return (
    <>
      <ErrorHead title={title} crumb={crumb} />
      <FilterBarSkeleton isStill />
      <Container className="pb-16">
        <CatalogueState
          role="alert"
          icon={CloudOff}
          tone="danger"
          title={text.errorTitle(noun)}
          description={text.errorDescription}
          actions={
            <>
              <Button variant="secondary" size="lg" loading={isRetrying} onClick={retry}>
                <RefreshCw aria-hidden />
                {text.retry}
              </Button>
              <Button asChild variant="ghost" size="lg">
                <a href={chatUrl} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon className="size-4.5" />
                  {text.reportOnWhatsApp}
                </a>
              </Button>
            </>
          }
        />
      </Container>
    </>
  );
}
