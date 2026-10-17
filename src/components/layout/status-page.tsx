import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Container } from '@/components/layout/container';
import { SiteWordmark } from '@/components/layout/site-wordmark';
import { HOME_NAV_ITEM } from '@/config/nav';
import { copy } from '@/lib/copy/id';

// docs/StyleGuide.md §8.1: 48 px empty-state icons use a lighter stroke.
const LARGE_ICON_STROKE = 1.5;

export interface StatusPageProps {
  icon: LucideIcon;
  title: string;
  description: string;
  eyebrow?: string;
  // Shown under the description, such as the error code for support.
  detail?: ReactNode;
  actions: ReactNode;
}

function HomeLinkBar() {
  return (
    <Container className="py-6">
      <Link
        href={HOME_NAV_ITEM.href}
        aria-label={copy.layout.homeLink}
        className="inline-flex rounded-lg"
      >
        <SiteWordmark />
      </Link>
    </Container>
  );
}

// The frame of the 404 and error pages. They render outside the public layout (an error there may be
// the reason they show), so the frame brings its own way home.
export function StatusPage({
  icon,
  title,
  description,
  eyebrow,
  detail,
  actions,
}: StatusPageProps) {
  const Icon = icon;
  return (
    <div className="flex min-h-dvh flex-col bg-linear-to-b from-brand-ice to-background dark:from-secondary">
      <HomeLinkBar />
      <main className="flex flex-1 items-center">
        <Container width="reading" className="space-y-6 py-16">
          <span className="inline-flex rounded-full bg-muted p-3">
            <Icon
              aria-hidden
              className="size-12 text-muted-foreground"
              strokeWidth={LARGE_ICON_STROKE}
            />
          </span>
          <div className="space-y-3">
            {eyebrow ? <p className="text-overline text-primary-text">{eyebrow}</p> : null}
            <h1 className="text-h1 text-balance">{title}</h1>
            <p className="text-body-lg text-pretty text-muted-foreground">{description}</p>
            {detail}
          </div>
          <div className="flex flex-wrap gap-3">{actions}</div>
        </Container>
      </main>
    </div>
  );
}
