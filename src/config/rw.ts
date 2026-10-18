import { Drama, Recycle, type LucideIcon } from 'lucide-react';

// docs/StyleGuide.md §2.7: the RW accents belong to RW-specific touches only (the RW eyebrow and page
// title accent, map hotspots, the RW tag on a package card, the background of a photo slot still waiting for
// its photo). Never CTAs, statuses or paragraph text.
// Components read their classes from here instead of writing colour classes by hand.

// rw_units.id of the two neighbourhoods (supabase/migrations/0008_seed.sql). A combo package lists
// RW 05 first, so this order is also the display order.
export const RW_IDS = [5, 8] as const;

export type RwId = (typeof RW_IDS)[number];

export interface RwAccentClasses {
  // Accent text on the page background: the RW eyebrow or title accent.
  text: string;
  // Solid fill with its own text colour: map hotspots.
  fill: string;
  // Tinted background with its text colour: the RW tag on a package card.
  soft: string;
  border: string;
}

export const RW_ACCENTS: Record<RwId, RwAccentClasses> = {
  5: {
    text: 'text-rw05',
    fill: 'bg-rw05 text-rw05-foreground',
    soft: 'bg-rw05-soft text-rw05-soft-foreground',
    border: 'border-rw05',
  },
  8: {
    text: 'text-rw08',
    fill: 'bg-rw08 text-rw08-foreground',
    soft: 'bg-rw08-soft text-rw08-soft-foreground',
    border: 'border-rw08',
  },
};

export interface RwProgramme {
  // The RW eyebrow: `RW 05 · Ecowastreme` (docs/StyleGuide.md §2.7).
  label: string;
  name: string;
  // Same as rw_units.slug (0008_seed), which is also the public page path.
  slug: string;
  path: string;
  // Stands in a photo slot of the RW before its photo exists (docs/StyleGuide.md §1.3 G1, §8.1).
  icon: LucideIcon;
}

// The fixed identity of each RW page. Taglines, profiles and photos are CMS content in rw_units.
export const RW_PROGRAMMES: Record<RwId, RwProgramme> = {
  5: {
    label: 'RW 05',
    name: 'Ecowastreme',
    slug: 'rw-05-ecowastreme',
    path: '/rw-05-ecowastreme',
    icon: Recycle,
  },
  8: {
    label: 'RW 08',
    name: 'Kampung Seni Budaya',
    slug: 'rw-08-kampung-seni-budaya',
    path: '/rw-08-kampung-seni-budaya',
    icon: Drama,
  },
};

// The tinted background of a photo slot without its photo: the RW's soft accent for one RW, the neutral soft
// pair for a combo or a kelurahan item (docs/StyleGuide.md §1.3 G1).
export const NEUTRAL_SOFT_CLASSES = 'bg-neutral-soft text-neutral-soft-foreground';

export function softClassesFor(rwIds: readonly RwId[]): string {
  const [onlyRw] = rwIds;
  return rwIds.length === 1 && onlyRw !== undefined
    ? RW_ACCENTS[onlyRw].soft
    : NEUTRAL_SOFT_CLASSES;
}

// rw_id arrives from the database as a plain smallint; this narrows it before indexing RW_ACCENTS.
export function isRwId(value: number): value is RwId {
  return RW_IDS.some((rwId) => rwId === value);
}
