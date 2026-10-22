import { ExternalLink, Images } from 'lucide-react';
import Link from 'next/link';

import { RwTag } from '@/components/layout/rw-tag';
import { PhotoFrame } from '@/components/marketing/photo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { galleryFilterForRw } from '@/config/gallery';
import { IMAGE_SIZES } from '@/config/images';
import { ACTIVITY_POINT_TYPE } from '@/config/status';
import { mapCopy } from '@/lib/copy/map';
import { galleryPath } from '@/lib/utils/gallery-search';
import { googleMapsDirectionsUrl } from '@/lib/utils/geo';
import type { ActivityPoint } from '@/types/activity-point';
import type { RwBadge } from '@/types/rw-unit';

export interface HotspotPopoverProps {
  point: ActivityPoint;
  rw: RwBadge;
  // Set when the point's RW is online, so `Lihat di galeri` has a filter the gallery accepts.
  hasGallery: boolean;
}

// What an open hotspot shows (docs/StyleGuide.md §5.13): the photo, the RW and type, the short description, and
// the way to the gallery and to the place itself.
export function HotspotPopover({ point, rw, hasGallery }: HotspotPopoverProps) {
  const type = ACTIVITY_POINT_TYPE[point.pointType];
  const TypeIcon = type.icon;
  const routeUrl =
    point.lat !== null && point.lng !== null
      ? googleMapsDirectionsUrl({ lat: point.lat, lng: point.lng })
      : null;
  return (
    <article className="space-y-3 pb-4">
      {point.image ? (
        <PhotoFrame
          image={point.image}
          sizes={IMAGE_SIZES.card}
          aspectClassName="aspect-video"
          className="rounded-none"
        />
      ) : null}
      <div className="space-y-2 px-4 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <RwTag rw={rw} />
          <Badge variant="neutral">
            <TypeIcon aria-hidden />
            {type.label}
          </Badge>
        </div>
        <h3 className="text-h4">{point.name}</h3>
        {point.shortDescription ? (
          <p className="text-body-sm text-muted-foreground">{point.shortDescription}</p>
        ) : null}
      </div>
      {hasGallery || routeUrl ? (
        <div className="flex flex-wrap gap-2 px-4">
          {hasGallery ? (
            <Button variant="secondary" size="sm" asChild>
              <Link href={galleryPath({ filter: galleryFilterForRw(rw.id), page: 1 })}>
                <Images aria-hidden />
                {mapCopy.gallery}
              </Link>
            </Button>
          ) : null}
          {routeUrl ? (
            <Button variant="outline" size="sm" asChild>
              <a href={routeUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden />
                {mapCopy.route}
              </a>
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
