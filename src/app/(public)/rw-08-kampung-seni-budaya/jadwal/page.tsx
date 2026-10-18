import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeader } from '@/components/layout/page-header';
import { RwEyebrow } from '@/components/layout/rw-eyebrow';
import { Section } from '@/components/layout/section';
import { ScheduleList } from '@/components/marketing/schedule-list';
import { JsonLd } from '@/components/seo/json-ld';
import { RW_PROGRAMMES } from '@/config/rw';
import { listSchedules } from '@/lib/queries/schedules';
import { eventJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { toJakartaIsoString } from '@/lib/utils/dates';
import {
  expandSchedules,
  groupByMonth,
  SCHEDULE_WINDOW_DAYS,
  scheduleWindowEnd,
  type ScheduleMonth,
} from '@/lib/utils/schedules';
import type { ScheduleOccurrence } from '@/types/schedule';

// CLAUDE.md §5.1: the schedule page refreshes every half hour, so a performance that has ended drops off soon.
export const revalidate = 1800;

const RW_ID = 8;
const programme = RW_PROGRAMMES[RW_ID];
const PATH = `${programme.path}/jadwal`;
const TITLE = `Jadwal pertunjukan ${programme.label}`;
const DESCRIPTION = `Pertunjukan, sesi dolanan, lokakarya, dan kelas seni di ${programme.label} ${programme.name} dalam ${String(SCHEDULE_WINDOW_DAYS)} hari ke depan.`;
// Sections alternate default and muted (docs/StyleGuide.md §5.7).
const MONTH_TONES = ['default', 'muted'] as const;

export const metadata: Metadata = buildPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PATH,
});

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

function occurrenceJsonLd(occurrence: ScheduleOccurrence) {
  const { schedule } = occurrence;
  return eventJsonLd({
    name: schedule.title,
    path: PATH,
    startDate: toJakartaIsoString(occurrence.startsAt),
    endDate: toJakartaIsoString(occurrence.endsAt),
    locationName: schedule.venue ?? `${programme.label} ${programme.name}`,
  });
}

// docs/PRD.md FR-PUB-10, Task P2.4.04: every RW 08 performance of the next 90 days, recurring ones spelled out,
// month by month. A month without performances does not appear (docs/StyleGuide.md §6.9).
export default async function SchedulePage() {
  const now = new Date();
  const schedules = (await listSchedules()).filter((schedule) => schedule.rwId === RW_ID);
  const occurrences = expandSchedules(schedules, now, scheduleWindowEnd(now));
  const months = groupByMonth(occurrences);
  return (
    <>
      <PageHeader
        eyebrow={<RwEyebrow rwId={RW_ID} withName />}
        title={TITLE}
        description={DESCRIPTION}
        breadcrumbs={[{ name: `${programme.label} ${programme.name}`, path: programme.path }]}
        path={PATH}
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
      {occurrences.length > 0 ? <JsonLd data={occurrences.map(occurrenceJsonLd)} /> : null}
    </>
  );
}
