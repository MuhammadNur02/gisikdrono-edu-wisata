'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';

import { catalogueUiCopy } from '@/lib/copy/catalogue-ui';
import { cn } from '@/lib/utils/cn';

export interface TocEntry {
  id: string;
  text: string;
}

// A heading counts as the one being read once its top passes a quarter of the way down the screen.
const READING_LINE = 0.25;

// The last heading above the reading line, or the first heading before any has passed it.
function headingAtReadingLine(entries: readonly TocEntry[]): string | null {
  const line = window.innerHeight * READING_LINE;
  let current = entries[0]?.id ?? null;
  for (const entry of entries) {
    const top = document.getElementById(entry.id)?.getBoundingClientRect().top;
    if (top !== undefined && top <= line) current = entry.id;
  }
  return current;
}

// The heading the reader is in (DESIGN-SPEC §4, Artikel detail TOC), read once a frame at most while scrolling.
function useActiveHeading(entries: readonly TocEntry[]): string | null {
  const [active, setActive] = useState<string | null>(entries[0]?.id ?? null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setActive(headingAtReadingLine(entries));
      });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
    };
  }, [entries]);
  return active;
}

function TocLinks({ entries, active }: { entries: readonly TocEntry[]; active: string | null }) {
  return (
    <ol className="space-y-1">
      {entries.map((entry) => (
        <li key={entry.id}>
          <a
            href={`#${entry.id}`}
            aria-current={entry.id === active ? 'location' : undefined}
            className={cn(
              'block border-l-2 py-1.5 pl-3 text-body-sm transition-colors duration-180 ease-out-soft',
              entry.id === active
                ? 'border-rw-fill font-semibold text-foreground'
                : 'border-border-strong text-muted-foreground hover:text-foreground',
            )}
          >
            {entry.text}
          </a>
        </li>
      ))}
    </ol>
  );
}

export interface ArticleTocProps {
  title: string;
  entries: readonly TocEntry[];
}

// "Di artikel ini" (DESIGN-SPEC §3.8): beside the text from lg, sticky under the header, the section being read marked
// with the RW's rule; on a phone a closed row that opens the same list.
export function ArticleToc({ title, entries }: ArticleTocProps) {
  const active = useActiveHeading(entries);
  return (
    <>
      <nav aria-label={title} className="space-y-3 max-lg:hidden">
        <p className="text-meta-caps text-muted-foreground">{title}</p>
        <TocLinks entries={entries} active={active} />
      </nav>
      <details className="group faq-row rounded-lg border border-border bg-card lg:hidden">
        <summary className="flex min-h-13 items-center justify-between gap-3 px-4 text-body-sm font-semibold">
          {title} · {catalogueUiCopy.sections(entries.length)}
          <ChevronDown
            aria-hidden
            className="size-4.5 transition-transform duration-240 group-open:rotate-180"
          />
        </summary>
        <nav aria-label={title} className="px-4 pb-4">
          <TocLinks entries={entries} active={active} />
        </nav>
      </details>
    </>
  );
}
