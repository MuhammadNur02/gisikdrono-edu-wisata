import type { Metadata } from 'next';

import { BookletCta } from '@/components/marketing/booklet-cta';
import { CtaBand } from '@/components/marketing/cta-band';
import { FeaturedPackages } from '@/components/marketing/featured-packages';
import { FeaturedProducts } from '@/components/marketing/featured-products';
import { Hero } from '@/components/marketing/hero';
import { LatestArticles } from '@/components/marketing/latest-articles';
import { MapTeaser } from '@/components/marketing/map-teaser';
import { RwHighlight } from '@/components/marketing/rw-highlight';
import { Testimonials } from '@/components/marketing/testimonials';
import { JsonLd } from '@/components/seo/json-ld';
import { getHomePageData } from '@/lib/queries/home-page';
import { rwAttractionJsonLd, webSiteJsonLd } from '@/lib/seo/json-ld';

export const revalidate = 3600;

export const metadata: Metadata = { alternates: { canonical: '/' } };

// Anchors within the page; `Lihat Paket` in the hero scrolls to the featured packages.
const SECTION_IDS = {
  rw: 'program',
  packages: 'paket-unggulan',
  products: 'produk-unggulan',
  map: 'peta',
  reviews: 'ulasan',
  articles: 'artikel',
  booklets: 'e-booklet',
  booking: 'pesan',
} as const;

// docs/PRD.md FR-PUB-01..07. A section with nothing published is left out rather than filled with a
// stand-in (docs/StyleGuide.md §1.3 G5); the reviews band in particular waits for real reviews.
export default async function HomePage() {
  const data = await getHomePageData();
  const hasPackages = data.featuredPackages.length > 0;
  return (
    <>
      <Hero
        slides={data.slides}
        ratingSummary={data.ratingSummary}
        description={data.description}
        packagesAnchor={hasPackages ? SECTION_IDS.packages : undefined}
      />
      <RwHighlight id={SECTION_IDS.rw} units={data.rwUnits} />
      {hasPackages ? (
        <FeaturedPackages id={SECTION_IDS.packages} packages={data.featuredPackages} />
      ) : null}
      {data.featuredProducts.length > 0 ? (
        <FeaturedProducts id={SECTION_IDS.products} products={data.featuredProducts} />
      ) : null}
      {data.points.length > 0 || data.address ? (
        <MapTeaser
          id={SECTION_IDS.map}
          address={data.address}
          points={data.points}
          units={data.rwUnits}
        />
      ) : null}
      {data.testimonials.length > 0 ? (
        <Testimonials id={SECTION_IDS.reviews} reviews={data.testimonials} />
      ) : null}
      {data.articles.length > 0 ? (
        <LatestArticles id={SECTION_IDS.articles} articles={data.articles} />
      ) : null}
      {data.booklets.length > 0 ? (
        <BookletCta id={SECTION_IDS.booklets} booklets={data.booklets} />
      ) : null}
      <CtaBand id={SECTION_IDS.booking} />
      <JsonLd data={[webSiteJsonLd(), ...data.rwUnits.map(rwAttractionJsonLd)]} />
    </>
  );
}
