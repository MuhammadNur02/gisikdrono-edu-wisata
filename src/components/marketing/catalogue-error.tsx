'use client';

import { CloudOff, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { Container } from '@/components/layout/container';
import { WhatsAppIcon } from '@/components/layout/whatsapp-icon';
import { CatalogueState } from '@/components/marketing/catalogue-state';
import { Button } from '@/components/ui/button';
import { siteConfig } from '@/config/site';
import { catalogueStateCopy as text } from '@/lib/copy/catalogue-ui';
import { buildWhatsAppChatUrl } from '@/lib/utils/whatsapp';

export interface CatalogueErrorProps {
  // The page's own title, kept in its place above the state (DESIGN-SPEC §3.14 keeps the page head).
  title: string;
  // `Paket`, `Produk`, `Artikel`, `Foto`: the first word of `Paket belum bisa dimuat`.
  noun: string;
  // The error boundary's reset, which renders the segment again.
  reset: () => void;
}

// The error state of a catalogue list (DESIGN-SPEC §3.14): the danger emblem with CloudOff, no shake, `Coba lagi` with a
// spinner while the page is fetched again, and WhatsApp to tell the kelurahan. The error itself is never shown.
export function CatalogueError({ title, noun, reset }: CatalogueErrorProps) {
  const router = useRouter();
  const [isRetrying, startRetry] = useTransition();
  const retry = () => {
    startRetry(() => {
      router.refresh();
      reset();
    });
  };
  const chatUrl = buildWhatsAppChatUrl(
    siteConfig.whatsappContactNumber,
    text.whatsAppGreeting(title),
  );
  return (
    <Container className="pt-8 pb-16 md:pt-18">
      <h1 className="text-display text-balance">{title}</h1>
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
  );
}
