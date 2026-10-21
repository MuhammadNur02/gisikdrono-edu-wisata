import type { ReactNode } from 'react';

import { MasonryGrid } from '@/components/gallery/masonry-grid';
import { PageHeader } from '@/components/layout/page-header';
import { RwEyebrow } from '@/components/layout/rw-eyebrow';
import { Section, type SectionTone } from '@/components/layout/section';
import { ActivityPointList } from '@/components/map/activity-point-list';
import { Photo } from '@/components/marketing/photo';
import { ScheduleList } from '@/components/marketing/schedule-list';
import { SectionLink } from '@/components/marketing/section-link';
import { TextBlock } from '@/components/marketing/text-block';
import { PackageGrid } from '@/components/packages/package-grid';
import { ProductGrid } from '@/components/products/product-grid';
import { galleryFilterForRw } from '@/config/gallery';
import { IMAGE_SIZES } from '@/config/images';
import { rwAccentClasses } from '@/config/rw';
import { RW_ICONS } from '@/config/rw-icons';
import { copy } from '@/lib/copy/id';
import { galleryPath } from '@/lib/utils/gallery-search';
import { rwSchedulePath } from '@/lib/utils/paths';
import { upcomingOccurrences } from '@/lib/utils/schedules';
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

// An RW whose shop is mostly something else names it in rw_units.products_heading (the arts programme's souvenirs).
const DEFAULT_PRODUCTS_HEADING = 'Produk UMKM';
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
  return (
    <PageHeader
      eyebrow={<RwEyebrow rw={unit} withName />}
      title={unit.name}
      titleAccent={{ text: unit.shortName, className: rwAccentClasses(unit.accentKey).text }}
      titleSize="display"
      description={unit.tagline ?? unit.themeLabel}
      breadcrumbs={[]}
      path={unit.path}
    >
      <Photo
        image={unit.heroImage}
        caption={unit.name}
        placeholder={{ icon: RW_ICONS[unit.iconKey], rws: [unit] }}
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

// docs/PRD.md FR-PUB-09: for an RW that runs a performance schedule, the next five performances, recurring ones
// spelled out, checked when the page renders (hourly ISR). With none ahead the section is left out, like every empty
// public section.
function scheduleSection(data: RwPageData): RwSectionContent {
  const upcoming = upcomingOccurrences(data.schedules, new Date());
  return {
    id: RW_SECTION_IDS.schedule,
    eyebrow: 'Jadwal',
    title: 'Pertunjukan dan kegiatan terdekat',
    content:
      upcoming.length > 0 ? (
        <>
          <ScheduleList occurrences={upcoming} />
          <SectionLink href={rwSchedulePath(data.unit.slug)} label={copy.rwPage.schedulesAll} />
        </>
      ) : null,
  };
}

function galleryContent(data: RwPageData): ReactNode {
  if (data.gallery.length === 0) return null;
  return (
    <>
      <MasonryGrid items={data.gallery} />
      <SectionLink
        href={galleryPath({ filter: galleryFilterForRw(data.unit.id), page: 1 })}
        label={copy.rwPage.galleryAll(data.unit.label)}
      />
    </>
  );
}

// The collections in the order of docs/PRD.md FR-PUB-08.
function collectionSections(data: RwPageData): RwSectionContent[] {
  const { label, productsHeading } = data.unit;
  return [
    {
      id: RW_SECTION_IDS.points,
      title: `Titik aktivitas ${label}`,
      content: data.points.length > 0 ? <ActivityPointList points={data.points} /> : null,
    },
    { id: RW_SECTION_IDS.gallery, title: `Galeri ${label}`, content: galleryContent(data) },
    {
      id: RW_SECTION_IDS.products,
      title: `${productsHeading ?? DEFAULT_PRODUCTS_HEADING} ${label}`,
      content: data.products.length > 0 ? <ProductGrid products={data.products} /> : null,
    },
    {
      id: RW_SECTION_IDS.packages,
      title: `Paket kunjungan ${label}`,
      content: data.packages.length > 0 ? <PackageGrid packages={data.packages} /> : null,
    },
  ];
}

// docs/PRD.md FR-PUB-08/09: the header, then profile, the schedule where the RW runs one, and the RW's points,
// gallery, products and packages. A section the CMS has nothing for is left out entirely; whether every RW has its
// profile before launch is a go-live check (docs/Security.md §13.1 #22), not a note on the page.
export function RwPage({ data }: { data: RwPageData }) {
  const sections: RwSectionContent[] = [
    {
      id: RW_SECTION_IDS.profile,
      eyebrow: data.unit.themeLabel,
      title: `Profil ${data.unit.label}`,
      content: profileContent(data.unit),
    },
    ...(data.unit.scheduleEnabled ? [scheduleSection(data)] : []),
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
