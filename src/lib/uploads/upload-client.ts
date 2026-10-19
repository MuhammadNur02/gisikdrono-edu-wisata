import { z } from 'zod';

import type { RwId } from '@/config/rw';
import {
  LEADING_BYTES_LENGTH,
  PAGE_UPLOAD_CONCURRENCY,
  PUBLIC_MEDIA_BUCKET,
  QUARANTINE_BUCKET,
} from '@/config/uploads';
import { copy } from '@/lib/copy/id';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { UploadPurpose } from '@/lib/uploads/paths';
import { UploadRejectedError } from '@/lib/uploads/upload-error';
import type {
  FinalizeUploadInput,
  SignBookletPagesInput,
  SignUploadInput,
} from '@/lib/validations/upload';
import type { ActionErrorCode } from '@/types/action-result';
import type { UploadedImage } from '@/types/forms';
import type { FinalizedPdf, FinalizedUpload, SignedBookletPages } from '@/types/upload';

// The browser half of docs/Security.md §8.4: ask api/uploads/sign for a five-minute URL, put the file straight
// into uploads-quarantine with it, then ask api/uploads/finalize to publish what the file becomes. Booklet pages
// are signed all at once by api/uploads/sign-pages. Only the server decides paths and checks bytes; this module
// carries the files and passes the server's answer on.

export interface UploadTarget {
  // NULL uploads for the kelurahan (superadmin only).
  rwId: RwId | null;
  purpose: UploadPurpose;
  entityId?: string | undefined;
}

// Every code a route may answer with; the Record makes the compiler ask for a new one here too.
const ACTION_ERROR_CODES = {
  UNAUTHENTICATED: true,
  FORBIDDEN: true,
  VALIDATION: true,
  NOT_FOUND: true,
  CONFLICT: true,
  QUOTA_EXCEEDED: true,
  STATE_INVALID: true,
  PRICE_MISMATCH: true,
  RATE_LIMITED: true,
  PAYMENT: true,
  INTERNAL: true,
} satisfies Record<ActionErrorCode, true>;
const failureSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    message: z.string(),
    code: z
      .custom<ActionErrorCode>(
        (value) => typeof value === 'string' && Object.hasOwn(ACTION_ERROR_CODES, value),
      )
      .optional()
      .catch(undefined),
  }),
});
const signedSchema = z.object({
  ok: z.literal(true),
  data: z.object({ path: z.string(), token: z.string() }),
});
const signedPagesSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    pageCount: z.number(),
    pages: z.array(z.object({ pageNumber: z.number(), path: z.string(), token: z.string() })),
  }),
});
const finalizedSchema = z.object({
  ok: z.literal(true),
  data: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('image'),
      path: z.string(),
      width: z.number(),
      height: z.number(),
      blurhash: z.string(),
      thumbnailPath: z.string().nullable(),
    }),
    z.object({
      kind: z.literal('pdf'),
      path: z.string(),
      pageCount: z.number(),
      fileSizeBytes: z.number(),
    }),
  ]),
});

const ALREADY_EXISTS = '409';

function jsonPost(
  body: SignUploadInput | SignBookletPagesInput | FinalizeUploadInput,
): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function answerOf<T>(
  response: Response,
  schema: z.ZodType<{ ok: true; data: T }>,
): Promise<T> {
  const answer: unknown = await response.json().catch(() => null);
  const success = schema.safeParse(answer);
  if (success.success) return success.data.data;
  const failure = failureSchema.safeParse(answer);
  if (!failure.success) throw new UploadRejectedError(copy.forms.image.failed);
  throw new UploadRejectedError(failure.data.error.message, failure.data.error.code);
}

function base64Of(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

async function uploadToQuarantine(file: Blob, rwId: RwId | null): Promise<string> {
  const leadingBytes = new Uint8Array(await file.slice(0, LEADING_BYTES_LENGTH).arrayBuffer());
  const request = {
    rwId,
    contentType: file.type,
    size: file.size,
    leadingBytes: base64Of(leadingBytes),
  };
  const signed = await answerOf(await fetch('/api/uploads/sign', jsonPost(request)), signedSchema);
  await putInQuarantine(file, signed.path, signed.token);
  return signed.path;
}

// Storage's answer when the path is taken. Every path is fresh from the server, so what is there is this file,
// put there by an earlier try whose reply was lost.
function isAlreadyThere(error: object): boolean {
  return 'statusCode' in error && String(error.statusCode) === ALREADY_EXISTS;
}

async function putInQuarantine(file: Blob, path: string, token: string): Promise<void> {
  const { error } = await createSupabaseBrowserClient()
    .storage.from(QUARANTINE_BUCKET)
    .uploadToSignedUrl(path, token, file, { contentType: file.type });
  if (error && !isAlreadyThere(error)) throw new UploadRejectedError(copy.forms.image.failed);
}

async function finalize(body: FinalizeUploadInput): Promise<FinalizedUpload> {
  return answerOf(await fetch('/api/uploads/finalize', jsonPost(body)), finalizedSchema);
}

export async function uploadFile(file: Blob, target: UploadTarget): Promise<FinalizedUpload> {
  const path = await uploadToQuarantine(file, target.rwId);
  return finalize({ path, purpose: target.purpose, entityId: target.entityId });
}

// The `upload` an ImageUploader takes (src/components/forms/image-uploader.tsx).
export function createImageUpload(target: UploadTarget) {
  return async (file: Blob): Promise<Omit<UploadedImage, 'altText'>> => {
    const uploaded = await uploadFile(file, target);
    if (uploaded.kind !== 'image') throw new UploadRejectedError(copy.forms.image.failed);
    const { path, width, height, blurhash, thumbnailPath } = uploaded;
    return { path, width, height, blurhash, thumbnailPath };
  };
}

// Pages are drawn from the copy finalize published (security review of PR #14, F3). Building its public address
// makes no request; pdf.js fetches it, from the Supabase origin the dashboard's CSP allows.
async function drawPublishedPages(pdfPath: string): Promise<Blob[]> {
  const { renderPdfPages } = await import('@/lib/uploads/rasterise-pdf');
  const { publicUrl } = createSupabaseBrowserClient()
    .storage.from(PUBLIC_MEDIA_BUCKET)
    .getPublicUrl(pdfPath).data;
  const pages: Blob[] = [];
  for await (const page of renderPdfPages(publicUrl)) pages.push(page.image);
  return pages;
}

// A fault on our side or a reply that never arrived whole may pass on a second try; a refusal will not.
function isWorthRetrying(error: unknown): boolean {
  if (!(error instanceof UploadRejectedError)) return true;
  return error.code === undefined || error.code === 'INTERNAL';
}

async function tryTwice(step: () => Promise<void>): Promise<void> {
  try {
    await step();
  } catch (error) {
    if (!isWorthRetrying(error)) throw error;
    await step();
  }
}

type SignedPage = SignedBookletPages['pages'][number];

// Every page reaches quarantine before any is finalized, a few at a time, so the five-minute window of the URLs
// covers the uploads alone and not the server's work on each page (security review of PR #14, M2).
async function putPagesInQuarantine(pages: SignedPage[], images: Blob[]): Promise<void> {
  for (let start = 0; start < pages.length; start += PAGE_UPLOAD_CONCURRENCY) {
    const batch = pages.slice(start, start + PAGE_UPLOAD_CONCURRENCY);
    await Promise.all(
      batch.map((page) => {
        const image = images[page.pageNumber - 1];
        if (!image) throw new UploadRejectedError(copy.uploads.bookletPagesFailed);
        return tryTwice(() => putInQuarantine(image, page.path, page.token));
      }),
    );
  }
}

// A page an earlier try already published answers CONFLICT, and counts as done.
async function finalizePage(path: string): Promise<void> {
  await tryTwice(async () => {
    try {
      await finalize({ path, purpose: 'booklet-page' });
    } catch (error) {
      if (!(error instanceof UploadRejectedError && error.code === 'CONFLICT')) throw error;
    }
  });
}

// A booklet goes up twice (Task P2.9.02): the PDF itself, which finalize scans and publishes, then each page
// of that published copy drawn in this browser by pdf.js, so the flipbook never loads the PDF. The pages are drawn first and signed
// afterwards in one api/uploads/sign-pages call, as many as the published PDF has; all of them go to quarantine,
// then finalize publishes them one by one (docs/Security.md §8.4).
export async function uploadBooklet(
  file: File,
  target: { rwId: RwId | null; bookletId: string },
  onPage?: (done: number, total: number) => void,
): Promise<FinalizedPdf> {
  const { rwId, bookletId } = target;
  const pdf = await uploadFile(file, { rwId, purpose: 'booklet', entityId: bookletId });
  if (pdf.kind !== 'pdf') throw new UploadRejectedError(copy.forms.image.failed);

  const images = await drawPublishedPages(pdf.path);
  const response = await fetch('/api/uploads/sign-pages', jsonPost({ rwId, bookletId }));
  const signed = await answerOf(response, signedPagesSchema);
  if (signed.pageCount !== images.length)
    throw new UploadRejectedError(copy.uploads.bookletPagesFailed);

  await putPagesInQuarantine(signed.pages, images);
  for (const page of signed.pages) {
    await finalizePage(page.path);
    onPage?.(page.pageNumber, signed.pageCount);
  }
  return pdf;
}
