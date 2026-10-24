import { ArrowRight, BookOpen } from 'lucide-react';
import Link from 'next/link';

import { RwTag } from '@/components/layout/rw-tag';
import { PhotoFrame } from '@/components/marketing/photo';
import { PhotoPlaceholder } from '@/components/marketing/photo-placeholder';
import { IMAGE_SIZES } from '@/config/images';
import { BOOKLET_KIND_LABELS } from '@/config/status';
import { bookletsPageCopy as text } from '@/lib/copy/catalogue';
import { copy } from '@/lib/copy/id';
import { bookletPath } from '@/lib/utils/paths';
import type { BookletSummary } from '@/types/booklet';

// A booklet cover is a page, usually A4 portrait; the whole cover shows, never a crop of it.
const COVER_ASPECT = 'aspect-3/4';

export interface BookletCardProps {
  booklet: BookletSummary;
}

function BookletCover({ booklet }: BookletCardProps) {
  return booklet.cover ? (
    <PhotoFrame
      image={booklet.cover}
      sizes={IMAGE_SIZES.card}
      aspectClassName={COVER_ASPECT}
      fit="contain"
      className="rounded-none"
      imageClassName="hover-zoom"
    />
  ) : (
    <PhotoPlaceholder
      label={booklet.title}
      icon={BookOpen}
      rws={booklet.rw ? [booklet.rw] : []}
      className={`${COVER_ASPECT} rounded-none`}
    />
  );
}

// docs/PRD.md FR-PUB-07, FR-PUB-15, in the editorial dress of the catalogue cards (DESIGN-SPEC §2.5): the cover, the kind
// in small caps, the title, two lines of description and the footer with the RW, the pages and `Baca booklet`. The title
// link stretches over the card and opens the flipbook page, where the PDF download lives.
export function BookletCard({ booklet }: BookletCardProps) {
  return (
    <article className="group relative flex h-full w-full hover-rise flex-col">
      <div className="overflow-hidden rounded-lg bg-muted">
        <BookletCover booklet={booklet} />
      </div>
      <div className="flex flex-1 flex-col gap-2.5 pt-5">
        <p className="text-meta-caps text-muted-foreground">{BOOKLET_KIND_LABELS[booklet.kind]}</p>
        <h3 className="text-card-title text-balance transition-colors duration-200 group-hover:text-primary-ink">
          <Link
            href={bookletPath(booklet.slug)}
            className="outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-ring"
          >
            {booklet.title}
          </Link>
        </h3>
        {booklet.description ? (
          <p className="line-clamp-2 text-body-md text-ink-2">{booklet.description}</p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4">
          <span className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
            {booklet.rw ? <RwTag rw={booklet.rw} size="sm" /> : null}
            {booklet.pageCount ? copy.booklet.pages(booklet.pageCount) : null}
          </span>
          <span
            aria-hidden
            className="inline-flex shrink-0 items-center gap-1.5 text-label font-semibold text-primary-ink"
          >
            {text.read}
            <ArrowRight className="size-4.5 hover-nudge" />
          </span>
        </div>
      </div>
    </article>
  );
}
