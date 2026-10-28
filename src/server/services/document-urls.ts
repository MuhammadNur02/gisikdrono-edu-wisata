import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/db/types';
import { AppError } from '@/lib/errors';
import {
  isDocumentPathFor,
  SIGNED_URL_TTL_SECONDS,
  type SignedDocumentKind,
} from '@/server/services/document-paths';

// The one place a signed URL into the private documents bucket is minted (docs/Security.md §6.8, §10.3), apart from
// document-service.ts (review of PR #94, L5); which paths and for how long are document-paths.ts. Every caller hands
// in the service-role client and has already authorised the reader.

type DatabaseClient = SupabaseClient<Database>;

const DOCUMENTS_BUCKET = 'documents';

// The URL is handed straight back in a redirect and never stored, logged or written into a message (CLAUDE.md
// §6.6). A path outside the kind's own folder is refused, so a bug in a caller cannot turn a ticket link into a link to
// someone's export. `downloadName` makes the link save the file under that name instead of opening it (an export).
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
