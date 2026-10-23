import { CalendarCheck, QrCode, ShieldCheck, type LucideIcon } from 'lucide-react';
import dynamic from 'next/dynamic';

import { Container } from '@/components/layout/container';
import { SectionShell } from '@/components/layout/section';
import { ParallaxPhoto } from '@/components/marketing/parallax-photo';
import { Reveal } from '@/components/marketing/reveal';
import { SplitWords } from '@/components/marketing/split-words';
import { IMAGE_SIZES } from '@/config/images';
import { copy } from '@/lib/copy/id';
import type { HomeGalleryPhoto } from '@/lib/utils/home-gallery';
import { hasHomeStats, type HomeCountKey, type HomeStats } from '@/lib/utils/home-stats';
import { countWord } from '@/lib/utils/number-words';
import { formatRating } from '@/lib/utils/ratings';

// The count-up loads after the page; the server already renders each final figure (docs/StyleGuide.md §7.4).
const CountUp = dynamic(() =>
  import('@/components/marketing/count-up').then((module) => module.CountUp),
);

// What each figure counts; kelurahan to review (docs/StyleGuide.md §1.3 G6).
const COUNT_LABELS: Record<HomeCountKey, string> = {
  rws: 'kampung wisata',
  packages: 'paket kunjungan',
  points: 'titik kegiatan',
  vendors: 'pelaku UMKM',
};

interface Reason {
  icon: LucideIcon;
  title: string;
  body: string;
}

// How a visit works, as docs/PRD.md describes the flow, rather than praise (§1.3 G6). `Sertifikat elektronik
// untuk rombongan` joins once the certificate flow is live.
const REASONS: readonly Reason[] = [
  {
    icon: CalendarCheck,
    title: 'Sesi terjadwal, kuota terlihat',
    body: 'Pilih tanggal dan sesi; sisa kuota tampil sebelum Anda membayar.',
  },
  {
    icon: QrCode,
    title: 'Tiket QR lewat WhatsApp dan email',
    body: 'Setelah pembayaran diterima, tiket untuk gerbang kampung dikirim ke penanggung jawab rombongan.',
  },
  { icon: ShieldCheck, title: 'Bayar hanya lewat sistem', body: copy.layout.paymentTrust },
];

function headlineFor(rwCount: number): string {
  const where = rwCount > 0 ? `${countWord(rwCount)} kampung` : 'Gisikdrono';
  return `Belajar langsung dari kegiatan warga di ${where}`;
}

// The icon sits in the 40 px tile of docs/StyleGuide.md §8.1.
function ReasonItem({ reason }: { reason: Reason }) {
  const Icon = reason.icon;
  return (
    <li className="flex gap-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
        <Icon aria-hidden className="size-5" strokeWidth={1.75} />
      </span>
      <span className="space-y-1">
        <span className="block text-h4">{reason.title}</span>
        <span className="block text-body text-muted-foreground">{reason.body}</span>
      </span>
    </li>
  );
}

function ReasonList() {
  return (
    <ul className="space-y-6">
      {REASONS.map((reason) => (
        <ReasonItem key={reason.title} reason={reason} />
      ))}
    </ul>
  );
}

const statClassName = 'flex flex-col-reverse gap-1 border-t border-border pt-4';
const statValueClassName = 'text-display-lg text-foreground';

// Counted figures and the rating, divided by rules rather than set in cards. The rating is shown as it is,
// never counted up, and takes the full row when it would sit alone.
function StatGrid({ stats }: { stats: HomeStats }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-8">
      {stats.counts.map((count) => (
        <div key={count.key} className={statClassName}>
          <dt className="text-body-sm text-muted-foreground">{COUNT_LABELS[count.key]}</dt>
          <dd className={statValueClassName}>
            <CountUp value={count.value} />
          </dd>
        </div>
      ))}
      {stats.rating ? (
        <div className={`${statClassName} odd:col-span-2`}>
          <dt className="text-body-sm text-muted-foreground">
            {copy.catalogue.ratingFromReviews(stats.rating.reviewCount)}
          </dt>
          <dd className={`${statValueClassName} tabular-nums`}>
            {formatRating(stats.rating.averageRating)}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

// A captioned gallery photo across the whole width (G8), the caption on a scrim over its bottom edge.
function PhotoBand({ photo }: { photo: HomeGalleryPhoto }) {
  return (
    <figure className="relative">
      <ParallaxPhoto
        image={photo.image}
        sizes={IMAGE_SIZES.bleed}
        aspectClassName="aspect-4/3 md:aspect-21/9"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-brand-deep/80 to-transparent"
      />
      <figcaption className="absolute inset-x-0 bottom-0">
        <Container className="pb-5 text-body-sm text-white md:pb-8 md:text-body">
          {photo.caption}
        </Container>
      </figcaption>
    </figure>
  );
}

export interface WhyVisitProps {
  id: string;
  rwCount: number;
  stats: HomeStats;
  // The first captioned gallery photo, for the band under the section; NULL leaves the band out.
  bandPhoto: HomeGalleryPhoto | null;
}

// Why a group visits, with figures counted from published rows (docs/StyleGuide.md §1.3 G5).
export function WhyVisit({ id, rwCount, stats, bandPhoto }: WhyVisitProps) {
  const titleId = `${id}-judul`;
  return (
    <SectionShell
      id={id}
      labelledBy={titleId}
      wave={{ variant: 'gentle', flip: true }}
      bleed={bandPhoto ? <PhotoBand photo={bandPhoto} /> : undefined}
    >
      <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
        <div className="space-y-8 lg:col-span-6">
          <div className="space-y-3">
            <p className="text-overline text-primary-text">Mengapa Gisikdrono</p>
            <h2 id={titleId} className="text-h1 text-balance">
              <SplitWords text={headlineFor(rwCount)} />
            </h2>
          </div>
          <Reveal>
            <ReasonList />
          </Reveal>
        </div>
        {hasHomeStats(stats) ? (
          <Reveal className="lg:col-span-6">
            <StatGrid stats={stats} />
          </Reveal>
        ) : null}
      </div>
    </SectionShell>
  );
}
