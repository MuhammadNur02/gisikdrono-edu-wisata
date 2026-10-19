import { z } from 'zod';

import { RW_IDS } from '@/config/rw';
import { LEADING_BYTES_LENGTH, UPLOAD_PURPOSES } from '@/config/uploads';

// Request bodies of api/uploads/sign, sign-pages and finalize (docs/Security.md §8.4), shared with the
// browser helper that calls them. The browser never names a path: sign makes one, finalize gets it back.

const CONTENT_TYPE_MAX_LENGTH = 100;
// `kelurahan/` plus a booklet page name (two UUIDs and two four-digit numbers) is the longest path issued.
const QUARANTINE_PATH_MAX_LENGTH = 96;
const BASE64_GROUP_BYTES = 3;
const BASE64_GROUP_CHARS = 4;

// How many bytes a padded base64 string holds, without decoding it (z.base64 has checked the padding).
function decodedLength(base64: string): number {
  const padding = base64.length - base64.replace(/=+$/, '').length;
  return (base64.length / BASE64_GROUP_CHARS) * BASE64_GROUP_BYTES - padding;
}

export const signUploadSchema = z
  .object({
    // NULL uploads for the kelurahan, which only the superadmin may do.
    rwId: z.literal(RW_IDS).nullable(),
    // What the browser says the file is; checked against the first bytes, never trusted on its own.
    contentType: z.string().max(CONTENT_TYPE_MAX_LENGTH),
    size: z.int().positive(),
    leadingBytes: z
      .base64()
      .min(1)
      .refine((value) => decodedLength(value) <= LEADING_BYTES_LENGTH),
  })
  .strict();

export type SignUploadInput = z.infer<typeof signUploadSchema>;

// A booklet page names its booklet and its number in the path sign-pages gave it, so neither is sent here.
export const finalizeUploadSchema = z
  .object({
    path: z.string().max(QUARANTINE_PATH_MAX_LENGTH),
    purpose: z.enum(UPLOAD_PURPOSES),
    // Lower case, the only spelling paths.ts accepts, so one booklet never gets two spellings (review L10).
    entityId: z.uuid().toLowerCase().optional(),
  })
  .strict();

export type FinalizeUploadInput = z.infer<typeof finalizeUploadSchema>;

// api/uploads/sign-pages: the booklet whose published PDF says how many pages to sign.
export const signBookletPagesSchema = z
  .object({
    rwId: z.literal(RW_IDS).nullable(),
    bookletId: z.uuid().toLowerCase(),
  })
  .strict();

export type SignBookletPagesInput = z.infer<typeof signBookletPagesSchema>;
