import { MapPin } from 'lucide-react';

import { Section } from '@/components/layout/section';
import { RwPointsList } from '@/components/map/rw-points-list';
import { SiteMap } from '@/components/map/site-map';
import { SectionLink } from '@/components/marketing/section-link';
import { mapCopy } from '@/lib/copy/map';
import { PUBLIC_PATHS } from '@/lib/utils/paths';
import type { ActivityPoint } from '@/types/activity-point';
import type { RwUnitSummary } from '@/types/rw-unit';

export interface MapTeaserProps {
  id: string;
  // site_settings `kelurahan.address`; NULL while it is still the seeded sample.
  address: string | null;
  points: readonly ActivityPoint[];
  // The RWs online, in their order; a point of an RW that is not among them is not listed.
  units: readonly RwUnitSummary[];
}

// docs/PRD.md FR-PUB-03: the interactive site plan on the home page (Task P2.5.01), with the list of its points
// as the readable alternative, the office address, and the way to /peta-kontak.
export function MapTeaser({ id, address, points, units }: MapTeaserProps) {
  return (
    <Section id={id} eyebrow="Peta" title="Titik kunjungan di Gisikdrono" tone="muted">
      <div className="space-y-2">
        <SiteMap points={points} units={units} />
        <p className="text-caption text-muted-foreground">{mapCopy.planProvisional}</p>
      </div>
      <RwPointsList points={points} units={units} />
      {address ? (
        <p className="flex gap-2 text-body text-muted-foreground">
          <MapPin aria-hidden className="mt-1 size-4 shrink-0" />
          {address}
        </p>
      ) : null}
      <SectionLink href={PUBLIC_PATHS.map} label="Lihat peta dan kontak" />
    </Section>
  );
}
