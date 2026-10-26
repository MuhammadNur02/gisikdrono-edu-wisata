import 'server-only';

import { createHash } from 'node:crypto';

import { QUARANTINE_BUCKET, SIGNED_UPLOAD_WINDOW_SECONDS } from '@/config/uploads';
import type { DatabaseClient } from '@/db/rpc-result';
import { AppError } from '@/lib/errors';
import { reencodeImage } from '@/lib/images/re-encode';
import { checkUploadedFile } from '@/lib/uploads/inspect';
import { parseQuarantinePath, quarantinePathFor } from '@/lib/uploads/paths';
import { scanBookletPdf } from '@/lib/uploads/pdf-scan';
import { withScanSlot } from '@/lib/uploads/scan-slots';
import {
  downloadObject,
  quarantineObject,
  retireQuarantineObject,
  storageStatusOf,
} from '@/server/services/upload-storage';
import type { UploadKind, UploadProblem } from '@/types/upload';

// The proof of a payout and the evidence of an adjustment (Task P4.7.02, P4.7.04; docs/Security.md §8.4, REC-09):
// the superadmin puts the file in uploads-quarantine through api/uploads/sign as any upload, and the finance action
// hands its path here with the documents path the server chose. The file is checked as finalize checks it, an image
// re-encoded (EXIF stripped) to WebP and a PDF scanned and sanitised, then written to the private documents bucket,
// where the finance RPCs look for it (internal.require_document), and the quarantine object is retired. The
// service-role client is handed in by document-service.ts (storeFinanceEvidence), an allow-listed importer of it.
//
// Review of PR #80, M-4: the SHA-256 of the bytes the superadmin uploaded, before any re-encoding, is stored with the
// documents path in finance_proofs, where internal.require_unseen_proof refuses a copy of a file that already backs a
// refund, an adjustment or a payout (PROOF_REUSED).

const DOCUMENTS_BUCKET = 'documents';
const PDF_SIGNATURE = '%PDF-';
const PDF_TYPE = 'application/pdf';
const WEBP_TYPE = 'image/webp';
const MS_PER_SECOND = 1000;
const ALREADY_EXISTS = '409';
const PROOFS_TABLE = 'finance_proofs';

export type StoredDocument = { ok: true; path: string } | { ok: false; problem: UploadProblem };

function kindOf(bytes: Buffer): UploadKind {
  return bytes.subarray(0, PDF_SIGNATURE.length).toString('latin1') === PDF_SIGNATURE
    ? 'pdf'
    : 'image';
}

async function writeDocument(
  adminClient: DatabaseClient,
  path: string,
  body: Uint8Array,
  contentType: string,
) {
  const { error } = await adminClient.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, Buffer.from(body), { contentType, upsert: false });
  if (storageStatusOf(error) === ALREADY_EXISTS) throw new AppError('CONFLICT');
  if (error) throw error;
}

// The digest finance_proofs keeps of a proof: lowercase hex SHA-256 of the file as uploaded.
export function proofDigest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function recordProofDigest(adminClient: DatabaseClient, path: string, sha256: string) {
  const { error } = await adminClient.from(PROOFS_TABLE).insert({ path, sha256 });
  if (error) throw error;
}

type DocumentBody =
  { body: Uint8Array; extension: string; contentType: string } | { problem: UploadProblem };

// What the file becomes: a sanitised PDF, or a WebP without its metadata.
async function documentBody(bytes: Buffer, kind: UploadKind): Promise<DocumentBody> {
  if (kind === 'pdf') {
    const slot = await withScanSlot(() => scanBookletPdf(bytes));
    if (!slot.ok) throw new AppError('RATE_LIMITED');
    return slot.value.ok
      ? { body: slot.value.pdf, extension: 'pdf', contentType: PDF_TYPE }
      : { problem: slot.value.problem };
  }
  const image = await reencodeImage(bytes).catch(() => null);
  if (!image) return { problem: 'unreadable' as const };
  return { body: image.webp, extension: 'webp', contentType: WEBP_TYPE };
}

// What came of the quarantine object: refused (with the path to retire, when something arrived there), or its bytes.
type Arrival =
  | { arrived: false; problem: UploadProblem; retire: string | null }
  | { arrived: true; path: string; bytes: Buffer };

function refused(problem: UploadProblem, retire: string | null = null): Arrival {
  return { arrived: false, problem, retire };
}

async function arrivedBytes(adminClient: DatabaseClient, quarantinePath: string): Promise<Arrival> {
  const upload = parseQuarantinePath(quarantinePath);
  // Kelurahan-level files only: the superadmin uploads them, and no RW's folder holds finance documents.
  if (!upload || upload.rwId !== null || upload.page !== null) return refused('missing');
  const path = quarantinePathFor(upload.rwId, upload.objectName);
  const object = await quarantineObject(adminClient, path);
  if (!object) return refused('missing');
  if (object.size === 0) return refused('already_used');
  if (object.createdAtMs - upload.signedAtMs > SIGNED_UPLOAD_WINDOW_SECONDS * MS_PER_SECOND) {
    return refused('late', path);
  }
  const bytes = await downloadObject(adminClient, QUARANTINE_BUCKET, path);
  if (!bytes || bytes.length === 0) return refused('missing');
  return { arrived: true, path, bytes };
}

// Stores the quarantined file at `<destination>.<pdf|webp>` and answers the path, or why it was refused. Every answer
// about a file that arrived retires its quarantine object, as finalize does.
export async function storeFinanceDocument(
  adminClient: DatabaseClient,
  quarantinePath: string,
  destination: string,
): Promise<StoredDocument> {
  const arrived = await arrivedBytes(adminClient, quarantinePath);
  if (!arrived.arrived) {
    if (arrived.retire) await retireQuarantineObject(adminClient, arrived.retire);
    return { ok: false, problem: arrived.problem };
  }
  const kind = kindOf(arrived.bytes);
  const check = await checkUploadedFile(arrived.bytes, kind);
  const stored = 'problem' in check ? check : await documentBody(arrived.bytes, kind);
  await retireQuarantineObject(adminClient, arrived.path);
  if ('problem' in stored) return { ok: false, problem: stored.problem };
  const path = `${destination}.${stored.extension}`;
  // The digest first: a file never sits in the bucket without the content check that goes with it.
  await recordProofDigest(adminClient, path, proofDigest(arrived.bytes));
  await writeDocument(adminClient, path, stored.body, stored.contentType);
  return { ok: true, path };
}

// A document whose RPC then refused the write is taken out again, so the bucket holds only what the ledger names.
export async function removeFinanceDocument(
  adminClient: DatabaseClient,
  path: string,
): Promise<void> {
  const { error } = await adminClient.storage.from(DOCUMENTS_BUCKET).remove([path]);
  if (error) throw error;
  const forgotten = await adminClient.from(PROOFS_TABLE).delete().eq('path', path);
  if (forgotten.error) throw forgotten.error;
}
