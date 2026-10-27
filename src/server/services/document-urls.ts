import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/db/types';
import { AppError } from '@/lib/errors';

// Signed URLs into the private documents bucket (docs/Security.md §6.8, §10.3), apart from document-service.ts
// (review of PR #94, L5). Every function takes the service-role client from its caller, which has already
// authorised the reader.

type DatabaseClient = SupabaseClient<Database>;

const DOCUMENTS_BUCKET = 'documents';

// How long a signed URL to a private document stays valid (docs/Security.md §10.3). The WhatsApp document
// header lives longest because Meta fetches the file some time after the message is queued.
export const SIGNED_URL_TTL_SECONDS = {
  ticket: 600,
  certificate: 600,
  invoice: 900,
  quotation: 900,
  receipt: 900,
  credit_note: 900,
  export: 300,
  whatsapp_document_header: 3600,
} as const;

export type SignedDocumentKind = keyof typeof SIGNED_URL_TTL_SECONDS;

// The folders of the documents bucket each kind may be signed from (CLAUDE.md §6.6): booking papers under
// bookings/<id>/, certificates under certificates/<booking_id>/, exports under exports/<profile_id>/. Payout
// files are never handed out by URL.
const DOCUMENT_FOLDERS_BY_KIND: Record<SignedDocumentKind, readonly string[]> = {
  ticket: ['bookings'],
  certificate: ['certificates'],
  invoice: ['bookings'],
  quotation: ['bookings'],
  receipt: ['bookings'],
  credit_note: ['bookings'],
  export: ['exports'],
  whatsapp_document_header: ['bookings', 'certificates'],
};
// A segment starts with a letter or digit, so neither "." nor ".." can climb out of its folder.
const PATH_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MIN_DOCUMENT_SEGMENTS = 3;

export function isDocumentPathFor(kind: SignedDocumentKind, path: string): boolean {
  const segments = path.split('/');
  const [folder] = segments;
  return (
    segments.length >= MIN_DOCUMENT_SEGMENTS &&
    folder !== undefined &&
    DOCUMENT_FOLDERS_BY_KIND[kind].includes(folder) &&
    segments.every((segment) => PATH_SEGMENT.test(segment))
  );
}

// The one place a signed URL into the documents bucket is minted. The caller has already authorised the
// reader for this document; the URL is handed straight back in a redirect and never stored, logged or
// written into a message (CLAUDE.md §6.6). A path outside the kind's own folder is refused, so a bug in a
// caller cannot turn a ticket link into a link to someone's export. `downloadName` makes the link save the file under
// that name instead of opening it (an export).
export async function createDocumentSignedUrl(
  adminClient: DatabaseClient,
  path: string,
  kind: SignedDocumentKind,
  downloadName?: string,
): Promise<string> {
  if (!isDocumentPathFor(kind, path)) throw new AppError('NOT_FOUND');
  const bucket = adminClient.storage.from(DOCUMENTS_BUCKET);
  const ttl = SIGNED_URL_TTL_SECONDS[kind];
  const { data, error } =
    downloadName === undefined
      ? await bucket.createSignedUrl(path, ttl)
      : await bucket.createSignedUrl(path, ttl, { download: downloadName });
  if (error) throw error;
  return data.signedUrl;
}
