import type { RwId } from '@/config/rw';

// What the dashboard's content screens read and the CMS actions answer with (Task P2.9.05). Plain values only: they
// cross into client components.

export interface RwPageAdmin {
  rwId: RwId;
  name: string;
  tagline: string | null;
  descriptionMd: string | null;
  visionMd: string | null;
  heroImagePath: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  mapLat: number | null;
  mapLng: number | null;
}
