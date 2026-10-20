import { z } from 'zod';

import { CMS_LIMITS } from '@/config/cms';
import { DB_ENUMS } from '@/db/enums';
import { copy } from '@/lib/copy/id';
import {
  contentText,
  optionalContentText,
  publishableStatusSchema,
  rowIdSchema,
  slugSchema,
} from '@/lib/validations/content';

// /dashboard/booklets (docs/PRD.md FR-ADMIN-12). The id names the folder uploadBooklet published the PDF and its pages
// into (20261021080000_content_row_ids.sql), and pdfPath is where it answered the PDF went. The service checks that
// path against the owner and the id and reads the page count and size back from Storage, so neither comes from the
// form; the RW is never part of it either.

const PDF_PATH_MAX_LENGTH = 200;

export const saveBookletSchema = z
  .object({
    id: rowIdSchema,
    pdfPath: z.string().min(1, copy.cms.validation.booklet).max(PDF_PATH_MAX_LENGTH),
    kind: z.enum(DB_ENUMS.booklet_kind),
    slug: slugSchema,
    title: contentText(CMS_LIMITS.bookletTitle),
    description: optionalContentText(CMS_LIMITS.bookletDescription),
    status: publishableStatusSchema,
  })
  .strict();

export type SaveBookletInput = z.input<typeof saveBookletSchema>;
export type SaveBookletValues = z.output<typeof saveBookletSchema>;
