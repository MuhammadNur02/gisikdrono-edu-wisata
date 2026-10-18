import { z } from 'zod';

import type { RwId } from '@/config/rw';
import { LEADING_BYTES_LENGTH, QUARANTINE_BUCKET } from '@/config/uploads';
import { copy } from '@/lib/copy/id';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { UploadPurpose } from '@/lib/uploads/paths';
import { UploadRejectedError } from '@/lib/uploads/upload-error';
import type { FinalizeUploadInput, SignUploadInput } from '@/lib/validations/upload';
import type { UploadedImage } from '@/types/forms';
import type { FinalizedPdf, FinalizedUpload } from '@/types/upload';

// The browser half of docs/Security.md §8.4: ask api/uploads/sign for a five-minute URL, put the file straight
// into uploads-quarantine with it, then ask api/uploads/finalize to publish what the file becomes. Only the
// server decides paths and checks bytes; this module carries the file and passes the server's answer on.

export interface UploadTarget {
  // NULL uploads for the kelurahan (superadmin only).
  rwId: RwId | null;
  purpose: UploadPurpose;
  entityId?: string | undefined;
  pageNumber?: number | undefined;
}

const failureSchema = z.object({ ok: z.literal(false), error: z.object({ message: z.string() }) });
const signedSchema = z.object({
  ok: z.literal(true),
  data: z.object({ path: z.string(), token: z.string() }),
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

function jsonPost(body: SignUploadInput | FinalizeUploadInput): RequestInit {
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
  throw new UploadRejectedError(
    failure.success ? failure.data.error.message : copy.forms.image.failed,
  );
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

  const { error } = await createSupabaseBrowserClient()
    .storage.from(QUARANTINE_BUCKET)
    .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
  if (error) throw new UploadRejectedError(copy.forms.image.failed);
  return signed.path;
}

export async function uploadFile(file: Blob, target: UploadTarget): Promise<FinalizedUpload> {
  const path = await uploadToQuarantine(file, target.rwId);
  const { purpose, entityId, pageNumber } = target;
  const response = await fetch(
    '/api/uploads/finalize',
    jsonPost({ path, purpose, entityId, pageNumber }),
  );
  return answerOf(response, finalizedSchema);
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

// A booklet goes up twice (Task P2.9.02): the PDF itself, which finalize scans and publishes, then each page
// drawn in this browser by pdf.js and sent through the same signed-URL path as a photo, so the flipbook
// never loads the PDF. The pages are drawn only after the server accepted the PDF.
export async function uploadBooklet(
  file: File,
  target: { rwId: RwId | null; bookletId: string },
  onPage?: (done: number, total: number) => void,
): Promise<FinalizedPdf> {
  const base = { rwId: target.rwId, entityId: target.bookletId };
  const pdf = await uploadFile(file, { ...base, purpose: 'booklet' });
  if (pdf.kind !== 'pdf') throw new UploadRejectedError(copy.forms.image.failed);

  const { renderPdfPages } = await import('@/lib/uploads/rasterise-pdf');
  for await (const page of renderPdfPages(file)) {
    await uploadFile(page.image, { ...base, purpose: 'booklet-page', pageNumber: page.number });
    onPage?.(page.number, page.total);
  }
  return pdf;
}
