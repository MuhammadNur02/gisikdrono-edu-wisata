import { BookOpen } from 'lucide-react';
import Link from 'next/link';

import { RwTag } from '@/components/layout/rw-tag';
import { PhotoFrame } from '@/components/marketing/photo';
import { PhotoPlaceholder } from '@/components/marketing/photo-placeholder';
import { Card } from '@/components/ui/card';
import { IMAGE_SIZES } from '@/config/images';
import { BOOKLET_KIND_LABELS } from '@/config/status';
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

// docs/PRD.md FR-PUB-07, FR-PUB-15: the cover, its kind as the overline, the RW and the page count; the title
// link stretches over the card and opens the flipbook page, where the PDF download lives.
export function BookletCard({ booklet }: BookletCardProps) {
  return (
    <Card
      variant="interactive"
      className="relative w-full gap-4 overflow-hidden pt-0 md:gap-4 md:pt-0"
    >
      <BookletCover booklet={booklet} />
      <div className="space-y-3 px-5 md:px-6">
        <p className="text-overline text-primary-text">{BOOKLET_KIND_LABELS[booklet.kind]}</p>
        <h3 className="line-clamp-2 text-h4">
          <Link
            href={bookletPath(booklet.slug)}
            className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {booklet.title}
          </Link>
        </h3>
        {booklet.description ? (
          <p className="line-clamp-3 text-body-sm text-muted-foreground">{booklet.description}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
          {booklet.rw ? <RwTag rw={booklet.rw} /> : null}
          {booklet.pageCount ? <span>{copy.booklet.pages(booklet.pageCount)}</span> : null}
        </div>
      </div>
    </Card>
  );
}
