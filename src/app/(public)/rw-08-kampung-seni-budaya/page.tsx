import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { RW_SECTION_IDS, RwPage, type RwSectionContent } from '@/components/marketing/rw-page';
import { ScheduleList } from '@/components/marketing/schedule-list';
import { SectionLink } from '@/components/marketing/section-link';
import { JsonLd } from '@/components/seo/json-ld';
import { RW_PROGRAMMES } from '@/config/rw';
import { copy } from '@/lib/copy/id';
import { getRwPageData } from '@/lib/queries/rw-page';
import { getRwUnitBySlug } from '@/lib/queries/rw-units';
import { rwAttractionJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { upcomingOccurrences } from '@/lib/utils/schedules';
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

// docs/PRD.md FR-PUB-09: the next five performances, recurring ones spelled out, checked when the page renders
// (hourly ISR). With none ahead the section is left out, like every empty public section.
function scheduleSection(schedules: PerformanceSchedule[]): RwSectionContent {
  const upcoming = upcomingOccurrences(schedules, new Date());
  return {
    id: RW_SECTION_IDS.schedule,
    eyebrow: 'Jadwal',
    title: 'Pertunjukan dan kegiatan terdekat',
    content:
      upcoming.length > 0 ? (
        <>
          <ScheduleList occurrences={upcoming} />
          <SectionLink href={`${programme.path}/jadwal`} label={copy.rwPage.schedulesAll} />
        </>
      ) : null,
  };
}

// Task P2.4.03.
export default async function Rw08Page() {
  const data = await getRwPageData(RW_ID);
  if (!data) notFound();
  return (
    <>
      <RwPage data={data} afterProfile={scheduleSection(data.schedules)} />
      <JsonLd data={rwAttractionJsonLd(data.unit)} />
    </>
  );
}
