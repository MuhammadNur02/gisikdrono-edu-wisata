import type { Metadata } from 'next';

import { CtaBand } from '@/components/marketing/cta-band';
import { FeaturedPackages } from '@/components/marketing/featured-packages';
import { FeaturedProducts } from '@/components/marketing/featured-products';
import { GalleryStrip } from '@/components/marketing/gallery-strip';
import { Hero } from '@/components/marketing/hero';
import { LatestArticles } from '@/components/marketing/latest-articles';
import { MapContact } from '@/components/marketing/map-contact';
import { RwBento } from '@/components/marketing/rw-bento';
import { Testimonials } from '@/components/marketing/testimonials';
import { WhyVisit } from '@/components/marketing/why-visit';
import { JsonLd } from '@/components/seo/json-ld';
import { HOME_RW_SECTION_ID } from '@/config/nav';
import { getHomePageData } from '@/lib/queries/home-page';
import { rwAttractionJsonLd, webSiteJsonLd } from '@/lib/seo/json-ld';
import type { HomePageData } from '@/types/home-page';

export const revalidate = 3600;

export const metadata: Metadata = { alternates: { canonical: '/' } };

// Anchors within the page; `Lihat Paket` in the hero scrolls to the featured packages.
const SECTION_IDS = {
  rw: HOME_RW_SECTION_ID,
  packages: 'paket-unggulan',
  why: 'mengapa',
  gallery: 'galeri',
  reviews: 'ulasan',
  products: 'produk-unggulan',
  articles: 'artikel',
  map: 'peta',
  booking: 'pesan',
} as const;

// Below the photo band the gallery strip shows the rest of the captioned photos.
function GallerySection({ photos }: { photos: HomePageData['gallery'] }) {
  const stripPhotos = photos.slice(1);
  return stripPhotos.length > 0 ? <GalleryStrip id={SECTION_IDS.gallery} photos={stripPhotos} /> : null;
}

// The sections after Why visit, each left out while it has nothing published.
function CommunitySections({ data }: { data: HomePageData }) {
  return (
    <>
      <GallerySection photos={data.gallery} />
      {data.testimonials.length > 0 ? (
        <Testimonials id={SECTION_IDS.reviews} reviews={data.testimonials} />
      ) : null}
      {data.featuredProducts.length > 0 ? (
        <FeaturedProducts id={SECTION_IDS.products} products={data.featuredProducts} />
      ) : null}
      {data.articles.length > 0 ? (
        <LatestArticles id={SECTION_IDS.articles} articles={data.articles} />
      ) : null}
      <MapContact
        id={SECTION_IDS.map}
        address={data.address}
        points={data.points}
        units={data.rwUnits}
        booklets={data.booklets}
      />
    </>
  );
}

// docs/PRD.md FR-PUB-01..07, in the order of the redesign of 2026-10-23: hero, RW mosaic, featured packages, why
// visit, gallery, reviews, UMKM, articles, map and contact, CTA band. A section with nothing published is left out
// rather than filled with a stand-in (docs/StyleGuide.md §1.3 G5). The map and contact block always has the
// WhatsApp line, so it always shows.
export default async function HomePage() {
  const data = await getHomePageData();
  const hasPackages = data.featuredPackages.length > 0;
  return (
    <>
      <Hero
        slides={data.slides}
        description={data.description}
        packagesAnchor={hasPackages ? SECTION_IDS.packages : undefined}
      />
      <RwBento id={SECTION_IDS.rw} units={data.rwUnits} />
      {hasPackages ? (
        <FeaturedPackages id={SECTION_IDS.packages} packages={data.featuredPackages} />
      ) : null}
      <WhyVisit
        id={SECTION_IDS.why}
        rwCount={data.rwUnits.length}
        stats={data.stats}
        bandPhoto={data.gallery[0] ?? null}
      />
      <CommunitySections data={data} />
      <CtaBand id={SECTION_IDS.booking} />
      <JsonLd data={[webSiteJsonLd(), ...data.rwUnits.map(rwAttractionJsonLd)]} />
    </>
  );
}
