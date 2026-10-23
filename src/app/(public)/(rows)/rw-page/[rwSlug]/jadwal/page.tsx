import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/layout/page-header';
import { RwEyebrow } from '@/components/layout/rw-eyebrow';
import { Section } from '@/components/layout/section';
import { ScheduleList } from '@/components/marketing/schedule-list';
import { JsonLd } from '@/components/seo/json-ld';
import { getRwUnitBySlug, listRwUnits } from '@/lib/queries/rw-units';
import { listSchedules } from '@/lib/queries/schedules';
import { eventJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { toJakartaIsoString } from '@/lib/utils/dates';
import { isRwSlug, rwSchedulePath } from '@/lib/utils/paths';
import {
  expandSchedules,
  groupByMonth,
  SCHEDULE_WINDOW_DAYS,
  scheduleWindowEnd,
  type ScheduleMonth,
} from '@/lib/utils/schedules';
import type { RwUnitProfile } from '@/types/rw-unit';
import type { ScheduleOccurrence } from '@/types/schedule';

// CLAUDE.md §5.1: the schedule page refreshes every half hour, so a performance that has ended drops off soon.
export const revalidate = 1800;
// Only the RWs that run a schedule (rw_units.schedule_enabled) have this page. Like the RW page itself it is built for
// the RWs of build time and rendered on demand for one that starts a schedule later.
export const dynamicParams = true;
// Sections alternate default and muted (docs/StyleGuide.md §5.7).
const MONTH_TONES = ['default', 'muted'] as const;

interface SchedulePageProps {
  params: Promise<{ rwSlug: string }>;
}

export async function generateStaticParams(): Promise<{ rwSlug: string }[]> {
  return (await listRwUnits())
    .filter((unit) => unit.scheduleEnabled)
    .map((unit) => ({ rwSlug: unit.slug }));
}

async function scheduleUnit(rwSlug: string): Promise<RwUnitProfile | null> {
  const unit = isRwSlug(rwSlug) ? await getRwUnitBySlug(rwSlug) : null;
  return unit?.scheduleEnabled ? unit : null;
}

function titleOf(unit: RwUnitProfile): string {
  return `Jadwal pertunjukan ${unit.label}`;
}

function descriptionOf(unit: RwUnitProfile): string {
  return `Pertunjukan, sesi dolanan, lokakarya, dan kelas seni di ${unit.name} dalam ${String(SCHEDULE_WINDOW_DAYS)} hari ke depan.`;
}

export async function generateMetadata({ params }: SchedulePageProps): Promise<Metadata> {
  const unit = await scheduleUnit((await params).rwSlug);
  if (!unit) return {};
  return buildPageMetadata({
    title: titleOf(unit),
    description: descriptionOf(unit),
    path: rwSchedulePath(unit.slug),
  });
}

function monthAnchor(month: ScheduleMonth): string {
  return `bulan-${month.key}`;
}

function MonthLinks({ months }: { months: ScheduleMonth[] }) {
  return (
    <nav aria-label="Pilih bulan">
      <ul className="flex flex-wrap gap-2">
        {months.map((month) => (
          <li key={month.key}>
            <Link
              href={`#${monthAnchor(month)}`}
              className="inline-flex min-h-11 items-center rounded-full border border-border bg-background px-4 text-body-sm font-medium transition-colors hover:bg-accent"
            >
              {month.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function occurrenceJsonLd(unit: RwUnitProfile, occurrence: ScheduleOccurrence) {
  const { schedule } = occurrence;
  return eventJsonLd({
    name: schedule.title,
    path: rwSchedulePath(unit.slug),
    startDate: toJakartaIsoString(occurrence.startsAt),
    endDate: toJakartaIsoString(occurrence.endsAt),
    locationName: schedule.venue ?? unit.name,
  });
}

// docs/PRD.md FR-PUB-10, Task P2.4.04: every performance of the RW in the next 90 days, recurring ones spelled out,
// month by month. A month without performances does not appear (docs/StyleGuide.md §6.9).
export default async function SchedulePage({ params }: SchedulePageProps) {
  const unit = await scheduleUnit((await params).rwSlug);
  if (!unit) notFound();
  const now = new Date();
  const schedules = (await listSchedules()).filter((schedule) => schedule.rwId === unit.id);
  const occurrences = expandSchedules(schedules, now, scheduleWindowEnd(now));
  const months = groupByMonth(occurrences);
  return (
    <>
      <PageHeader
        eyebrow={<RwEyebrow rw={unit} withName />}
        title={titleOf(unit)}
        description={descriptionOf(unit)}
        breadcrumbs={[{ name: unit.name, path: unit.path }]}
        path={rwSchedulePath(unit.slug)}
      >
        {months.length > 1 ? <MonthLinks months={months} /> : null}
      </PageHeader>
      {months.map((month, index) => (
        <Section
          key={month.key}
          id={monthAnchor(month)}
          title={month.label}
          tone={MONTH_TONES[index % MONTH_TONES.length]}
        >
          <ScheduleList occurrences={month.occurrences} />
        </Section>
      ))}
      {occurrences.length > 0 ? (
        <JsonLd data={occurrences.map((occurrence) => occurrenceJsonLd(unit, occurrence))} />
      ) : null}
    </>
  );
}
