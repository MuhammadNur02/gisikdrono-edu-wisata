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
// Every RW page is built from the RWs online at build time (decision of 2026-10-21). Any other address at this level
// is a 404 without a database read, and is never cached as a page of its own; an RW added later needs a new build
// until the superadmin's RW page makes it reachable on its own (Task P4.9.03).
export const dynamicParams = false;

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
