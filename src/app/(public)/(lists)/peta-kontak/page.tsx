import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ContactBlock } from '@/components/map/contact-block';
import { GoogleMapEmbed } from '@/components/map/google-map-embed';
import { PlanEmptyState } from '@/components/map/plan-empty-state';
import { RwAreaExplorer } from '@/components/map/rw-area-explorer';
import { RwPointsList } from '@/components/map/rw-points-list';
import { SiteMap } from '@/components/map/site-map';
import { JsonLd } from '@/components/seo/json-ld';
import { RW_AREA_MAP } from '@/config/rw-areas';
import { siteConfig } from '@/config/site';
import { mapCopy } from '@/lib/copy/map';
import { listActivityPoints } from '@/lib/queries/activity-points';
import { listRwUnits } from '@/lib/queries/rw-units';
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
import type { ActivityPoint } from '@/types/activity-point';
import type { GeoMarker } from '@/types/map';
import type { RwUnitProfile, RwUnitSummary } from '@/types/rw-unit';
import type { PublicSiteSettings } from '@/types/settings';

export const revalidate = 3600;

const TITLE = 'Peta & kontak';
const DESCRIPTION = `Peta wilayah RW, denah titik aktivitas, dan cara menghubungi ${siteConfig.ownerName}.`;

export const metadata: Metadata = buildPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PUBLIC_PATHS.map,
});

const SECTION_IDS = { areas: 'wilayah', plan: 'denah', geo: 'lokasi', contact: 'kontak' } as const;

// The office point of the kelurahan's own map, the route's destination when site_settings holds no address yet.
const OFFICE_POINT: GeoPoint = {
  lat: RW_AREA_MAP.office.position[1],
  lng: RW_AREA_MAP.office.position[0],
};

interface PlanSectionProps {
  points: readonly ActivityPoint[];
  units: readonly RwUnitSummary[];
}

function PlanSection({ points, units }: PlanSectionProps) {
  return (
    <Section id={SECTION_IDS.plan} eyebrow="Denah" title={mapCopy.planTitle} tone="muted">
      {points.length > 0 ? (
        <>
          <div className="space-y-2">
            <SiteMap points={points} units={units} />
            <p className="text-caption text-muted-foreground">{mapCopy.planProvisional}</p>
          </div>
          <div className="space-y-4">
            <h3 className="text-h4">{mapCopy.pointsTitle}</h3>
            <RwPointsList points={points} units={units} />
          </div>
        </>
      ) : (
        <PlanEmptyState />
      )}
    </Section>
  );
}

interface AreaSectionProps {
  points: readonly ActivityPoint[];
  units: readonly RwUnitProfile[];
  markers: readonly GeoMarker[];
  officeRouteUrl: string;
}

function AreaSection({ points, units, markers, officeRouteUrl }: AreaSectionProps) {
  return (
    <Section
      id={SECTION_IDS.areas}
      eyebrow="Wilayah"
      title={mapCopy.areaTitle}
      description={mapCopy.areaDescription}
    >
      <RwAreaExplorer
        areas={buildRwAreaSummaries(RW_AREA_MAP.areas, units, points)}
        markers={markers.filter((marker) => marker.kind === 'point')}
        officeRouteUrl={officeRouteUrl}
      />
    </Section>
  );
}

interface ContactSectionProps {
  settings: PublicSiteSettings;
  whatsappNumber: string;
  officeRouteUrl: string;
  units: readonly RwUnitSummary[];
}

// How to reach the kelurahan, and the same facts for search engines.
function ContactSection({ settings, whatsappNumber, officeRouteUrl, units }: ContactSectionProps) {
  return (
    <>
      <Section id={SECTION_IDS.contact} eyebrow="Kontak" title={mapCopy.contactTitle} tone="muted">
        <ContactBlock
          whatsappNumber={whatsappNumber}
          email={settings.contactEmail}
          address={settings.kelurahanAddress}
          routeUrl={officeRouteUrl}
          units={units}
        />
      </Section>
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

// docs/PRD.md FR-PUB-03 and FR-PUB-18. The RW area map comes first: the kelurahan's 13 RWs from its own map, the
// edu-tourism RWs of rw_units coloured, with the points that have coordinates. The plan shows once activity_points
// has a published row, and says so until then; a contact detail the kelurahan has not given is left out
// (docs/StyleGuide.md §6.9).
export default async function MapContactPage() {
  const [points, units, settings] = await Promise.all([
    listActivityPoints(),
    listRwUnits(),
    getPublicSiteSettings(),
  ]);
  const markers = buildGeoMarkers(points, units);
  const centre = mapCentreOf(markers) ?? OFFICE_POINT;
  const officeRouteUrl = googleMapsDirectionsUrl(settings.kelurahanAddress ?? OFFICE_POINT);
  // site_settings `contact.whatsapp_number` once the kelurahan has set it, as /privasi reads it; the env number before.
  const whatsappNumber = settings.contactWhatsappNumber ?? siteConfig.whatsappContactNumber;
  return (
    <>
      <PageHeader
        title={TITLE}
        description={DESCRIPTION}
        breadcrumbs={[]}
        path={PUBLIC_PATHS.map}
      />
      <AreaSection
        points={points}
        units={units}
        markers={markers}
        officeRouteUrl={officeRouteUrl}
      />
      <PlanSection points={points} units={units} />
      <Section id={SECTION_IDS.geo} eyebrow="Lokasi" title={mapCopy.googleTitle}>
        <GoogleMapEmbed embedUrl={googleMapsEmbedUrl(centre)} />
      </Section>
      <ContactSection
        settings={settings}
        whatsappNumber={whatsappNumber}
        officeRouteUrl={officeRouteUrl}
        units={units}
      />
    </>
  );
}
