import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Container } from '@/components/layout/container';
import { JsonLd } from '@/components/seo/json-ld';
import { copy } from '@/lib/copy/id';
import { breadcrumbListJsonLd, type BreadcrumbItem } from '@/lib/seo/json-ld';
import { breadcrumbTrail } from '@/lib/utils/breadcrumbs';
import { cn } from '@/lib/utils/cn';

export interface TitleAccent {
  // The end of the title to colour, such as the programme name in `RW 05 Ecowastreme`.
  text: string;
  className: string;
}

export interface PageHeaderProps {
  title: string;
  eyebrow?: ReactNode;
  description?: string;
  // The pages above this one, Beranda excluded; the current page closes the trail by itself.
  breadcrumbs?: readonly BreadcrumbItem[];
  // Site-relative path of this page, which ends the BreadcrumbList.
  path?: string;
  // The page's name in the trail when the title says more (`Paket wisata` under `Pilih paket kunjunganmu`).
  crumb?: string;
  // The RW page title accent of docs/StyleGuide.md §2.7.
  titleAccent?: TitleAccent;
  // `display` is the RW page hero size of §3.2; other pages keep `page` (text-h1).
  titleSize?: 'page' | 'display';
  // Shown under the description, such as the RW's photo.
  children?: ReactNode;
  // `paper` is the page head of the redesign (DESIGN-SPEC §3.4–§3.8): the paper itself, the display title, the lead
  // in ink-2 and an optional aside beside them from lg. `brand`, the default, keeps the earlier tinted head.
  tone?: 'brand' | 'paper';
  // Paper tone only: beside the title and the lead from lg, under them below (a summary box, a note card, a search).
  aside?: ReactNode;
}

function TitleText({ title, accent }: { title: string; accent?: TitleAccent }) {
  if (!accent || !title.endsWith(accent.text)) return title;
  return (
    <>
      {title.slice(0, title.length - accent.text.length)}
      <span className={accent.className}>{accent.text}</span>
    </>
  );
}

// The visible trail and its BreadcrumbList come from the same list, so they can never disagree. The page
// passes it because only the page knows its own name, such as a package title.
export function Breadcrumbs({
  trail,
  className,
}: {
  trail: readonly BreadcrumbItem[];
  className?: string;
}) {
  const ancestors = trail.slice(0, -1);
  const current = trail.at(-1);
  return (
    <nav aria-label={copy.layout.breadcrumb} className={className}>
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

interface PaperHeadProps {
  title: string;
  description?: string;
  trail: readonly BreadcrumbItem[] | null;
  aside?: ReactNode;
  children?: ReactNode;
}

// DESIGN-SPEC §3.4 page head: 72 px above, 48 below, the trail, the display title, the lead (19, at most 640 px) and
// the aside aligned to the lead's foot. Never animated: the title is the page's LCP.
function PaperHead({ title, description, trail, aside, children }: PaperHeadProps) {
  return (
    <Container className="space-y-5 pt-8 pb-8 md:space-y-6 md:pt-18 md:pb-12">
      {trail ? <Breadcrumbs trail={trail} /> : null}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
        <div className="max-w-200 space-y-4 md:space-y-5">
          <h1 className="text-display text-balance">{title}</h1>
          {description ? (
            <p className="max-w-160 text-body-lg text-pretty text-ink-2">{description}</p>
          ) : null}
        </div>
        {aside ? <div className="shrink-0 lg:pb-1">{aside}</div> : null}
      </div>
      {children}
    </Container>
  );
}

type BrandHeadProps = Pick<
  PageHeaderProps,
  'title' | 'eyebrow' | 'description' | 'titleAccent' | 'titleSize' | 'children'
> & { trail: readonly BreadcrumbItem[] | null };

// The earlier tinted head, kept for the pages not redesigned yet.
function BrandHead({
  title,
  eyebrow,
  description,
  titleAccent,
  titleSize,
  trail,
  children,
}: BrandHeadProps) {
  return (
    <div className="bg-linear-to-b from-brand-ice to-background">
      <Container className="space-y-6 pt-10 pb-12 md:pt-14 md:pb-16">
        {trail ? <Breadcrumbs trail={trail} /> : null}
        <div className="max-w-3xl space-y-4">
          {eyebrow ? <p className="text-overline text-primary-text">{eyebrow}</p> : null}
          <h1
            className={cn(titleSize === 'display' ? 'text-display-lg' : 'text-h1', 'text-balance')}
          >
            <TitleText title={title} accent={titleAccent} />
          </h1>
          {description ? (
            <p className="text-body-lg text-pretty text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {children}
      </Container>
    </div>
  );
}

export function PageHeader({
  breadcrumbs,
  path,
  crumb,
  tone = 'brand',
  aside,
  ...head
}: PageHeaderProps) {
  const trail =
    breadcrumbs && path ? breadcrumbTrail(breadcrumbs, { name: crumb ?? head.title, path }) : null;
  return (
    <>
      {tone === 'paper' ? (
        <div className="bg-background">
          <PaperHead title={head.title} description={head.description} trail={trail} aside={aside}>
            {head.children}
          </PaperHead>
        </div>
      ) : (
        <BrandHead {...head} trail={trail} />
      )}
      {trail ? <JsonLd data={breadcrumbListJsonLd(trail)} /> : null}
    </>
  );
}
