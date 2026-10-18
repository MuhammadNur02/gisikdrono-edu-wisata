import type { RwId } from '@/config/rw';
import type { PublicImage } from '@/types/media';

// The public profile of an RW (rw_units). The treasury columns are granted to no API role and never appear.
export interface RwUnitProfile {
  id: RwId;
  code: string;
  slug: string;
  name: string;
  themeLabel: string;
  tagline: string | null;
  descriptionMd: string | null;
  visionMd: string | null;
  heroImage: PublicImage | null;
  contactPhone: string | null;
  contactEmail: string | null;
  mapLat: number | null;
  mapLng: number | null;
}
