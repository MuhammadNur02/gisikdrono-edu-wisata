import { BookOpen, MapPin, MessageCircle } from 'lucide-react';
import Link from 'next/link';

import { RwTag } from '@/components/layout/rw-tag';
import { Section } from '@/components/layout/section';
import { RwPointsList } from '@/components/map/rw-points-list';
import { SiteMap } from '@/components/map/site-map';
import { SectionLink } from '@/components/marketing/section-link';
import { siteConfig } from '@/config/site';
import { BOOKLET_KIND_LABELS } from '@/config/status';
import { copy } from '@/lib/copy/id';
import { mapCopy } from '@/lib/copy/map';
import { cn } from '@/lib/utils/cn';
import { bookletPath, PUBLIC_PATHS } from '@/lib/utils/paths';
import { formatPhone } from '@/lib/utils/phone';
import { buildWhatsAppChatUrl } from '@/lib/utils/whatsapp';
import type { ActivityPoint } from '@/types/activity-point';
import type { BookletSummary } from '@/types/booklet';
import type { RwUnitSummary } from '@/types/rw-unit';

export interface MapContactProps {
  id: string;
  // site_settings `kelurahan.address`; NULL while it is still the seeded sample.
  address: string | null;
  points: readonly ActivityPoint[];
  // The RWs online, in their order; a point of an RW that is not among them is not listed.
  units: readonly RwUnitSummary[];
  booklets: readonly BookletSummary[];
}

const contactRowClassName = 'flex gap-3 text-body';

function BookletRow({ booklet }: { booklet: BookletSummary }) {
  return (
    <li>
      <Link
        href={bookletPath(booklet.slug)}
        className="flex min-h-11 items-start gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent dark:border-white/5"
      >
        <BookOpen aria-hidden className="mt-0.5 size-5 shrink-0 text-primary-text" />
        <span className="min-w-0 flex-1 space-y-1">
          <span className="block text-body font-medium">{booklet.title}</span>
          <span className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
            {BOOKLET_KIND_LABELS[booklet.kind]}
            {booklet.pageCount ? <span>· {booklet.pageCount} halaman</span> : null}
            {booklet.rw ? <RwTag rw={booklet.rw} /> : null}
          </span>
        </span>
      </Link>
    </li>
  );
}

// docs/PRD.md FR-PUB-07: each booklet opens its flipbook page, where the PDF download lives (Task P2.4.07).
function BookletList({ booklets }: { booklets: readonly BookletSummary[] }) {
  return (
    <div className="space-y-3">
      <h3 className="text-h4">Unduh e-booklet &amp; proposal</h3>
      <ul className="space-y-3">
        {booklets.map((booklet) => (
          <BookletRow key={booklet.id} booklet={booklet} />
        ))}
      </ul>
    </div>
  );
}

function ContactColumn({ address, booklets }: Pick<MapContactProps, 'address' | 'booklets'>) {
  const chatUrl = buildWhatsAppChatUrl(
    siteConfig.whatsappContactNumber,
    copy.layout.whatsAppGreeting(siteConfig.name),
  );
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        {address ? (
          <p className={cn(contactRowClassName, 'text-muted-foreground')}>
            <MapPin aria-hidden className="mt-1 size-4 shrink-0" />
            {address}
          </p>
        ) : null}
        <a href={chatUrl} target="_blank" rel="noopener noreferrer" className={contactRowClassName}>
          <MessageCircle aria-hidden className="mt-1 size-4 shrink-0 text-success" />
          <span>
            <span className="block font-medium underline-offset-4 hover:underline">
              {copy.layout.footerWhatsApp}
            </span>
            <span className="block text-muted-foreground tabular-nums">
              {formatPhone(siteConfig.whatsappContactNumber)}
            </span>
          </span>
        </a>
      </div>
      {booklets.length > 0 ? <BookletList booklets={booklets} /> : null}
      <SectionLink href={PUBLIC_PATHS.map} label="Lihat peta dan kontak" />
    </div>
  );
}

// docs/PRD.md FR-PUB-03 and FR-PUB-07 in one block (redesign of 2026-10-23): the interactive site plan with its
// points listed as the readable alternative, then the office, WhatsApp and the booklets. The plan is a dynamic
// island and never reveal-animated; without a published point the contact column takes the whole row
// (docs/StyleGuide.md §6.9), and /peta-kontak explains the empty plan.
export function MapContact({ id, address, points, units, booklets }: MapContactProps) {
  const hasPlan = points.length > 0;
  return (
    <Section
      id={id}
      tone="warm"
      wave={{ variant: 'gentle', flip: true }}
      eyebrow="Peta & kontak"
      title="Titik kunjungan di Gisikdrono"
    >
      <div className="grid gap-10 lg:grid-cols-12">
        {hasPlan ? (
          <div className="space-y-6 lg:col-span-7">
            <div className="space-y-2">
              <SiteMap points={points} units={units} />
              <p className="text-caption text-muted-foreground">{mapCopy.planProvisional}</p>
            </div>
            <RwPointsList points={points} units={units} />
          </div>
        ) : null}
        <div className={cn('reveal', hasPlan ? 'lg:col-span-5' : 'lg:col-span-12')}>
          <ContactColumn address={address} booklets={booklets} />
        </div>
      </div>
    </Section>
  );
}
