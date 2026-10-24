import { ArrowLeft, X } from 'lucide-react';
import Link from 'next/link';

import { SiteWordmark } from '@/components/layout/site-wordmark';
import { WhatsAppIcon } from '@/components/layout/whatsapp-icon';
import { HOME_NAV_ITEM } from '@/config/nav';
import { siteConfig } from '@/config/site';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import { packagePath } from '@/lib/utils/paths';
import { buildWhatsAppChatUrl } from '@/lib/utils/whatsapp';

const text = copy.booking.wizard.header;

const ROUND_ICON_LINK =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors duration-200 hover:bg-muted';

// "Butuh bantuan?" as a pill from md, the WhatsApp glyph alone on a phone.
function HelpLinks({ chatUrl }: { chatUrl: string }) {
  return (
    <>
      <a
        href={chatUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-border-strong px-4 text-label-sm font-medium text-foreground transition-colors duration-200 hover:bg-muted max-md:hidden"
      >
        <WhatsAppIcon className="size-4.5 text-whatsapp" />
        {text.help}
      </a>
      <a
        href={chatUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={text.helpLabel}
        className={cn(ROUND_ICON_LINK, 'text-whatsapp md:hidden')}
      >
        <WhatsAppIcon className="size-6" />
      </a>
    </>
  );
}

export interface WizardHeaderProps {
  packageName: string;
  packageSlug: string;
}

// DESIGN-SPEC §2.7 "Wizard header": the booking flow keeps the visitor on the task, so it has no site navigation. From
// md: the wordmark, the title in the middle, "Butuh bantuan?" on WhatsApp and a round close back to the package. On a
// phone: a back arrow, the short title and the WhatsApp glyph. The title is the page's h1; each step names itself in
// an h2 below.
export function WizardHeader({ packageName, packageSlug }: WizardHeaderProps) {
  const exitHref = packagePath(packageSlug);
  const chatUrl = buildWhatsAppChatUrl(
    siteConfig.whatsappContactNumber,
    text.greeting(packageName),
  );
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/92 backdrop-blur-lg">
      <div className="mx-auto flex h-15 max-w-360 items-center gap-2 px-2 md:h-18 md:gap-6 md:px-14">
        <Link href={exitHref} aria-label={text.back} className={cn(ROUND_ICON_LINK, 'md:hidden')}>
          <ArrowLeft aria-hidden className="size-5" />
        </Link>
        {/* Named by the wordmark itself: a label that differs from the visible text fails WCAG 2.5.3. */}
        <Link href={HOME_NAV_ITEM.href} className="shrink-0 rounded-md max-md:hidden">
          <SiteWordmark showEyebrow={false} />
        </Link>
        <h1 className="min-w-0 flex-1 truncate py-1 text-center text-label-lg font-semibold text-foreground md:text-label md:text-ink-2">
          {text.title}
          <span className="max-md:sr-only"> · {packageName}</span>
        </h1>
        <HelpLinks chatUrl={chatUrl} />
        <Link
          href={exitHref}
          aria-label={text.exit}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition-colors duration-200 hover:bg-border max-md:hidden"
        >
          <X aria-hidden className="size-5" />
        </Link>
      </div>
    </header>
  );
}
