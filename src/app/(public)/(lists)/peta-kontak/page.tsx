import type { Metadata } from 'next';

import { Container } from '@/components/layout/container';
import { SectionHeading } from '@/components/layout/section-heading';
import { ContactCards } from '@/components/map/contact-cards';
import { GoogleMapEmbed } from '@/components/map/google-map-embed';
import { PlanEmptyState } from '@/components/map/plan-empty-state';
import { RwAreaExplorer } from '@/components/map/rw-area-explorer';
import { SiteMap } from '@/components/map/site-map';
import { JsonLd } from '@/components/seo/json-ld';
import { ARTS_KAMPUNG_STREET, VISIT_CHAT_TOPIC } from '@/config/home';
import { RW_AREA_MAP } from '@/config/rw-areas';
import { siteConfig } from '@/config/site';
import { copy } from '@/lib/copy/id';
import { mapCopy } from '@/lib/copy/map';
import { listActivityPoints } from '@/lib/queries/activity-points';
import { listRwUnits } from '@/lib/queries/rw-units';
import { getSessionSummary } from '@/lib/queries/session-summary';
import { getPublicSiteSettings } from '@/lib/queries/settings';
import { governmentOrganizationJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import {
  googleMapsDirectionsUrl,
  googleMapsEmbedUrl,
  googleMapsPlaceUrl,
  type GeoPoint,
} from '@/lib/utils/geo';
import { buildGeoMarkers, mapCentreOf } from '@/lib/utils/geo-markers';
import { PUBLIC_PATHS } from '@/lib/utils/paths';
import { buildRwAreaSummaries } from '@/lib/utils/rw-area-summaries';
import type { SessionSummary } from '@/lib/utils/session-summary';
import { buildWhatsAppChatUrl } from '@/lib/utils/whatsapp';
import type { ActivityPoint } from '@/types/activity-point';
import type { RwUnitProfile } from '@/types/rw-unit';
import type { PublicSiteSettings } from '@/types/settings';

export const revalidate = 3600;

const TITLE = 'Peta & kontak';
const DESCRIPTION = `Peta wilayah RW, denah titik aktivitas, dan cara menghubungi ${siteConfig.ownerName}.`;

export const metadata: Metadata = buildPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PUBLIC_PATHS.map,
});

const SECTION_IDS = { areas: 'wilayah', geo: 'lokasi' } as const;

// The office point of the kelurahan's own map, the route's destination when site_settings holds no address yet.
const OFFICE_POINT: GeoPoint = {
  lat: RW_AREA_MAP.office.position[1],
  lng: RW_AREA_MAP.office.position[0],
};

function PageHeading() {
  return (
    <div className="max-w-180 space-y-4">
      <h1 className="text-display text-balance">{TITLE}</h1>
      <p className="text-body-lg text-pretty text-ink-2">{mapCopy.pageLead}</p>
    </div>
  );
}

function ListHeading() {
  return (
    <SectionHeading
      titleId="daftar-titik-judul"
      eyebrow={mapCopy.pointsListEyebrow}
      title={mapCopy.pointsListTitle}
      description={mapCopy.pointsListDescription}
      size="compact"
    />
  );
}

function PlanView({
  points,
  units,
}: {
  points: readonly ActivityPoint[];
  units: readonly RwUnitProfile[];
}) {
  if (points.length === 0) return <PlanEmptyState />;
  return (
    <div className="space-y-2">
      <SiteMap points={points} units={units} />
      <p className="text-caption text-muted-foreground">{mapCopy.planProvisional}</p>
    </div>
  );
}

// `Kampung Budaya & Seni: Jl. Jatisari, RW 13`, while the arts kampung is online.
function artsLineOf(units: readonly RwUnitProfile[]): string | null {
  const arts = units.find((unit) => unit.scheduleEnabled);
  return arts ? mapCopy.artsStreet(arts.shortName, ARTS_KAMPUNG_STREET, arts.label) : null;
}

async function readPage() {
  const [points, units, settings] = await Promise.all([
    listActivityPoints(),
    listRwUnits(),
    getPublicSiteSettings(),
  ]);
  const sessions = await getSessionSummary(units.map((unit) => unit.id));
  return { points, units, settings, sessions };
}

interface ContactProps {
  settings: PublicSiteSettings;
  units: readonly RwUnitProfile[];
  sessions: SessionSummary;
  whatsappNumber: string;
}

function Contact({ settings, units, sessions, whatsappNumber }: ContactProps) {
  const greeting = copy.layout.whatsAppGreeting(VISIT_CHAT_TOPIC);
  return (
    <Container className="pb-14 md:pb-20 lg:pb-28">
      <ContactCards
        address={settings.kelurahanAddress ?? siteConfig.ownerName}
        artsLine={artsLineOf(units)}
        email={settings.contactEmail}
        placeUrl={googleMapsDirectionsUrl(settings.kelurahanAddress ?? OFFICE_POINT)}
        chatUrl={buildWhatsAppChatUrl(whatsappNumber, greeting)}
        greeting={greeting}
        sessions={sessions}
      />
    </Container>
  );
}

// docs/PRD.md FR-PUB-18: Google's map, loaded only once the visitor asks for it.
function GoogleSection({ centre }: { centre: GeoPoint }) {
  return (
    <section id={SECTION_IDS.geo} aria-labelledby="lokasi-judul" className="py-14 md:py-20">
      <Container className="grid gap-8 lg:grid-cols-12 lg:items-center lg:gap-x-6">
        <SectionHeading
          titleId="lokasi-judul"
          eyebrow={mapCopy.googleEyebrow}
          title={mapCopy.googleTitle}
          description={mapCopy.googleHint}
          size="compact"
          className="lg:col-span-4"
        />
        <div className="lg:col-span-7 lg:col-start-6">
          <GoogleMapEmbed embedUrl={googleMapsEmbedUrl(centre)} />
        </div>
      </Container>
    </section>
  );
}

// docs/PRD.md FR-PUB-03 and FR-PUB-18 in the layout of DESIGN-SPEC §3.9: the RW area map (or the site plan), the
// contact blocks, every RW and point as the readable list, and Google's map on request. A detail the kelurahan has not
// given is left out (docs/StyleGuide.md §6.9).
export default async function MapContactPage() {
  const { points, units, settings, sessions } = await readPage();
  const markers = buildGeoMarkers(points, units);
  const centre = mapCentreOf(markers) ?? OFFICE_POINT;
  // site_settings `contact.whatsapp_number` once the kelurahan has set it, as /privasi reads it; the env number before.
  const whatsappNumber = settings.contactWhatsappNumber ?? siteConfig.whatsappContactNumber;
  return (
    <>
      <div id={SECTION_IDS.areas} className="scroll-mt-header">
        <RwAreaExplorer
          areas={buildRwAreaSummaries(RW_AREA_MAP.areas, units, points)}
          markers={markers.filter((marker) => marker.kind === 'point')}
          heading={<PageHeading />}
          plan={<PlanView points={points} units={units} />}
          between={
            <Contact
              settings={settings}
              units={units}
              sessions={sessions}
              whatsappNumber={whatsappNumber}
            />
          }
          listHeading={<ListHeading />}
        />
      </div>
      <GoogleSection centre={centre} />
      <JsonLd
        data={governmentOrganizationJsonLd({
          streetAddress: settings.kelurahanAddress ?? undefined,
          telephone: whatsappNumber,
          email: settings.contactEmail ?? undefined,
          mapUrl: googleMapsPlaceUrl(OFFICE_POINT),
        })}
      />
    </>
  );
}
