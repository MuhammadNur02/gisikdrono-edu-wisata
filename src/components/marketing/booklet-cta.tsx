import { BookOpen } from 'lucide-react';
import Link from 'next/link';

import { RwTag } from '@/components/layout/rw-tag';
import { Section } from '@/components/layout/section';
import { BOOKLET_KIND_LABELS } from '@/config/status';
import type { BookletSummary } from '@/types/booklet';

export interface BookletCtaProps {
  id: string;
  booklets: readonly BookletSummary[];
}

function BookletRow({ booklet }: { booklet: BookletSummary }) {
  return (
    <li>
      <Link
        href={`/e-booklet/${booklet.slug}`}
        className="flex min-h-11 items-start gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent md:p-5 dark:border-white/5"
      >
        <BookOpen aria-hidden className="mt-0.5 size-5 shrink-0 text-primary-text" />
        <span className="min-w-0 flex-1 space-y-1">
          <span className="block text-body font-medium">{booklet.title}</span>
          <span className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
            {BOOKLET_KIND_LABELS[booklet.kind]}
            {booklet.pageCount ? <span>· {booklet.pageCount} halaman</span> : null}
            {booklet.rwId ? <RwTag rwId={booklet.rwId} /> : null}
          </span>
        </span>
      </Link>
    </li>
  );
}

// docs/PRD.md FR-PUB-07: the published e-booklets, visit proposals and price lists, a short list rather than a
// card grid. Each opens its flipbook page, where the PDF download lives (Task P2.4.07).
export function BookletCta({ id, booklets }: BookletCtaProps) {
  return (
    <Section
      id={id}
      eyebrow="E-booklet"
      title="Bahan untuk mengajukan kunjungan"
      description="E-booklet, proposal kunjungan, dan daftar harga yang bisa dibaca atau diunduh."
    >
      <ul className="grid gap-3 md:grid-cols-2">
        {booklets.map((booklet) => (
          <BookletRow key={booklet.id} booklet={booklet} />
        ))}
      </ul>
    </Section>
  );
}
