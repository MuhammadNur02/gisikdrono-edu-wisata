import type { EnumValue } from '@/db/enums';

// The RWs are rows of rw_units (decision of 2026-10-21): their pages, the menu and the colours are read from there.
// What stays here is what the build has to know, the fixed palette an RW chooses its accent from (docs/StyleGuide.md
// §2.7) and how an RW's number is written.

// rw_units.id, the RW's number. rw_units_id_two_digits keeps it between 1 and 99, so it always fits the two digits
// of the code (RW05), the ticket code suffix and the media folder (rw-05).
export type RwId = number;
export const RW_ID_MIN = 1;
export const RW_ID_MAX = 99;
const RW_NUMBER_DIGITS = 2;

export type RwAccent = EnumValue<'rw_accent'>;
export type RwIcon = EnumValue<'rw_icon'>;

// `05`, as the kelurahan writes an RW's number.
export function rwNumber(rwId: RwId): string {
  return String(rwId).padStart(RW_NUMBER_DIGITS, '0');
}

// `RW 05`, the RW eyebrow and tag.
export function rwLabel(rwId: RwId): string {
  return `RW ${rwNumber(rwId)}`;
}

// docs/StyleGuide.md §2.7: the RW accents belong to RW-specific touches only (the RW eyebrow and page title accent,
// map hotspots, the RW tag on a card, the background of a photo slot still waiting for its photo). Never CTAs,
// statuses or paragraph text. Tailwind generates only the classes it finds written out, so each palette spells its
// classes in full here, and components read them from this map instead of writing colour classes by hand.
export interface RwAccentClasses {
  // Accent text on the page background: the RW eyebrow or title accent.
  text: string;
  // Solid fill with its own text colour: map hotspots.
  fill: string;
  // Tinted background with its text colour: the RW tag on a card.
  soft: string;
  border: string;
  // The palette class of the plan's RW layer and of the RW's map markers (.denah-rw-* in src/styles/globals.css).
  plan: string;
}

export const RW_ACCENT_CLASSES: Record<RwAccent, RwAccentClasses> = {
  leaf: {
    text: 'text-rw-leaf',
    fill: 'bg-rw-leaf text-rw-leaf-foreground',
    soft: 'bg-rw-leaf-soft text-rw-leaf-soft-foreground',
    border: 'border-rw-leaf',
    plan: 'denah-rw-leaf',
  },
  terracotta: {
    text: 'text-rw-terracotta',
    fill: 'bg-rw-terracotta text-rw-terracotta-foreground',
    soft: 'bg-rw-terracotta-soft text-rw-terracotta-soft-foreground',
    border: 'border-rw-terracotta',
    plan: 'denah-rw-terracotta',
  },
  mulberry: {
    text: 'text-rw-mulberry',
    fill: 'bg-rw-mulberry text-rw-mulberry-foreground',
    soft: 'bg-rw-mulberry-soft text-rw-mulberry-soft-foreground',
    border: 'border-rw-mulberry',
    plan: 'denah-rw-mulberry',
  },
  teal: {
    text: 'text-rw-teal',
    fill: 'bg-rw-teal text-rw-teal-foreground',
    soft: 'bg-rw-teal-soft text-rw-teal-soft-foreground',
    border: 'border-rw-teal',
    plan: 'denah-rw-teal',
  },
  violet: {
    text: 'text-rw-violet',
    fill: 'bg-rw-violet text-rw-violet-foreground',
    soft: 'bg-rw-violet-soft text-rw-violet-soft-foreground',
    border: 'border-rw-violet',
    plan: 'denah-rw-violet',
  },
};

// An RW that is offline has no accent on the public site, so a row of it is marked in the neutral colours.
export const NEUTRAL_ACCENT_CLASSES: RwAccentClasses = {
  text: 'text-muted-foreground',
  fill: 'bg-neutral text-neutral-foreground',
  soft: 'bg-neutral-soft text-neutral-soft-foreground',
  border: 'border-border',
  plan: 'denah-rw-neutral',
};

export function rwAccentClasses(accentKey: RwAccent | null): RwAccentClasses {
  return accentKey === null ? NEUTRAL_ACCENT_CLASSES : RW_ACCENT_CLASSES[accentKey];
}

// The tinted background of a photo slot without its photo: the RW's soft accent for one RW, the neutral soft pair for
// a combo or a kelurahan item (docs/StyleGuide.md §1.3 G1).
export function softClassesFor(rws: readonly { accentKey: RwAccent | null }[]): string {
  const [onlyRw] = rws;
  return rws.length === 1 && onlyRw !== undefined
    ? rwAccentClasses(onlyRw.accentKey).soft
    : NEUTRAL_ACCENT_CLASSES.soft;
}
