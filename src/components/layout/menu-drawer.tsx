'use client';

import { ArrowRight, CalendarDays, ChevronRight, ShieldCheck, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { NavLinkLabel } from '@/components/layout/nav-link-label';
import { SiteWordmark } from '@/components/layout/site-wordmark';
import { WhatsAppIcon } from '@/components/layout/whatsapp-icon';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  BOOKING_CTA,
  HOME_NAV_ITEM,
  isCurrentNavItem,
  type PublicNavGroup,
  type PublicNavItem,
} from '@/config/public-nav';
import { rwAccentClasses } from '@/config/rw';
import { siteConfig } from '@/config/site';
import { layoutCopy, uiCopy } from '@/lib/copy/ui';
import { cn } from '@/lib/utils/cn';
import { visitorPathFor } from '@/lib/utils/paths';
import { buildWhatsAppChatUrl } from '@/lib/utils/whatsapp';

const GROUP_TITLE_CLASS = 'text-eyebrow text-muted-foreground';

// Closing on tap matters because a client navigation keeps the sheet mounted.
function MenuLink({
  item,
  pathname,
  className,
  children,
}: {
  item: PublicNavItem;
  pathname: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <SheetClose asChild>
      <Link
        href={item.href}
        aria-current={isCurrentNavItem(item, pathname) ? 'page' : undefined}
        className={className}
      >
        {children}
      </Link>
    </SheetClose>
  );
}

// An RW row: a 6 x 30 bar in the RW's accent, `RW 05 · Ecowastreme`, its theme below, a chevron (DESIGN-SPEC §2.7).
function RwRow({ item, pathname }: { item: PublicNavItem; pathname: string }) {
  const accent = item.rw ? rwAccentClasses(item.rw.accentKey).scope : 'rw-scope-neutral';
  return (
    <MenuLink
      item={item}
      pathname={pathname}
      className={cn(
        'group flex min-h-13.5 items-center gap-3 rounded-md py-1.5 transition-colors aria-[current=page]:bg-muted',
        accent,
      )}
    >
      <span aria-hidden className="h-7.5 w-1.5 shrink-0 rounded-full bg-rw-fill" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-body-md leading-snug font-semibold">
          <NavLinkLabel
            item={item}
            label={item.rw ? `${item.rw.label} · ${item.rw.shortName}` : undefined}
          />
        </span>
        {item.description ? (
          <span className="text-caption text-muted-foreground">{item.description}</span>
        ) : null}
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 hover-nudge text-ink-2" />
    </MenuLink>
  );
}

function ScheduleRow({ item, pathname }: { item: PublicNavItem; pathname: string }) {
  return (
    <MenuLink
      item={item}
      pathname={pathname}
      className="flex min-h-11 items-center gap-3 text-label font-medium"
    >
      <CalendarDays aria-hidden className="size-5 shrink-0 text-primary-ink" />
      <NavLinkLabel item={item} />
    </MenuLink>
  );
}

function KampungGroup({ group, pathname }: { group: PublicNavGroup; pathname: string }) {
  return (
    <div className="space-y-2">
      <p className={GROUP_TITLE_CLASS}>{group.title}</p>
      <ul>
        {group.items.map((item) => (
          <li key={item.href}>
            {item.rw ? (
              <RwRow item={item} pathname={pathname} />
            ) : (
              <ScheduleRow item={item} pathname={pathname} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LinkGroup({ group, pathname }: { group: PublicNavGroup; pathname: string }) {
  return (
    <div className="space-y-2">
      <p className={GROUP_TITLE_CLASS}>{group.title}</p>
      <ul>
        {group.items.map((item) => (
          <li key={item.href}>
            <MenuLink
              item={item}
              pathname={pathname}
              className="flex min-h-11 items-center text-label font-medium text-ink-2 transition-colors hover:text-foreground aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
            >
              <NavLinkLabel item={item} />
            </MenuLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DrawerTop() {
  return (
    <div className="flex items-center justify-between">
      <SheetClose asChild>
        <Link href={HOME_NAV_ITEM.href} className="rounded-md">
          <SiteWordmark showEyebrow={false} />
        </Link>
      </SheetClose>
      <SheetClose className="inline-flex size-11 press-scale items-center justify-center rounded-full bg-muted text-foreground hover:bg-border">
        <X aria-hidden className="size-5" />
        <span className="sr-only">{uiCopy.close}</span>
      </SheetClose>
    </div>
  );
}

function DrawerFoot() {
  const chatUrl = buildWhatsAppChatUrl(
    siteConfig.whatsappContactNumber,
    layoutCopy.whatsAppGreeting(siteConfig.name),
  );
  return (
    <div className="mt-auto space-y-4 border-t border-border pt-5">
      <Button asChild variant="whatsapp" size="lg" className="w-full rounded-full">
        <a href={chatUrl} target="_blank" rel="noopener noreferrer">
          <WhatsAppIcon />
          {layoutCopy.whatsAppChat}
        </a>
      </Button>
      <p className="flex gap-2.5 text-caption text-muted-foreground">
        <ShieldCheck aria-hidden className="size-4.5 shrink-0 text-rw05" />
        {layoutCopy.paymentTrustShort}
      </p>
    </div>
  );
}

// The booking button, the links and the foot, entering one after another (enter-stagger).
function DrawerBody({ groups, pathname }: { groups: readonly PublicNavGroup[]; pathname: string }) {
  const [kampungGroup, ...linkGroups] = groups;
  return (
    <div className="flex flex-1 enter-stagger flex-col gap-6 reveal-stagger">
      <SheetClose asChild>
        <Button asChild size="lg" className="w-full">
          <Link href={BOOKING_CTA.href}>
            {BOOKING_CTA.label}
            <ArrowRight aria-hidden data-icon="trailing" />
          </Link>
        </Button>
      </SheetClose>
      <nav aria-label={layoutCopy.mainNav} className="space-y-6">
        {kampungGroup ? <KampungGroup group={kampungGroup} pathname={pathname} /> : null}
        <div className="grid grid-cols-2 gap-x-4">
          {linkGroups.map((group) => (
            <LinkGroup key={group.title} group={group} pathname={pathname} />
          ))}
        </div>
      </nav>
      <DrawerFoot />
    </div>
  );
}

// Below lg the links move into this drawer (docs/StyleGuide.md §10.2, DESIGN-SPEC §2.7): 354 px from the right over
// the dimmed page, the booking button first, the RWs in their accents, then the visit and information links side by
// side, WhatsApp and the payment promise at the foot. It slides in on the sheet spring and its rows follow 30 ms
// apart (enter-stagger); Radix traps the focus, closes on Esc and gives the focus back to the menu button. MobileMenu
// loads it on first use, so Radix Dialog never reaches a page's first load.
export interface MenuDrawerProps {
  groups: readonly PublicNavGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MenuDrawer({ groups, open, onOpenChange }: MenuDrawerProps) {
  const pathname = visitorPathFor(usePathname());
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-drawer gap-5 overflow-y-auto rounded-l-3xl border-0 pt-3 pr-5 pb-5 pl-6 shadow-drawer data-[state=closed]:duration-220 data-[state=closed]:ease-exit data-[state=open]:duration-360 data-[state=open]:ease-spring-sheet sm:max-w-none"
      >
        <SheetTitle className="sr-only">{layoutCopy.menuTitle}</SheetTitle>
        <SheetDescription className="sr-only">{layoutCopy.menuDescription}</SheetDescription>
        <DrawerTop />
        <DrawerBody groups={groups} pathname={pathname} />
      </SheetContent>
    </Sheet>
  );
}
