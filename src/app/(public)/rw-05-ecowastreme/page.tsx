import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { RwPage } from '@/components/marketing/rw-page';
import { JsonLd } from '@/components/seo/json-ld';
import { RW_PROGRAMMES } from '@/config/rw';
import { getRwPageData } from '@/lib/queries/rw-page';
import { getRwUnitBySlug } from '@/lib/queries/rw-units';
import { rwAttractionJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const revalidate = 3600;

const RW_ID = 5;
const programme = RW_PROGRAMMES[RW_ID];

export async function generateMetadata(): Promise<Metadata> {
  const unit = await getRwUnitBySlug(programme.slug);
  return buildPageMetadata({
    title: unit?.name ?? `${programme.label} ${programme.name}`,
    description: unit?.tagline ?? undefined,
    path: programme.path,
  });
}

// docs/PRD.md FR-PUB-08, Task P2.4.02.
export default async function Rw05Page() {
  const data = await getRwPageData(RW_ID);
  if (!data) notFound();
  return (
    <>
      <RwPage data={data} />
      <JsonLd data={rwAttractionJsonLd(data.unit)} />
    </>
  );
}
