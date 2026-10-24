import { Award, CalendarCheck, HandHeart, Recycle, type LucideIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

import { SectionShell } from '@/components/layout/section';
import { SectionHeading } from '@/components/layout/section-heading';
import { FigureStat, FiguresPanel } from '@/components/marketing/figure-stat';
import { ARTS_KAMPUNG_HERITAGE, FIGURE_STAGGER_MS, MIN_FIGURES_SHOWN } from '@/config/home';
import { homeCopy } from '@/lib/copy/home';
import { joinWithAnd } from '@/lib/utils/lists';
import type { RwUnitProfile } from '@/types/rw-unit';

// The count-up loads after the page; the server already renders each final figure (docs/StyleGuide.md §7.4).
const CountUp = dynamic(() =>
  import('@/components/marketing/count-up').then((module) => module.CountUp),
);

interface Reason {
  icon: LucideIcon;
  // The tile's tint and icon colour: an RW accent set, or gold for the certificate.
  tone: string;
  title: string;
  body: string;
}

// DESIGN-SPEC §3.1 `Kenapa Gisikdrono`, word for word.
const REASONS: readonly Reason[] = [
  {
    icon: HandHeart,
    tone: 'bg-rw05-tint text-rw05',
    title: 'Dipandu warga sendiri',
    body: 'Ibu-ibu PKK, pengurus RT/RW, kader lingkungan, dan seniman kampung menjelaskan apa yang mereka kerjakan setiap hari.',
  },
  {
    icon: Recycle,
    tone: 'bg-rw13-tint text-rw13',
    title: 'Praktik, bukan sekadar melihat',
    body: 'Peserta ikut memilah sampah, melihat budidaya maggot, mencicipi minuman herbal TOGA, menabuh gamelan, dan bermain dolanan.',
  },
  {
    icon: CalendarCheck,
    tone: 'bg-rw08-tint text-rw08',
    title: 'Sesi berjadwal, kuota pasti',
    body: 'Setiap sesi punya kuota. Kursi rombonganmu terkunci begitu pemesanan dibuat, jadi tidak ada pesanan ganda.',
  },
  {
    icon: Award,
    tone: 'bg-gold-tint text-gold-ink',
    title: 'E-sertifikat setelah hadir',
    body: 'Sertifikat kelompok dan peserta terbit otomatis setelah rombongan check-in di gerbang kampung.',
  },
];

// The icon tile settles from .92 and the words rise 12 px, 60 ms apart (DESIGN-SPEC §4, Reasons).
function ReasonItem({ reason }: { reason: Reason }) {
  const Icon = reason.icon;
  return (
    <li className="flex gap-4 md:flex-col md:gap-5">
      <span
        className={`flex size-11 shrink-0 reveal-scale items-center justify-center rounded-md md:size-12 ${reason.tone}`}
      >
        <Icon aria-hidden className="size-5" />
      </span>
      <span className="reveal space-y-2">
        <span className="block font-display text-lg leading-snug font-bold md:text-xl">
          {reason.title}
        </span>
        <span className="block text-body text-ink-2">{reason.body}</span>
      </span>
    </li>
  );
}

interface Figure {
  key: string;
  value: number;
  label: ReactNode;
}

// A long label from md, the short one on a phone (DESIGN-SPEC §3.1, figures band).
function twoLengths(long: string, short: string): ReactNode {
  return (
    <>
      <span className="max-md:hidden">{long}</span>
      <span className="md:hidden">{short}</span>
    </>
  );
}

// 3 kampung and 14 points are counted from rw_units and activity_points; the dances and games count the arts
// kampung's own lists, and show only while that kampung is online.
function figuresFor(units: readonly RwUnitProfile[], pointCount: number): Figure[] {
  const figures: Figure[] = [];
  const copy = homeCopy.why;
  if (units.length > 0) {
    const labels = joinWithAnd(units.map((unit) => unit.label));
    figures.push({
      key: 'rw',
      value: units.length,
      label: twoLengths(copy.kampung(labels), copy.kampungShort),
    });
  }
  if (pointCount > 0) {
    figures.push({
      key: 'points',
      value: pointCount,
      label: twoLengths(copy.points, copy.pointsShort),
    });
  }
  if (units.some((unit) => unit.scheduleEnabled)) {
    const { dances, games } = ARTS_KAMPUNG_HERITAGE;
    figures.push(
      {
        key: 'dances',
        value: dances.length,
        label: twoLengths(copy.dances(joinWithAnd(dances)), copy.dancesShort),
      },
      {
        key: 'games',
        value: games.length,
        label: twoLengths(copy.games(games.join(', ')), copy.gamesShort),
      },
    );
  }
  return figures;
}

function Figures({ figures }: { figures: readonly Figure[] }) {
  return (
    <FiguresPanel
      title={homeCopy.why.figuresTitle}
      note={homeCopy.why.figuresNote}
      className="mt-14 lg:mt-18"
    >
      {figures.map((figure, index) => (
        <FigureStat
          key={figure.key}
          tone="forest"
          label={figure.label}
          value={<CountUp value={figure.value} delayMs={index * FIGURE_STAGGER_MS} />}
        />
      ))}
    </FiguresPanel>
  );
}

export interface WhyVisitProps {
  id: string;
  units: readonly RwUnitProfile[];
  pointCount: number;
}

// DESIGN-SPEC §3.1: why a group visits, in four reasons beside the heading, then the forest figures band, whose numbers
// count up once as it comes into view. With fewer than two figures the band is left out (docs/StyleGuide.md §1.3 G5).
export function WhyVisit({ id, units, pointCount }: WhyVisitProps) {
  const titleId = `${id}-judul`;
  const figures = figuresFor(units, pointCount);
  return (
    <SectionShell id={id} labelledBy={titleId} className="lg:py-32">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-x-6">
        <SectionHeading
          titleId={titleId}
          eyebrow={homeCopy.why.eyebrow}
          title={homeCopy.why.title}
          description={homeCopy.why.description}
          className="lg:col-span-5"
        />
        <ul className="grid gap-8 reveal-stagger md:grid-cols-2 md:gap-x-12 md:gap-y-12 lg:col-span-6 lg:col-start-7">
          {REASONS.map((reason) => (
            <ReasonItem key={reason.title} reason={reason} />
          ))}
        </ul>
      </div>
      {figures.length >= MIN_FIGURES_SHOWN ? <Figures figures={figures} /> : null}
    </SectionShell>
  );
}
