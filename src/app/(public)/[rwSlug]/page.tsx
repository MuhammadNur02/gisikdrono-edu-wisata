import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { RwPage } from '@/components/marketing/rw-page';
import { JsonLd } from '@/components/seo/json-ld';
import { getRwPageData } from '@/lib/queries/rw-page';
import { getRwUnitBySlug, listRwUnits } from '@/lib/queries/rw-units';
import { rwAttractionJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { isRwSlug } from '@/lib/utils/paths';

export const revalidate = 3600;
// Built for the RWs online at build time, and rendered on demand for one taken online later: the menu, the sitemap
// and the home page list RWs from rw_units, so their links must not wait for a release (independent review of Task
// P2.10.02, M1). An address that is not an RW slug is a 404 before any read; any other is looked up in the one cached
// list of RWs (getRwUnitBySlug).
export const dynamicParams = true;

interface RwUnitPageProps {
  params: Promise<{ rwSlug: string }>;
}

export async function generateStaticParams(): Promise<{ rwSlug: string }[]> {
  return (await listRwUnits()).map((unit) => ({ rwSlug: unit.slug }));
}

export async function generateMetadata({ params }: RwUnitPageProps): Promise<Metadata> {
  const { rwSlug } = await params;
  const unit = isRwSlug(rwSlug) ? await getRwUnitBySlug(rwSlug) : null;
  if (!unit) return {};
  return buildPageMetadata({
    title: unit.name,
    description: unit.tagline ?? undefined,
    path: unit.path,
  });
}

// docs/PRD.md FR-PUB-08/09, Tasks P2.4.02, P2.4.03 and P2.10.02: one page for every RW, from rw_units.
export default async function RwUnitPage({ params }: RwUnitPageProps) {
  const { rwSlug } = await params;
  const data = isRwSlug(rwSlug) ? await getRwPageData(rwSlug) : null;
  if (!data) notFound();
  return (
    <>
      <RwPage data={data} />
      <JsonLd data={rwAttractionJsonLd(data.unit)} />
    </>
  );
}
