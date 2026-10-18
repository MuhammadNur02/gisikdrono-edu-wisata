import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Section } from '@/components/layout/section';
import { RW_SECTION_IDS, RwPage } from '@/components/marketing/rw-page';
import { SchedulePreview } from '@/components/marketing/schedule-preview';
import { SectionLink } from '@/components/marketing/section-link';
import { JsonLd } from '@/components/seo/json-ld';
import { RW_PROGRAMMES } from '@/config/rw';
import { copy } from '@/lib/copy/id';
import { getRwPageData } from '@/lib/queries/rw-page';
import { getRwUnitBySlug } from '@/lib/queries/rw-units';
import { rwAttractionJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { upcomingSchedules } from '@/lib/utils/schedules';
import type { PerformanceSchedule } from '@/types/schedule';

export const revalidate = 3600;

const RW_ID = 8;
const programme = RW_PROGRAMMES[RW_ID];

export async function generateMetadata(): Promise<Metadata> {
  const unit = await getRwUnitBySlug(programme.slug);
  return buildPageMetadata({
    title: unit?.name ?? `${programme.label} ${programme.name}`,
    description: unit?.tagline ?? undefined,
    path: programme.path,
  });
}

// docs/PRD.md FR-PUB-09: the next published performances, checked when the page renders (hourly ISR).
function ScheduleSection({ schedules }: { schedules: PerformanceSchedule[] }) {
  const upcoming = upcomingSchedules(schedules, new Date());
  return (
    <Section
      id={RW_SECTION_IDS.schedule}
      eyebrow="Jadwal"
      title="Pertunjukan dan kegiatan terdekat"
      tone="muted"
    >
      {upcoming.length > 0 ? (
        <SchedulePreview schedules={upcoming} />
      ) : (
        <p className="text-body text-muted-foreground">{copy.rwPage.schedulesEmpty}</p>
      )}
      <SectionLink href={`${programme.path}/jadwal`} label={copy.rwPage.schedulesAll} />
    </Section>
  );
}

// Task P2.4.03.
export default async function Rw08Page() {
  const data = await getRwPageData(RW_ID);
  if (!data) notFound();
  return (
    <>
      <RwPage data={data} afterProfile={<ScheduleSection schedules={data.schedules} />} />
      <JsonLd data={rwAttractionJsonLd(data.unit)} />
    </>
  );
}
