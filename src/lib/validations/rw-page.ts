import { z } from 'zod';

import { CMS_LIMITS } from '@/config/cms';
import { copy } from '@/lib/copy/id';
import { imagePathSchema, optionalContentText, optionalNumber } from '@/lib/validations/content';

// /dashboard/pages (docs/PRD.md FR-ADMIN-15): the public profile of the staff member's RW, the content columns of
// rw_units only. Which RW is never part of the form: it is the RW admin's own, or the one the superadmin's RwSwitcher
// points at. Code, slug, status and the treasury account stay out of reach (rw_units_guard, 0004).

const messages = copy.cms.validation;
const PHONE_PATTERN = /^\+62[0-9]{8,13}$/;
const EMAIL_MAX_LENGTH = 254;
const LATITUDE_LIMIT = 90;
const LONGITUDE_LIMIT = 180;

export const updateRwPageSchema = z
  .object({
    tagline: optionalContentText(CMS_LIMITS.tagline),
    descriptionMd: optionalContentText(CMS_LIMITS.longText),
    visionMd: optionalContentText(CMS_LIMITS.longText),
    heroImagePath: imagePathSchema,
    contactPhone: z
      .string()
      .trim()
      .nullable()
      .transform((value) => (value === null || value === '' ? null : value))
      .refine((value) => value === null || PHONE_PATTERN.test(value), messages.phone),
    contactEmail: z
      .string()
      .trim()
      .toLowerCase()
      .max(EMAIL_MAX_LENGTH, messages.email)
      .nullable()
      .transform((value) => (value === null || value === '' ? null : value))
      .refine((value) => value === null || z.email().safeParse(value).success, messages.email),
    mapLat: optionalNumber(-LATITUDE_LIMIT, LATITUDE_LIMIT),
    mapLng: optionalNumber(-LONGITUDE_LIMIT, LONGITUDE_LIMIT),
  })
  .strict();

export type UpdateRwPageInput = z.input<typeof updateRwPageSchema>;
export type UpdateRwPageValues = z.output<typeof updateRwPageSchema>;
