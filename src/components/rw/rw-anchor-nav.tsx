'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils/cn';

export interface RwAnchorLink {
  id: string;
  label: string;
}

export interface RwAnchorNavProps {
  links: readonly RwAnchorLink[];
  label: string;
  // `Mulai Rp35.000 / orang` and the Pesan button from lg; left out for a profile-only RW.
  price?: { text: string; bookLabel: string; bookHref: string };
}

// A section counts as in view while it crosses the band just under the sticky header and nav.
const CURRENT_BAND = '-140px 0px -55% 0px';
// The RW hero carries this attribute (src/components/rw/rw-hero.tsx); while it still reaches the band, no section is
// current yet.
const RW_HERO_ATTRIBUTE = 'data-rw-hero';

function elementsOf(idList: string): HTMLElement[] {
  return idList.split(' ').flatMap((id) => {
    const element = document.getElementById(id);
    return element ? [element] : [];
  });
}

// Marks the section in view (DESIGN-SPEC §4, RW page anchor nav) with one IntersectionObserver and no scroll handler.
// Every callback updates what it saw and the current one is worked out again from all of them: the topmost section
// in the band, or none while the hero is. The ids come as one space-separated string, so the effect runs again only
// when the sections change.
function useCurrentSection(idList: string): string | null {
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    const sections = elementsOf(idList);
    const hero = document.querySelector(`[${RW_HERO_ATTRIBUTE}]`);
    const inBand = new Map<Element, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => inBand.set(entry.target, entry.isIntersecting));
        const isHeroInView = hero !== null && inBand.get(hero) === true;
        setCurrent(
          isHeroInView ? null : (sections.find((section) => inBand.get(section))?.id ?? null),
        );
      },
      { rootMargin: CURRENT_BAND },
    );
    [...(hero ? [hero] : []), ...sections].forEach((element) => {
      observer.observe(element);
    });
    return () => {
      observer.disconnect();
    };
  }, [idList]);
  return current;
}

function PriceBox({ price }: { price: NonNullable<RwAnchorNavProps['price']> }) {
  return (
    <div className="flex shrink-0 items-center gap-3 max-lg:hidden">
      <span className="text-label-sm font-medium text-ink-2">{price.text}</span>
      <Link
        href={price.bookHref}
        className="inline-flex h-11 items-center rounded-md bg-primary px-4 text-label-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
      >
        {price.bookLabel}
      </Link>
    </div>
  );
}

// DESIGN-SPEC §3.3 anchor nav: sticky under the header (72 px, 64 on a phone), the page's sections as pills, the
// current one filled in the RW accent. On a phone the pills scroll sideways inside their own row. A click is an
// ordinary anchor link, so the page's smooth scroll (or the instant one under reduced motion) applies. The pills and
// Pesan are 44 px tall rather than the design's 40 and 36, for the touch-target rule (docs/StyleGuide.md §9.1 A4).
export function RwAnchorNav({ links, label, price }: RwAnchorNavProps) {
  const current = useCurrentSection(links.map((link) => link.id).join(' '));
  return (
    <nav
      aria-label={label}
      className="sticky top-(--header-h) z-30 border-b border-border bg-background/95 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 md:px-10">
        <ul className="scrollbar-none flex flex-1 gap-2 overflow-x-auto px-5 md:gap-1 md:px-0">
          {links.map((link) => (
            <li key={link.id} className="shrink-0">
              <Link
                href={`#${link.id}`}
                aria-current={current === link.id ? 'location' : undefined}
                className={cn(
                  'inline-flex h-11 items-center rounded-full px-4 text-label-sm font-medium whitespace-nowrap transition-colors duration-300 ease-spring-snappy max-md:border max-md:border-border-strong',
                  current === link.id
                    ? 'bg-rw-fill font-semibold text-on-accent max-md:border-transparent'
                    : 'text-ink-2 hover:bg-muted hover:text-foreground',
                )}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        {price ? <PriceBox price={price} /> : null}
      </div>
    </nav>
  );
}
