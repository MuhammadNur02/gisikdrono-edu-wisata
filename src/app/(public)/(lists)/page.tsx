import type { Metadata } from 'next';

import { CtaBand } from '@/components/marketing/cta-band';
import { FeaturedPackages } from '@/components/marketing/featured-packages';
import { FeaturedProducts } from '@/components/marketing/featured-products';
import { GalleryStrip } from '@/components/marketing/gallery-strip';
import { Hero } from '@/components/marketing/hero';
import { HomeIntro } from '@/components/marketing/home-intro';
import { LatestArticles } from '@/components/marketing/latest-articles';
import { MapContact } from '@/components/marketing/map-contact';
import { PhotoBand } from '@/components/marketing/photo-band';
import { RwBento } from '@/components/marketing/rw-bento';
import { Testimonials } from '@/components/marketing/testimonials';
import { WhyVisit } from '@/components/marketing/why-visit';
import { JsonLd } from '@/components/seo/json-ld';
import { VISIT_CHAT_TOPIC } from '@/config/home';
import { HOME_RW_SECTION_ID } from '@/config/nav';
import type { RwId } from '@/config/rw';
import { siteConfig } from '@/config/site';
import { copy } from '@/lib/copy/id';
import { getHomePageData } from '@/lib/queries/home-page';
import { getPublicSiteSettings, isPlaceholderSetting } from '@/lib/queries/settings';
import { rwAttractionJsonLd, webSiteJsonLd } from '@/lib/seo/json-ld';
import { buildHomeMetadata } from '@/lib/seo/metadata';
import { splitHomePhotos } from '@/lib/utils/home-gallery';
import { buildWhatsAppChatUrl } from '@/lib/utils/whatsapp';
import type { HomePageData } from '@/types/home-page';

export const revalidate = 3600;

// Task P5.6.02: the description is the kelurahan's own text from site_settings, never a sample one.
export async function generateMetadata(): Promise<Metadata> {
  const { seoDefaultDescription } = await getPublicSiteSettings();
  const isWritten =
    seoDefaultDescription.trim() !== '' && !isPlaceholderSetting(seoDefaultDescription);
  return buildHomeMetadata(isWritten ? seoDefaultDescription : undefined);
}

// Anchors within the page; `Lihat Paket` in the introduction scrolls to the featured packages.
const SECTION_IDS = {
  intro: 'tentang',
  rw: HOME_RW_SECTION_ID,
  packages: 'paket-unggulan',
  why: 'mengapa',
  band: 'budaya',
  gallery: 'galeri',
  reviews: 'ulasan',
  products: 'produk-unggulan',
  articles: 'artikel',
  map: 'peta',
  booking: 'pesan',
} as const;

function pointCountsOf(points: HomePageData['points']): Map<RwId, number> {
  const counts = new Map<RwId, number>();
  for (const point of points) counts.set(point.rwId, (counts.get(point.rwId) ?? 0) + 1);
  return counts;
}

// The photo band, then the marquee with the other captioned photos.
function PhotoSections({ data }: { data: HomePageData }) {
  const cultureRwId = data.rwUnits.find((unit) => unit.scheduleEnabled)?.id ?? null;
  const { band, strip } = splitHomePhotos(data.gallery, cultureRwId);
  return (
    <>
      {band ? <PhotoBand id={SECTION_IDS.band} photo={band} /> : null}
      {strip.length > 0 ? <GalleryStrip id={SECTION_IDS.gallery} photos={strip} /> : null}
    </>
  );
}

// The sections after the photos, each left out while it has nothing published. The map and contact block always has
// the WhatsApp line, so it always shows.
function CommunitySections({ data }: { data: HomePageData }) {
  const chatUrl = buildWhatsAppChatUrl(
    data.whatsappNumber ?? siteConfig.whatsappContactNumber,
    copy.layout.whatsAppGreeting(VISIT_CHAT_TOPIC),
  );
  return (
    <>
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
        units={data.rwUnits}
        sessions={data.sessions}
        booklets={data.booklets}
        chatUrl={chatUrl}
      />
    </>
  );
}

// docs/PRD.md FR-PUB-01..07 in the order of DESIGN-SPEC §3.1 (approved 2026-10-24): hero, introduction, the kampung
// mosaic, featured packages, why visit with its figures, the photo band, the gallery marquee, reviews, UMKM products,
// articles, map and contact, the closing CTA band. A section with nothing published is left out rather than filled
// with a stand-in (docs/StyleGuide.md §1.3 G5).
export default async function HomePage() {
  const data = await getHomePageData();
  const hasPackages = data.featuredPackages.length > 0;
  return (
    <>
      <Hero slides={data.slides} description={data.description} />
      <HomeIntro
        id={SECTION_IDS.intro}
        packagesAnchor={hasPackages ? SECTION_IDS.packages : undefined}
        address={data.address}
      />
      <RwBento
        id={SECTION_IDS.rw}
        units={data.rwUnits}
        pointCounts={pointCountsOf(data.points)}
        bookableRwIds={data.bookableRwIds}
      />
      {hasPackages ? (
        <FeaturedPackages id={SECTION_IDS.packages} packages={data.featuredPackages} />
      ) : null}
      <WhyVisit id={SECTION_IDS.why} units={data.rwUnits} pointCount={data.points.length} />
      <PhotoSections data={data} />
      <CommunitySections data={data} />
      <CtaBand id={SECTION_IDS.booking} />
      <JsonLd data={[webSiteJsonLd(), ...data.rwUnits.map(rwAttractionJsonLd)]} />
    </>
  );
}
