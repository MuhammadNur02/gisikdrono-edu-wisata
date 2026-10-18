import type { RwId } from '@/config/rw';
import type { EnumValue } from '@/db/enums';
import type { PublicImage } from '@/types/media';

export interface ActivityPoint {
  id: string;
  rwId: RwId;
  slug: string;
  name: string;
  pointType: EnumValue<'activity_point_type'>;
  shortDescription: string | null;
  bodyMd: string | null;
  image: PublicImage | null;
  // Position on public/map/denah.svg as percentages of its width and height (docs/StyleGuide.md §8.3).
  mapX: number | null;
  mapY: number | null;
  svgHotspotId: string | null;
  lat: number | null;
  lng: number | null;
}
