'use client';

import { usePathname } from 'next/navigation';
import type { MouseEvent } from 'react';

import { WhatsAppIcon } from '@/components/layout/whatsapp-icon';
import { siteConfig } from '@/config/site';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import {
  buildWhatsAppChatUrl,
  hasStickyMobileCta,
  isWhatsAppFabHidden,
  pageTopicFromTitle,
} from '@/lib/utils/whatsapp';

function chatUrlFor(pageTopic: string): string {
  return buildWhatsAppChatUrl(
    siteConfig.whatsappContactNumber,
    copy.layout.whatsAppGreeting(pageTopic),
  );
}

// The greeting names the page the visitor is on. The title is read at click time because after a client
// navigation it changes without this component rendering again.
function nameCurrentPage(event: MouseEvent<HTMLAnchorElement>) {
  event.currentTarget.href = chatUrlFor(pageTopicFromTitle(document.title, siteConfig.name));
}

// docs/StyleGuide.md §5.16 (DESIGN-SPEC §2.2): a 52 px pill with the glyph and `Chat WhatsApp` from md, a 56 px circle
// on phones (the label then only for screen readers), in the darkened WhatsApp green (5.42:1 with white). It joins
// the page 1.5 s after load on the soft spring (enter-late, CSS only; at once with reduced motion) and lifts 2 px
// while pointed at. The wizard and the reservation pages are task pages and go without it.
export function WhatsAppFab() {
  const pathname = usePathname();
  if (isWhatsAppFabHidden(pathname)) return null;
  return (
    <a
      href={chatUrlFor(siteConfig.name)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={copy.layout.whatsAppFab}
      onClick={nameCurrentPage}
      className={cn(
        'fixed right-4 fab-offset z-40 inline-flex size-14 press-scale enter-late items-center justify-center gap-2.5 rounded-full bg-whatsapp text-whatsapp-foreground shadow-fab hover:bg-whatsapp-hover motion-safe:hover:-translate-y-0.5 md:right-6 md:bottom-6 md:h-13 md:w-auto md:pr-5 md:pl-4',
        hasStickyMobileCta(pathname) && 'max-md:fab-offset-bar',
      )}
    >
      <WhatsAppIcon className="size-7 md:size-6" />
      <span className="text-label max-md:sr-only">{copy.layout.whatsAppChat}</span>
    </a>
  );
}
