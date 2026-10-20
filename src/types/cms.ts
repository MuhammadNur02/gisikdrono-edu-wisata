import type { RwId } from '@/config/rw';
import type { EnumValue } from '@/db/enums';

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

export interface ActivityPointAdmin {
  id: string;
  rwId: RwId;
  name: string;
  slug: string;
  pointType: EnumValue<'activity_point_type'>;
  shortDescription: string | null;
  bodyMd: string | null;
  imagePath: string | null;
  mapX: number | null;
  mapY: number | null;
  lat: number | null;
  lng: number | null;
  sortOrder: number;
  status: EnumValue<'content_status'>;
}

// Times are ISO strings with Semarang's +07:00 offset.
export interface ScheduleAdmin {
  id: string;
  title: string;
  scheduleType: EnumValue<'schedule_type'>;
  descriptionMd: string | null;
  startsAt: string;
  endsAt: string;
  venue: string | null;
  recurrenceRule: string | null;
  imagePath: string | null;
  packageId: string | null;
  status: EnumValue<'content_status'>;
}

export interface SchedulePackageOption {
  id: string;
  name: string;
}
