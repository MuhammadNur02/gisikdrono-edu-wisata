import { MapPin } from 'lucide-react';

import { RwEyebrow } from '@/components/layout/rw-eyebrow';
import { Section } from '@/components/layout/section';
import { SectionLink } from '@/components/marketing/section-link';
import { ACTIVITY_POINT_TYPE } from '@/config/status';
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

function RwPoints({ unit, points }: { unit: RwUnitSummary; points: readonly ActivityPoint[] }) {
  return (
    <div className="space-y-3">
      <RwEyebrow rw={unit} withName />
      <ul className="space-y-2">
        {points.map((point) => {
          const Icon = ACTIVITY_POINT_TYPE[point.pointType].icon;
          return (
            <li key={point.id} className="flex items-center gap-2 text-body">
              <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              {point.name}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// docs/PRD.md FR-PUB-03 places the interactive site plan on the home page; until the plan exists (Task
// P2.5.01) this teaser lists the activity points the CMS has, with the office address, and leads to
// /peta-kontak.
export function MapTeaser({ id, address, points, units }: MapTeaserProps) {
  const pointsByRw = units
    .map((unit) => ({ unit, points: points.filter((point) => point.rwId === unit.id) }))
    .filter((group) => group.points.length > 0);
  return (
    <Section id={id} eyebrow="Peta" title="Titik kunjungan di Gisikdrono" tone="muted">
      <div className="grid gap-8 md:grid-cols-3">
        {pointsByRw.map((group) => (
          <RwPoints key={group.unit.id} unit={group.unit} points={group.points} />
        ))}
        {address ? (
          <p className="flex gap-2 text-body text-muted-foreground">
            <MapPin aria-hidden className="mt-1 size-4 shrink-0" />
            {address}
          </p>
        ) : null}
      </div>
      <SectionLink href="/peta-kontak" label="Lihat peta dan kontak" />
    </Section>
  );
}
