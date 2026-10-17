import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Container } from '@/components/layout/container';
import { JsonLd } from '@/components/seo/json-ld';
import { HOME_NAV_ITEM } from '@/config/nav';
import { copy } from '@/lib/copy/id';
import { breadcrumbListJsonLd, type BreadcrumbItem } from '@/lib/seo/json-ld';

export interface PageHeaderProps {
  title: string;
  eyebrow?: ReactNode;
  description?: string;
  // The pages above this one, Beranda excluded; the current page closes the trail by itself.
  breadcrumbs?: readonly BreadcrumbItem[];
  // Site-relative path of this page, which ends the BreadcrumbList.
  path?: string;
}

// The visible trail and its BreadcrumbList come from the same list, so they can never disagree. The page
// passes it because only the page knows its own name, such as a package title.
function Breadcrumbs({ trail }: { trail: readonly BreadcrumbItem[] }) {
  const ancestors = trail.slice(0, -1);
  const current = trail.at(-1);
  return (
    <nav aria-label={copy.layout.breadcrumb}>
      <ol className="flex flex-wrap items-center gap-1 text-body-sm text-muted-foreground">
        {ancestors.map((item) => (
          <li key={item.path} className="flex items-center gap-1">
            <Link
              href={item.path}
              className="rounded-md underline-offset-4 hover:text-foreground hover:underline"
            >
              {item.name}
            </Link>
            <ChevronRight aria-hidden className="size-4" />
          </li>
        ))}
        <li aria-current="page" className="font-medium text-foreground">
          {current?.name}
        </li>
      </ol>
    </nav>
  );
}

export function PageHeader({ title, eyebrow, description, breadcrumbs, path }: PageHeaderProps) {
  const trail =
    breadcrumbs && path
      ? [
          { name: HOME_NAV_ITEM.label, path: HOME_NAV_ITEM.href },
          ...breadcrumbs,
          { name: title, path },
        ]
      : null;
  return (
    <div className="bg-linear-to-b from-brand-ice to-background dark:from-secondary">
      <Container className="space-y-6 pt-10 pb-12 md:pt-14 md:pb-16">
        {trail ? <Breadcrumbs trail={trail} /> : null}
        <div className="max-w-3xl space-y-4">
          {eyebrow ? <p className="text-overline text-primary">{eyebrow}</p> : null}
          <h1 className="text-h1 text-balance">{title}</h1>
          {description ? (
            <p className="text-body-lg text-pretty text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </Container>
      {trail ? <JsonLd data={breadcrumbListJsonLd(trail)} /> : null}
    </div>
  );
}
