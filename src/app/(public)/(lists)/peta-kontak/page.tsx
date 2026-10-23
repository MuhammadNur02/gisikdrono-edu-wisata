import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ContactBlock } from '@/components/map/contact-block';
import { GeoMap } from '@/components/map/geo-map';
import { GoogleMapEmbed } from '@/components/map/google-map-embed';
import { PlanEmptyState } from '@/components/map/plan-empty-state';
import { RwPointsList } from '@/components/map/rw-points-list';
import { SiteMap } from '@/components/map/site-map';
import { JsonLd } from '@/components/seo/json-ld';
import { siteConfig } from '@/config/site';
import { mapCopy } from '@/lib/copy/map';
import { listActivityPoints } from '@/lib/queries/activity-points';
import { listRwUnits } from '@/lib/queries/rw-units';
import { getPublicSiteSettings } from '@/lib/queries/settings';
import { governmentOrganizationJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { googleMapsDirectionsUrl, googleMapsEmbedUrl, googleMapsPlaceUrl } from '@/lib/utils/geo';
import { buildGeoMarkers, mapCentreOf } from '@/lib/utils/geo-markers';
import { PUBLIC_PATHS } from '@/lib/utils/paths';
import type { ActivityPoint } from '@/types/activity-point';
import type { RwUnitSummary } from '@/types/rw-unit';

export const revalidate = 3600;

const TITLE = 'Peta & kontak';
const DESCRIPTION = `Denah titik aktivitas, lokasi kampung di peta, dan cara menghubungi ${siteConfig.ownerName}.`;

export const metadata: Metadata = buildPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PUBLIC_PATHS.map,
});

const SECTION_IDS = { plan: 'denah', geo: 'lokasi', contact: 'kontak' } as const;

interface PlanSectionProps {
  points: readonly ActivityPoint[];
  units: readonly RwUnitSummary[];
}

function PlanSection({ points, units }: PlanSectionProps) {
  return (
    <Section id={SECTION_IDS.plan} eyebrow="Denah" title={mapCopy.planTitle}>
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

// docs/PRD.md FR-PUB-03 and FR-PUB-18. The plan shows once activity_points has a published row, and says so until
// then; the geographic maps appear once the kelurahan has set coordinates (rw_units.map_lat/map_lng or a point's
// lat/lng), and a contact detail it has not given is left out (docs/StyleGuide.md §6.9).
export default async function MapContactPage() {
  const [points, units, settings] = await Promise.all([
    listActivityPoints(),
    listRwUnits(),
    getPublicSiteSettings(),
  ]);
  const markers = buildGeoMarkers(points, units);
  const centre = mapCentreOf(markers);
  const routeDestination = settings.kelurahanAddress ?? centre;
  // site_settings `contact.whatsapp_number` once the kelurahan has set it, as /privasi reads it; the env number before.
  const whatsappNumber = settings.contactWhatsappNumber ?? siteConfig.whatsappContactNumber;
  return (
    <>
      <PageHeader title={TITLE} description={DESCRIPTION} breadcrumbs={[]} path={PUBLIC_PATHS.map} />
      <PlanSection points={points} units={units} />
      {centre ? (
        <Section id={SECTION_IDS.geo} eyebrow="Lokasi" title={mapCopy.geoTitle} tone="muted">
          <GeoMap markers={markers} />
          <GoogleMapEmbed embedUrl={googleMapsEmbedUrl(centre)} />
        </Section>
      ) : null}
      <Section id={SECTION_IDS.contact} eyebrow="Kontak" title={mapCopy.contactTitle}>
        <ContactBlock
          whatsappNumber={whatsappNumber}
          email={settings.contactEmail}
          address={settings.kelurahanAddress}
          routeUrl={routeDestination ? googleMapsDirectionsUrl(routeDestination) : null}
          units={units}
        />
      </Section>
      <JsonLd
        data={governmentOrganizationJsonLd({
          streetAddress: settings.kelurahanAddress ?? undefined,
          telephone: whatsappNumber,
          email: settings.contactEmail ?? undefined,
          mapUrl: centre ? googleMapsPlaceUrl(centre) : undefined,
        })}
      />
    </>
  );
}
