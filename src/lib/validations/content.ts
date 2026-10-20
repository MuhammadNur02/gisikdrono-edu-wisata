import { z } from 'zod';

import { CMS_LIMITS, PUBLISHABLE_STATUSES } from '@/config/cms';
import { ALT_TEXT_MAX_LENGTH, ALT_TEXT_MIN_LENGTH, MAX_IMAGE_EDGE_PX } from '@/config/uploads';
import { copy } from '@/lib/copy/id';
import { isPublicMediaImagePath } from '@/lib/rich-text/document';

// The building blocks of the CMS schemas (Task P2.9.04, docs/Security.md APP-09). Every schema is .strict() and shared
// by the form and its Server Action. The form hands the action what its resolver already parsed, so each piece
// parses its own output again unchanged: an empty optional field becomes null, and null stays null.

const messages = copy.cms.validation;

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const JAKARTA_DATE_TIME = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):00\+07:00$/;
// Asia/Jakarta keeps one offset all year.
const JAKARTA_OFFSET = ':00+07:00';
const BLURHASH_MAX_LENGTH = 100;
const MEDIA_PATH_MAX_LENGTH = 200;

// Text staff write for the public site. Every page shows it as text (React escapes it; rich text goes through its
// allowlist), so a web address or a phone number may stand in it, unlike text that leaves in a message.
export function contentText(maxLength: number) {
  return z.string().trim().min(1, messages.required).max(maxLength, messages.tooLong(maxLength));
}

// The same for a column that may stay empty.
export function optionalContentText(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength, messages.tooLong(maxLength))
    .nullable()
    .transform((value) => (value === null || value === '' ? null : value));
}

export const slugSchema = z
  .string()
  .trim()
  .max(CMS_LIMITS.slug, messages.tooLong(CMS_LIMITS.slug))
  .regex(SLUG_PATTERN, messages.slug);

export const altTextSchema = z
  .string()
  .trim()
  .min(ALT_TEXT_MIN_LENGTH, messages.altText)
  .max(ALT_TEXT_MAX_LENGTH, messages.altText);

export const publishableStatusSchema = z.enum(PUBLISHABLE_STATUSES);

export const sortOrderSchema = z.int().min(0).max(CMS_LIMITS.sortOrder);

export const rowIdSchema = z.uuid().toLowerCase();

// An action on one row (remove, publish), which the action looks up and checks itself.
export const rowRefSchema = z.object({ id: rowIdSchema }).strict();

const mediaPathSchema = z
  .string()
  .max(MEDIA_PATH_MAX_LENGTH)
  .refine(isPublicMediaImagePath, messages.image);

const imageEdgeSchema = z.int().positive().max(MAX_IMAGE_EDGE_PX);

// A photo as api/uploads/finalize answered for it. The shape is checked here; whether the path lies in the owner's own
// folder for this purpose is checked by the service, which knows the owner (src/lib/uploads/paths.ts).
export const publishedImageSchema = z
  .object({
    path: mediaPathSchema,
    width: imageEdgeSchema,
    height: imageEdgeSchema,
    blurhash: z.string().max(BLURHASH_MAX_LENGTH),
    thumbnailPath: mediaPathSchema.nullable(),
  })
  .strict();

export type PublishedImage = z.infer<typeof publishedImageSchema>;

// A path to a published photo without its measurements, for columns that keep the path alone.
export const imagePathSchema = mediaPathSchema.nullable();

// A moment in Asia/Jakarta as a datetime-local field writes it (`2026-10-25T19:00`), or as this schema wrote it before
// (`2026-10-25T19:00:00+07:00`). Stored with its offset, so the database holds the instant the officer meant.
export const jakartaDateTimeSchema = z
  .string()
  .trim()
  .refine(
    (value) => LOCAL_DATE_TIME.test(value) || JAKARTA_DATE_TIME.test(value),
    messages.dateTime,
  )
  .transform((value) => (LOCAL_DATE_TIME.test(value) ? `${value}${JAKARTA_OFFSET}` : value));

export const contentTagsSchema = z
  .array(contentText(CMS_LIMITS.tag))
  .max(CMS_LIMITS.tags, messages.tags(CMS_LIMITS.tags));

// Coordinates are optional; a field left empty is null.
export function optionalNumber(min: number, max: number) {
  return z.number().min(min).max(max).nullable();
}
