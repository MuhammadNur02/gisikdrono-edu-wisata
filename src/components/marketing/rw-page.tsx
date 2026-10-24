import { RwAnchorNav, type RwAnchorLink } from '@/components/rw/rw-anchor-nav';
import { RwPackages, RwProducts } from '@/components/rw/rw-catalogue';
import { RwCta } from '@/components/rw/rw-cta';
import { RwGallery } from '@/components/rw/rw-gallery';
import { RwHero } from '@/components/rw/rw-hero';
import { RwPoints } from '@/components/rw/rw-points';
import { RwFacts, RwProfile } from '@/components/rw/rw-profile';
import { RwSchedule } from '@/components/rw/rw-schedule';
import { VISIT_CHAT_TOPIC } from '@/config/home';
import { BOOKING_CTA } from '@/config/nav';
import { rwAccentClasses } from '@/config/rw';
import { siteConfig } from '@/config/site';
import { copy } from '@/lib/copy/id';
import { rwPageCopy, type RwSectionKey } from '@/lib/copy/rw-page';
import { formatIDR } from '@/lib/utils/currency';
import { rwSchedulePath } from '@/lib/utils/paths';
import { planRwPhotos, rwGalleryPhotos, type RwPhotoPlan } from '@/lib/utils/rw-photos';
import { upcomingOccurrences } from '@/lib/utils/schedules';
import { buildWhatsAppChatUrl } from '@/lib/utils/whatsapp';
import type { RwPageData } from '@/types/rw-page';

// The section anchors docs/PRD.md FR-PUB-08 names, which other pages link to.
export const RW_SECTION_IDS = {
  profile: 'profil',
  schedule: 'jadwal',
  points: 'titik-aktivitas',
  gallery: 'galeri',
  products: 'produk',
  packages: 'paket',
} as const satisfies Record<string, RwSectionKey>;

// The id of the closing band.
const CTA_ID = 'pesan';

// The cheapest per-person price among the RW's packages, for `Mulai Rp35.000 / orang` in the anchor nav.
function navPrice(packages: RwPageData['packages']) {
  const prices = packages.flatMap((pkg) => {
    const price = pkg.lowestTierPrice ?? pkg.pricePerPax;
    return price === null ? [] : [price];
  });
  if (prices.length === 0) return undefined;
  return {
    text: rwPageCopy.navFrom(formatIDR(Math.min(...prices))),
    bookLabel: rwPageCopy.navBook,
    bookHref: BOOKING_CTA.href,
  };
}

// The sections this RW has rows for, in the page's order: a section without rows is left out whole, with its pill
// (docs/StyleGuide.md §6.9, FR-PUB-24).
function shownSections(data: RwPageData, photos: RwPhotoPlan): RwSectionKey[] {
  const { unit } = data;
  const sections: [RwSectionKey, boolean][] = [
    [RW_SECTION_IDS.profile, Boolean(unit.descriptionMd ?? unit.visionMd)],
    [RW_SECTION_IDS.schedule, unit.scheduleEnabled],
    [RW_SECTION_IDS.points, data.points.length > 0],
    [RW_SECTION_IDS.packages, data.packages.length > 0],
    [RW_SECTION_IDS.products, data.products.length > 0],
    [RW_SECTION_IDS.gallery, photos.mosaic.length > 0],
  ];
  return sections.flatMap(([key, isShown]) => (isShown ? [key] : []));
}

function anchorLinksOf(keys: readonly RwSectionKey[]): RwAnchorLink[] {
  return keys.map((key) => ({ id: key, label: rwPageCopy.nav[key] }));
}

interface PageParts {
  data: RwPageData;
  photos: RwPhotoPlan;
  has: (key: RwSectionKey) => boolean;
  chatUrl: string;
}

// Profile, facts, the schedule and the points: what the RW is.
function AboutSections({ data, photos, has, chatUrl }: PageParts) {
  const { unit } = data;
  return (
    <>
      {has(RW_SECTION_IDS.profile) ? (
        <RwProfile id={RW_SECTION_IDS.profile} unit={unit} photos={photos.profile} />
      ) : null}
      <RwFacts pointCount={data.points.length} packages={data.packages} sessions={data.sessions} />
      {has(RW_SECTION_IDS.schedule) ? (
        <RwSchedule
          id={RW_SECTION_IDS.schedule}
          occurrences={upcomingOccurrences(data.schedules, new Date())}
          allHref={rwSchedulePath(unit.slug)}
          chatUrl={chatUrl}
        />
      ) : null}
      {has(RW_SECTION_IDS.points) ? (
        <RwPoints id={RW_SECTION_IDS.points} points={data.points} photo={photos.points} />
      ) : null}
    </>
  );
}

// Packages, products and the gallery: what a group books and sees.
function VisitSections({ data, photos, has, chatUrl }: PageParts) {
  const { unit } = data;
  return (
    <>
      {has(RW_SECTION_IDS.packages) ? (
        <RwPackages
          id={RW_SECTION_IDS.packages}
          unit={unit}
          packages={data.packages}
          chatUrl={chatUrl}
        />
      ) : null}
      {has(RW_SECTION_IDS.products) ? (
        <RwProducts id={RW_SECTION_IDS.products} unit={unit} products={data.products} />
      ) : null}
      {has(RW_SECTION_IDS.gallery) ? (
        <RwGallery id={RW_SECTION_IDS.gallery} unit={unit} photos={photos.mosaic} />
      ) : null}
    </>
  );
}

// docs/PRD.md FR-PUB-08/09/24 in the template of DESIGN-SPEC §3.3: the photo hero, the sticky anchor nav, profile,
// facts, the schedule where the RW runs one, points, packages, products, the gallery mosaic and the closing band, all
// in the RW's accent (rw-scope-*). RW 08 has no package, product or schedule yet, so it is a profile page.
export function RwPage({ data }: { data: RwPageData }) {
  const { unit } = data;
  const photos = planRwPhotos(rwGalleryPhotos(data.gallery));
  const sections = shownSections(data, photos);
  const has = (key: RwSectionKey) => sections.includes(key);
  const chatUrl = buildWhatsAppChatUrl(
    data.whatsappNumber ?? siteConfig.whatsappContactNumber,
    copy.layout.whatsAppGreeting(VISIT_CHAT_TOPIC),
  );
  const isBookable = has(RW_SECTION_IDS.packages);
  const parts = { data, photos, has, chatUrl };
  return (
    <div className={rwAccentClasses(unit.accentKey).scope}>
      <RwHero
        unit={unit}
        isBookable={isBookable}
        packagesAnchor={RW_SECTION_IDS.packages}
        chatUrl={chatUrl}
      />
      <RwAnchorNav
        links={anchorLinksOf(sections)}
        label={rwPageCopy.navLabel}
        price={navPrice(data.packages)}
      />
      <AboutSections {...parts} />
      <VisitSections {...parts} />
      <RwCta id={CTA_ID} unit={unit} packagesAnchor={isBookable ? RW_SECTION_IDS.packages : null} />
    </div>
  );
}
