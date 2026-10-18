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

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-body text-muted-foreground">{children}</p>;
}

function RwHeader({ data }: { data: RwPageData }) {
  const { unit } = data;
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
        sizes={IMAGE_SIZES.hero}
        aspectClassName="aspect-4/3 md:aspect-video"
        priority
      />
    </PageHeader>
  );
}

function ProfileSection({ data }: { data: RwPageData }) {
  const { unit } = data;
  const label = RW_PROGRAMMES[unit.id].label;
  return (
    <Section id={RW_SECTION_IDS.profile} eyebrow={unit.themeLabel} title={`Profil ${label}`}>
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {unit.descriptionMd ? (
            <TextBlock text={unit.descriptionMd} />
          ) : (
            <EmptyNote>{copy.rwPage.profileEmpty(label)}</EmptyNote>
          )}
        </div>
        <aside className="space-y-3 rounded-xl border border-border bg-card p-5 md:p-6 dark:border-white/5">
          <h3 className="text-h4">{copy.rwPage.visionTitle}</h3>
          {unit.visionMd ? (
            <TextBlock text={unit.visionMd} className="text-body" />
          ) : (
            <EmptyNote>{copy.rwPage.visionEmpty(label)}</EmptyNote>
          )}
        </aside>
      </div>
    </Section>
  );
}

interface RwSectionProps {
  id: string;
  title: string;
  tone: SectionTone;
  emptyNote: string;
  // NULL while the CMS has nothing for the section; the note shows instead.
  children: ReactNode;
}

function RwSection({ id, title, tone, emptyNote, children }: RwSectionProps) {
  return (
    <Section id={id} title={title} tone={tone}>
      {children ?? <EmptyNote>{emptyNote}</EmptyNote>}
    </Section>
  );
}

function GallerySection({ data }: { data: RwPageData }) {
  const rwId = data.unit.id;
  const label = RW_PROGRAMMES[rwId].label;
  return (
    <>
      <GalleryPreview items={data.gallery} />
      <SectionLink
        href={`/galeri?filter=${GALLERY_FILTER[rwId]}`}
        label={copy.rwPage.galleryAll(label)}
      />
    </>
  );
}

// The four collections in the order of docs/PRD.md FR-PUB-08, each NULL while it is empty.
function collectionSections(data: RwPageData): Omit<RwSectionProps, 'tone'>[] {
  const label = RW_PROGRAMMES[data.unit.id].label;
  return [
    {
      id: RW_SECTION_IDS.points,
      title: `Titik aktivitas ${label}`,
      emptyNote: copy.rwPage.pointsEmpty(label),
      children: data.points.length > 0 ? <ActivityPointList points={data.points} /> : null,
    },
    {
      id: RW_SECTION_IDS.gallery,
      title: `Galeri ${label}`,
      emptyNote: copy.rwPage.galleryEmpty(label),
      children: data.gallery.length > 0 ? <GallerySection data={data} /> : null,
    },
    {
      id: RW_SECTION_IDS.products,
      title: PRODUCTS_TITLE[data.unit.id],
      emptyNote: copy.rwPage.productsEmpty(label),
      children: data.products.length > 0 ? <ProductGrid products={data.products} /> : null,
    },
    {
      id: RW_SECTION_IDS.packages,
      title: `Paket kunjungan ${label}`,
      emptyNote: copy.rwPage.packagesEmpty(label),
      children: data.packages.length > 0 ? <PackageGrid packages={data.packages} /> : null,
    },
  ];
}

// Tones alternate from whichever follows the section before (docs/StyleGuide.md §5.7).
function CollectionSections({ data, firstTone }: { data: RwPageData; firstTone: SectionTone }) {
  const tones: SectionTone[] = [firstTone, firstTone === 'muted' ? 'default' : 'muted'];
  return collectionSections(data).map((section, index) => (
    <RwSection key={section.id} tone={tones[index % tones.length] ?? firstTone} {...section} />
  ));
}

export interface RwPageProps {
  data: RwPageData;
  // A section of the RW's own, placed after the profile: RW 08's performance schedule.
  afterProfile?: ReactNode;
}

// docs/PRD.md FR-PUB-08/09: profile, then the RW's points, gallery, products and packages. Every section
// stays, with a plain note while the CMS has nothing for it, so the anchors other pages link to always land.
export function RwPage({ data, afterProfile }: RwPageProps) {
  return (
    <>
      <RwHeader data={data} />
      <ProfileSection data={data} />
      {afterProfile}
      <CollectionSections data={data} firstTone={afterProfile ? 'default' : 'muted'} />
    </>
  );
}
