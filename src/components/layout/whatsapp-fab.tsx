'use client';

import { MessageCircle } from 'lucide-react';
import { m, useReducedMotion } from 'motion/react';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type MouseEvent } from 'react';

import { siteConfig } from '@/config/site';
import { copy } from '@/lib/copy/id';
import { scaleIn } from '@/lib/motion/variants';
import {
  buildWhatsAppChatUrl,
  isWhatsAppFabHidden,
  pageTopicFromTitle,
} from '@/lib/utils/whatsapp';

// docs/StyleGuide.md §5.16: the button joins the page after one second, or at once with reduced motion.
const ENTRANCE_DELAY_MS = 1000;

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

export function WhatsAppFab() {
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion() === true;
  const [isDelayOver, setIsDelayOver] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsDelayOver(true);
    }, ENTRANCE_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  if (isWhatsAppFabHidden(pathname)) return null;
  if (!isDelayOver && !prefersReducedMotion) return null;
  return (
    <m.a
      href={chatUrlFor(siteConfig.name)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={copy.layout.whatsAppFab}
      onClick={nameCurrentPage}
      variants={scaleIn}
      initial={prefersReducedMotion ? false : 'hidden'}
      animate="visible"
      className="fixed right-6 bottom-6 z-40 inline-flex size-14 items-center justify-center rounded-full bg-success text-success-foreground shadow-card-hover transition-shadow hover:shadow-modal"
    >
      <MessageCircle aria-hidden className="size-6" />
    </m.a>
  );
}
