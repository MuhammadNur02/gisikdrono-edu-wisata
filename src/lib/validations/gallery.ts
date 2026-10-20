import { z } from 'zod';

import { CMS_LIMITS } from '@/config/cms';
import { DB_ENUMS } from '@/db/enums';
import { copy } from '@/lib/copy/id';
import { youtubeVideoId } from '@/lib/utils/youtube';
import {
  altTextSchema,
  optionalContentText,
  publishableStatusSchema,
  publishedImageSchema,
  rowIdSchema,
  sortOrderSchema,
} from '@/lib/validations/content';

// /dashboard/galleries (docs/PRD.md FR-ADMIN-10). A photo comes from the upload pipeline; a video is a YouTube address
// with an optional still of its own (Task P2.9.08). The owner is never part of the form.

const messages = copy.cms.validation;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VIDEO_URL_MAX_LENGTH = 200;
// The address stored for a video: built from its id alone, like the player and the still (src/lib/utils/youtube.ts).
const CANONICAL_WATCH_URL = 'https://www.youtube.com/watch?v=';

const takenAtSchema = z
  .string()
  .trim()
  .nullable()
  .transform((value) => (value === null || value === '' ? null : value))
  .refine((value) => value === null || DATE_PATTERN.test(value), messages.dateTime);

const videoUrlSchema = z
  .string()
  .trim()
  .max(VIDEO_URL_MAX_LENGTH, messages.youtube)
  .nullable()
  .transform((value) => (value === null || value === '' ? null : value))
  .refine((value) => value === null || youtubeVideoId(value) !== null, messages.youtube)
  .transform((value) => {
    const videoId = value === null ? null : youtubeVideoId(value);
    return videoId === null ? null : `${CANONICAL_WATCH_URL}${videoId}`;
  });

const galleryFields = {
  category: z.enum(DB_ENUMS.gallery_category),
  caption: optionalContentText(CMS_LIMITS.caption),
  altText: altTextSchema,
  takenAt: takenAtSchema,
  sortOrder: sortOrderSchema,
  status: publishableStatusSchema,
};

// One shape for both kinds, so the form and the action share it: a photo needs its upload, a video its address.
export const createGalleryItemSchema = z
  .object({
    mediaType: z.enum(DB_ENUMS.media_type),
    image: publishedImageSchema.nullable(),
    videoUrl: videoUrlSchema,
    still: publishedImageSchema.nullable(),
    ...galleryFields,
  })
  .strict()
  .superRefine((item, context) => {
    if (item.mediaType === 'image' && item.image === null) {
      context.addIssue({ code: 'custom', path: ['image'], message: messages.imageRequired });
    }
    if (item.mediaType === 'video' && item.videoUrl === null) {
      context.addIssue({ code: 'custom', path: ['videoUrl'], message: messages.youtube });
    }
  });

// An existing item keeps its photo or video; what changes is how it is described and shown.
export const updateGalleryItemSchema = z.object({ id: rowIdSchema, ...galleryFields }).strict();

export type CreateGalleryItemInput = z.input<typeof createGalleryItemSchema>;
export type CreateGalleryItemValues = z.output<typeof createGalleryItemSchema>;
export type UpdateGalleryItemInput = z.input<typeof updateGalleryItemSchema>;
export type UpdateGalleryItemValues = z.output<typeof updateGalleryItemSchema>;
