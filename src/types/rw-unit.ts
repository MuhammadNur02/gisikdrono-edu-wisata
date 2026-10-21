import type { RwAccent, RwIcon, RwId } from '@/config/rw';
import type { PublicImage } from '@/types/media';

// How a page marks something as one RW's: the RW's number and its accent. NULL accent: an RW that is offline, which
// the public site does not know the colours of, so it is shown in the neutral pair.
export interface RwBadge {
  id: RwId;
  // `RW 05`.
  label: string;
  accentKey: RwAccent | null;
}

// An RW as menus, switchers, eyebrows and links show it (rw_units, decision of 2026-10-21).
export interface RwUnitSummary extends RwBadge {
  accentKey: RwAccent;
  // `RW 05 Ecowastreme`.
  name: string;
  // `Ecowastreme`: the programme name the pages colour inside the full name.
  shortName: string;
  slug: string;
  // `/rw-05-ecowastreme`, the RW's own page.
  path: string;
  iconKey: RwIcon;
  // The RW runs a performance schedule: the /jadwal page and the dashboard's schedule module.
  scheduleEnabled: boolean;
}

// What an RW eyebrow says: the number in the RW accent, with the programme name after it where there is room.
export type RwEyebrowData = Pick<RwUnitSummary, 'label' | 'shortName' | 'accentKey'>;

// The public profile of an RW. The treasury columns are granted to no API role and never appear.
export interface RwUnitProfile extends RwUnitSummary {
  themeLabel: string;
  tagline: string | null;
  descriptionMd: string | null;
  visionMd: string | null;
  heroImage: PublicImage | null;
  contactPhone: string | null;
  contactEmail: string | null;
  mapLat: number | null;
  mapLng: number | null;
  // The heading of the RW page's product section in place of `Produk UMKM`; NULL keeps that one.
  productsHeading: string | null;
}
