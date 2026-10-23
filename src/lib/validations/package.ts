import { z } from 'zod';

import { PACKAGE_LIMITS } from '@/config/packages';
import { DB_ENUMS } from '@/db/enums';
import { copy } from '@/lib/copy/id';
import { tiersOverlap } from '@/lib/utils/package-tiers';
import {
  contentText,
  imagePathSchema,
  isCalendarMoment,
  optionalContentText,
  rowIdSchema,
  slugSchema,
  sortOrderSchema,
} from '@/lib/validations/content';
import { rwIdSchema } from '@/lib/validations/rw-unit';
import { clockTimeSchema } from '@/lib/validations/session';

// /dashboard/packages (Task P4.3.05, docs/PRD.md FR-ADMIN-05): one schema for the form and its Server Actions. Money
// is integer rupiah (CLAUDE.md §7.1); the owner RW of an RW package is never part of the form (the action takes the
// admin's own, or the one the superadmin's RwSwitcher points at), and a combo belongs to the kelurahan. The form
// names no legs: an RW package's single leg is the database's, and a combo's legs wait for the save_package RPC
// (Task P4.3.11), since 0005 grants no API role the columns an upsert of a leg writes.

const messages = copy.packages.validation;
const VISIT_DATE = /^\d{4}-\d{2}-\d{2}$/;

const rupiahSchema = z.int().min(0).max(PACKAGE_LIMITS.priceMax);

// Highlights and inclusions, one item per line of a textarea (LinesField splits the text). The form holds the lines as
// typed, so the schema reads and writes one type; blank lines are dropped and each line is capped here.
const lineListSchema = z
  .array(z.string())
  .max(PACKAGE_LIMITS.rawLines, messages.lines(PACKAGE_LIMITS.listItems))
  .transform((lines) =>
    lines
      .map((line) => line.trim().slice(0, PACKAGE_LIMITS.listItem))
      .filter((line) => line !== ''),
  )
  .pipe(
    z.array(z.string()).max(PACKAGE_LIMITS.listItems, messages.lines(PACKAGE_LIMITS.listItems)),
  );

const optionalDateSchema = z
  .string()
  .trim()
  .nullable()
  .transform((value) => (value === null || value === '' ? null : value))
  .pipe(
    z
      .string()
      .refine(
        (value) => VISIT_DATE.test(value) && isCalendarMoment(value),
        copy.sessions.validation.date,
      )
      .nullable(),
  );

const optionalMinutesSchema = z.int().positive().max(PACKAGE_LIMITS.durationMinutesMax).nullable();

export const priceTierSchema = z
  .object({
    // Set for a tier that exists, so its price change is one history entry rather than a removal and an addition.
    id: rowIdSchema.nullable(),
    minPax: z.int().min(1).max(PACKAGE_LIMITS.tierPaxMax),
    maxPax: z.int().min(1).max(PACKAGE_LIMITS.tierPaxMax).nullable(),
    pricePerPax: rupiahSchema,
  })
  .strict()
  .refine((tier) => tier.maxPax === null || tier.maxPax >= tier.minPax, {
    path: ['maxPax'],
    message: messages.tierRange,
  });

export type PriceTierValues = z.output<typeof priceTierSchema>;

export const itineraryStepSchema = z
  .object({
    rwId: rwIdSchema.nullable(),
    time: z
      .string()
      .trim()
      .nullable()
      .transform((value) => (value === null || value === '' ? null : value))
      .pipe(clockTimeSchema.nullable()),
    title: contentText(PACKAGE_LIMITS.itineraryTitle),
    description: optionalContentText(PACKAGE_LIMITS.itineraryDescription),
  })
  .strict();

export type ItineraryStepValues = z.output<typeof itineraryStepSchema>;

const packageFields = {
  name: contentText(PACKAGE_LIMITS.name),
  slug: slugSchema,
  category: z.enum(DB_ENUMS.package_category),
  tagline: optionalContentText(PACKAGE_LIMITS.tagline),
  descriptionMd: optionalContentText(PACKAGE_LIMITS.descriptionMd),
  highlights: lineListSchema,
  inclusions: lineListSchema,
  itinerary: z.array(itineraryStepSchema).max(PACKAGE_LIMITS.itinerarySteps),
  durationMinutes: optionalMinutesSchema,
  pricingBasis: z.enum(DB_ENUMS.pricing_basis),
  pricePerPax: rupiahSchema.nullable(),
  flatPrice: rupiahSchema.nullable(),
  minPax: z.int().min(1).max(PACKAGE_LIMITS.paxMax),
  maxPax: z.int().min(1).max(PACKAGE_LIMITS.paxMax),
  imagePaths: z.array(imagePathSchema.unwrap()).max(PACKAGE_LIMITS.images),
  isFeatured: z.boolean(),
  status: z.enum(DB_ENUMS.content_status),
  sortOrder: sortOrderSchema,
  validFrom: optionalDateSchema,
  validTo: optionalDateSchema,
  priceTiers: z.array(priceTierSchema).max(PACKAGE_LIMITS.tiers),
};

type PackageRules = {
  pricingBasis: 'per_pax' | 'flat_group';
  pricePerPax: number | null;
  flatPrice: number | null;
  minPax: number;
  maxPax: number;
  validFrom: string | null;
  validTo: string | null;
  priceTiers: readonly { minPax: number; maxPax: number | null }[];
};

function issue(context: z.RefinementCtx, path: string, message: string): void {
  context.addIssue({ code: 'custom', path: [path], message });
}

// tour_packages_price_ok: the price the basis asks for is there; the tiers' exclusion index, before any write.
function checkPricing(pkg: PackageRules, context: z.RefinementCtx): void {
  if (pkg.pricingBasis === 'per_pax' && pkg.pricePerPax === null)
    issue(context, 'pricePerPax', messages.pricePerPax);
  if (pkg.pricingBasis === 'flat_group' && pkg.flatPrice === null)
    issue(context, 'flatPrice', messages.flatPrice);
  if (tiersOverlap(pkg.priceTiers)) issue(context, 'priceTiers', messages.tierOverlap);
}

// The group size and the validity window, checked here first so the form can point at the field.
function checkPackage(pkg: PackageRules, context: z.RefinementCtx): void {
  checkPricing(pkg, context);
  if (pkg.maxPax < pkg.minPax) issue(context, 'maxPax', messages.maxBelowMin);
  if (pkg.validFrom !== null && pkg.validTo !== null && pkg.validTo < pkg.validFrom)
    issue(context, 'validTo', messages.validity);
}

export const createPackageSchema = z.object(packageFields).strict().superRefine(checkPackage);

export const updatePackageSchema = z
  .object({ id: rowIdSchema, ...packageFields })
  .strict()
  .superRefine(checkPackage);

export type PackageInput = z.input<typeof createPackageSchema>;
export type PackageValues = z.output<typeof createPackageSchema>;
export type UpdatePackageValues = z.output<typeof updatePackageSchema>;
