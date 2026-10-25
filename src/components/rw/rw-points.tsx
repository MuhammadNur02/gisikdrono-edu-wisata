import { MapPinned } from 'lucide-react';
import Link from 'next/link';

import { SectionShell } from '@/components/layout/section';
import { SectionHeading } from '@/components/layout/section-heading';
import { CaptionedPhoto } from '@/components/marketing/photo';
import { ACTIVITY_POINT_TYPE } from '@/config/status';
import { rwPageCopy } from '@/lib/copy/rw-page';
import { PUBLIC_PATHS } from '@/lib/utils/paths';
import type { RwGalleryPhoto } from '@/lib/utils/rw-photos';
import type { ActivityPoint } from '@/types/activity-point';

// `01`, `02`: the row numbers of the list.
const ROW_NUMBER_DIGITS = 2;

export interface RwPointsProps {
  id: string;
  points: readonly ActivityPoint[];
  // The tall photo beside the list; the list takes the row without it.
  photo: RwGalleryPhoto | null;
}

// One row: the number in the RW accent, the type's icon on the tint, the type, the name, the description and a link
// to the point on the map. Pointed at, the icon tile grows to 1.06 and the map icon takes the accent (§4).
function PointRow({ point, index }: { point: ActivityPoint; index: number }) {
  const type = ACTIVITY_POINT_TYPE[point.pointType];
  const Icon = type.icon;
  return (
    <li className="group flex reveal gap-4 border-t border-border py-6 md:gap-6">
      <span className="w-6 shrink-0 pt-1 font-display text-body-md font-bold text-rw tabular-nums max-md:hidden">
        {String(index + 1).padStart(ROW_NUMBER_DIGITS, '0')}
      </span>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-rw-soft text-rw transition-transform duration-200 motion-safe:group-hover:scale-106 md:size-12">
        <Icon aria-hidden className="size-5" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-meta-caps text-muted-foreground">{type.label}</p>
        <h3 className="font-display text-lg leading-snug font-bold md:text-xl">{point.name}</h3>
        {point.shortDescription ? (
          <p className="text-body-md text-ink-2">{point.shortDescription}</p>
        ) : null}
      </div>
      <Link
        href={PUBLIC_PATHS.map}
        aria-label={rwPageCopy.points.onMap(point.name)}
        className="-mt-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors group-hover:text-rw hover:bg-muted"
      >
        <MapPinned aria-hidden className="size-5" />
      </Link>
    </li>
  );
}

// DESIGN-SPEC §3.3 Titik aktivitas (#titik-aktivitas): a tall photo that stays in view while the list scrolls past,
// and the RW's points from activity_points. A phone shows the list only.
export function RwPoints({ id, points, photo }: RwPointsProps) {
  const titleId = `${id}-judul`;
  return (
    <SectionShell id={id} labelledBy={titleId} className="scroll-mt-header-nav">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-x-6">
        {photo ? (
          <div className="max-lg:hidden lg:col-span-5">
            <CaptionedPhoto
              image={photo.image}
              caption={photo.caption}
              sizes="(min-width: 1024px) 500px, 100vw"
              aspectClassName="aspect-5/7"
              className="sticky top-40"
            />
          </div>
        ) : null}
        <div
          className={
            photo ? 'space-y-10 lg:col-span-7 lg:col-start-6 lg:pl-12' : 'space-y-10 lg:col-span-12'
          }
        >
          <SectionHeading
            titleId={titleId}
            eyebrow={rwPageCopy.points.eyebrow(points.length)}
            title={rwPageCopy.points.title(points.length)}
            description={rwPageCopy.points.description}
          />
          <ol className="border-b border-border reveal-stagger">
            {points.map((point, index) => (
              <PointRow key={point.id} point={point} index={index} />
            ))}
          </ol>
        </div>
      </div>
    </SectionShell>
  );
}
