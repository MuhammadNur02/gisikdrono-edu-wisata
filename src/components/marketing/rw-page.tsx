import type { ReactNode } from 'react';

import { GalleryPreview } from '@/components/gallery/gallery-preview';
import { PageHeader } from '@/components/layout/page-header';
import { RwEyebrow } from '@/components/layout/rw-eyebrow';
import { Section, type SectionTone } from '@/components/layout/section';
import { ActivityPointList } from '@/components/map/activity-point-list';
import { Photo } from '@/components/marketing/photo';
import { SectionLink } from '@/components/marketing/section-link';
import { TextBlock } from '@/components/marketing/text-block';
import { PackageGrid } from '@/components/packages/package-grid';
import { ProductGrid } from '@/components/products/product-grid';
import { IMAGE_SIZES } from '@/config/images';
import { RW_ACCENTS, RW_PROGRAMMES, type RwId } from '@/config/rw';
import { copy } from '@/lib/copy/id';
import type { RwPageData } from '@/types/rw-page';
import type { RwUnitProfile } from '@/types/rw-unit';

// The section anchors docs/PRD.md FR-PUB-08 names, which other pages link to.
export const RW_SECTION_IDS = {
  profile: 'profil',
  schedule: 'jadwal',
  points: 'titik-aktivitas',
  gallery: 'galeri',
  products: 'produk',
  packages: 'paket',
} as const;

// The gallery filter of docs/PRD.md FR-PUB-14 for each RW.
const GALLERY_FILTER: Record<RwId, string> = { 5: 'rw05', 8: 'rw08' };
// RW 08 sells mostly souvenirs from its sanggar (Task P2.4.03); the heading says so only there.
const PRODUCTS_TITLE: Record<RwId, string> = {
  5: 'Produk UMKM RW 05',
  8: 'Suvenir dan produk UMKM RW 08',
};
// Sections alternate default and muted (docs/StyleGuide.md §5.7), counted over the ones shown.
const SECTION_TONES: readonly SectionTone[] = ['default', 'muted'];

export interface RwSectionContent {
  id: string;
  title: string;
  eyebrow?: string;
  // NULL while the CMS has nothing for the section; the page then leaves it out whole, heading included
  // (docs/StyleGuide.md §6.9).
  content: ReactNode;
}

// The RW's header stays even without a photo: it is the page itself, and the slot shows the placeholder (G1).
function RwHeader({ unit }: { unit: RwUnitProfile }) {
  const programme = RW_PROGRAMMES[unit.id];
  return (
    <PageHeader
      eyebrow={<RwEyebrow rwId={unit.id} withName />}
      title={unit.name}
      titleAccent={{ text: programme.name, className: RW_ACCENTS[unit.id].text }}
      titleSize="display"
      description={unit.tagline ?? unit.themeLabel}
      breadcrumbs={[]}
      path={programme.path}
    >
      <Photo
        image={unit.heroImage}
        caption={unit.name}
        placeholder={{ icon: programme.icon, rwIds: [unit.id] }}
        sizes={IMAGE_SIZES.hero}
        aspectClassName="aspect-4/3 md:aspect-video"
        priority
      />
    </PageHeader>
  );
}

function profileContent(unit: RwUnitProfile): ReactNode {
  if (!unit.descriptionMd && !unit.visionMd) return null;
  return (
    <div className="grid gap-8 lg:grid-cols-3">
      {unit.descriptionMd ? (
        <TextBlock text={unit.descriptionMd} className="lg:col-span-2" />
      ) : null}
      {unit.visionMd ? (
        <aside className="space-y-3 rounded-xl border border-border bg-card p-5 md:p-6 dark:border-white/5">
          <h3 className="text-h4">{copy.rwPage.visionTitle}</h3>
          <TextBlock text={unit.visionMd} className="text-body" />
        </aside>
      ) : null}
    </div>
  );
}

function galleryContent(data: RwPageData): ReactNode {
  if (data.gallery.length === 0) return null;
  const rwId = data.unit.id;
  return (
    <>
      <GalleryPreview items={data.gallery} />
      <SectionLink
        href={`/galeri?filter=${GALLERY_FILTER[rwId]}`}
        label={copy.rwPage.galleryAll(RW_PROGRAMMES[rwId].label)}
      />
    </>
  );
}

// The collections in the order of docs/PRD.md FR-PUB-08.
function collectionSections(data: RwPageData): RwSectionContent[] {
  const label = RW_PROGRAMMES[data.unit.id].label;
  return [
    {
      id: RW_SECTION_IDS.points,
      title: `Titik aktivitas ${label}`,
      content: data.points.length > 0 ? <ActivityPointList points={data.points} /> : null,
    },
    { id: RW_SECTION_IDS.gallery, title: `Galeri ${label}`, content: galleryContent(data) },
    {
      id: RW_SECTION_IDS.products,
      title: PRODUCTS_TITLE[data.unit.id],
      content: data.products.length > 0 ? <ProductGrid products={data.products} /> : null,
    },
    {
      id: RW_SECTION_IDS.packages,
      title: `Paket kunjungan ${label}`,
      content: data.packages.length > 0 ? <PackageGrid packages={data.packages} /> : null,
    },
  ];
}

export interface RwPageProps {
  data: RwPageData;
  // A section of the RW's own, placed after the profile: RW 08's performance schedule.
  afterProfile?: RwSectionContent;
}

// docs/PRD.md FR-PUB-08/09: the header, then profile and the RW's points, gallery, products and packages.
// A section the CMS has nothing for is left out entirely; whether every RW has its profile before launch is a
// go-live check (docs/Security.md §13.1 #22), not a note on the page.
export function RwPage({ data, afterProfile }: RwPageProps) {
  const label = RW_PROGRAMMES[data.unit.id].label;
  const sections: RwSectionContent[] = [
    {
      id: RW_SECTION_IDS.profile,
      eyebrow: data.unit.themeLabel,
      title: `Profil ${label}`,
      content: profileContent(data.unit),
    },
    ...(afterProfile ? [afterProfile] : []),
    ...collectionSections(data),
  ];
  const shown = sections.filter((section) => section.content !== null);
  return (
    <>
      <RwHeader unit={data.unit} />
      {shown.map(({ content, ...section }, index) => (
        <Section key={section.id} tone={SECTION_TONES[index % SECTION_TONES.length]} {...section}>
          {content}
        </Section>
      ))}
    </>
  );
}
