import 'server-only';

import { svcRecordCertificatePdf } from '@/db/rpc-certificates';
import type { DatabaseClient } from '@/db/rpc-result';
import { AppError } from '@/lib/errors';
import { renderCertificatePdf } from '@/lib/pdf/certificate';
import { splitPdfPages } from '@/lib/pdf/split-pages';
import {
  CERTIFICATE_ROW_COLUMNS,
  loadCertificatePages,
  toCertificateRow,
  type CertificateRow,
} from '@/server/services/certificate-pages';

// A certificate's PDF (Task P4.5.02; docs/PRD.md FR-POST-01, FR-POST-02; docs/Security.md §10.3, §10.4): rendered on
// first download and kept in the private documents bucket under certificates/<booking_id>/, named after its own
// number, the name internal.purge_participants and api/jobs/purge-storage remove 90 days after the visit. The group's
// certificate is one page. The participants' are rendered together as one multi-page document, split with pdf-lib,
// and every page kept as its own participant's file. The service-role client is handed in by document-service.ts;
// every query here is by the id of a certificate whose reader was already authorised, or of its own booking.

const DOCUMENTS_BUCKET = 'documents';
const PDF_TYPE = 'application/pdf';
// Files are uploaded and recorded a few at a time, so a class of 300 neither waits on one at a time nor floods Storage.
const KEEP_BATCH_SIZE = 8;

export interface CertificateContext {
  siteUrl: string;
  // The staff member reading or re-rendering it, or null for the visitor; the kept file is recorded under their name.
  readerId: string | null;
}

export function certificateFileName(certificate: CertificateRow): string {
  return `${certificate.kind}-${certificate.certificateNumber.replaceAll('/', '-')}.pdf`;
}

function storagePathFor(certificate: CertificateRow): string {
  return `certificates/${certificate.bookingId}/${certificateFileName(certificate)}`;
}

// Handed out only while it stands: issued, released (nobody came unpaid, or the superadmin waived that) and not purged.
export function isServable(certificate: CertificateRow): boolean {
  return (
    certificate.status === 'issued' &&
    certificate.releasedAt !== null &&
    certificate.purgedAt === null
  );
}

// Whether the PDF prints a person's name, and so is personal data: every participant's, and the group's of an
// individual visit, which carries the PIC's name for want of an institution (internal.issue_certificates).
export function printsAPersonsName(certificate: CertificateRow): boolean {
  return certificate.kind === 'participant' || certificate.institutionName === null;
}

export async function loadCertificate(
  adminClient: DatabaseClient,
  id: string,
): Promise<CertificateRow | null> {
  const { data, error } = await adminClient
    .from('certificates')
    .select(CERTIFICATE_ROW_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data === null ? null : toCertificateRow(data);
}

async function servableCertificatesOf(
  adminClient: DatabaseClient,
  bookingId: string,
): Promise<CertificateRow[]> {
  const { data, error } = await adminClient
    .from('certificates')
    .select(CERTIFICATE_ROW_COLUMNS)
    .eq('booking_id', bookingId)
    .eq('status', 'issued')
    .not('released_at', 'is', null)
    .is('purged_at', null)
    .order('certificate_number');
  if (error) throw error;
  return data.map(toCertificateRow);
}

// The upload comes first and the record second; a certificate revoked or purged in between refuses the record, and
// its file is taken out again so nothing outlives the retention run.
async function keepPdf(
  adminClient: DatabaseClient,
  certificate: CertificateRow,
  pdf: Buffer,
  readerId: string | null,
): Promise<void> {
  const path = storagePathFor(certificate);
  const bucket = adminClient.storage.from(DOCUMENTS_BUCKET);
  const upload = await bucket.upload(path, pdf, { contentType: PDF_TYPE, upsert: true });
  if (upload.error) throw upload.error;
  try {
    await svcRecordCertificatePdf(adminClient, { certificateId: certificate.id, path, readerId });
  } catch (error) {
    await bucket.remove([path]);
    throw error;
  }
}

async function keepAll(
  adminClient: DatabaseClient,
  files: readonly { certificate: CertificateRow; pdf: Buffer }[],
  readerId: string | null,
): Promise<void> {
  for (let start = 0; start < files.length; start += KEEP_BATCH_SIZE) {
    const batch = files.slice(start, start + KEEP_BATCH_SIZE);
    await Promise.all(
      batch.map((file) => keepPdf(adminClient, file.certificate, file.pdf, readerId)),
    );
  }
}

// Renders these certificates as one document, one page each, and keeps every page as its own certificate's file.
async function renderAndKeep(
  adminClient: DatabaseClient,
  certificates: readonly CertificateRow[],
  context: CertificateContext,
): Promise<Map<string, Buffer>> {
  if (certificates.length === 0) return new Map();
  const input = await loadCertificatePages(
    adminClient,
    certificates.map((certificate) => certificate.id),
    context.siteUrl,
  );
  const bundle = await renderCertificatePdf(input);
  const pages = await splitPdfPages(
    bundle,
    input.pages.map((page) => page.certificateNumber),
  );
  // One page per certificate, or the files would carry the wrong person's page; nothing is kept then.
  if (pages.length !== input.ids.length)
    throw new Error('certificate pages do not match the certificates');
  const byId = new Map(certificates.map((certificate) => [certificate.id, certificate]));
  const files = input.ids.flatMap((id, index) => {
    const certificate = byId.get(id);
    const pdf = pages[index];
    return certificate && pdf ? [{ certificate, pdf }] : [];
  });
  await keepAll(adminClient, files, context.readerId);
  return new Map(files.map((file) => [file.certificate.id, file.pdf]));
}

async function storedPdf(adminClient: DatabaseClient, path: string): Promise<Buffer | null> {
  const { data, error } = await adminClient.storage.from(DOCUMENTS_BUCKET).download(path);
  if (error) return null;
  return Buffer.from(await data.arrayBuffer());
}

// What a first download renders with this certificate: itself for the group, else every participant certificate of
// the booking that has no kept file yet, so the class is rendered as one document once.
async function batchFor(
  adminClient: DatabaseClient,
  certificate: CertificateRow,
): Promise<CertificateRow[]> {
  if (certificate.kind === 'group') return [certificate];
  const servable = await servableCertificatesOf(adminClient, certificate.bookingId);
  const unkept = servable.filter((row) => row.kind === 'participant' && row.pdfPath === null);
  return unkept.some((row) => row.id === certificate.id) ? unkept : [...unkept, certificate];
}

// The PDF of a servable certificate whose reader was authorised: the kept file, else a fresh render that is kept.
export async function certificatePdf(
  adminClient: DatabaseClient,
  certificate: CertificateRow,
  context: CertificateContext,
): Promise<Buffer> {
  if (!isServable(certificate)) throw new AppError('NOT_FOUND');
  if (certificate.pdfPath !== null) {
    const stored = await storedPdf(adminClient, certificate.pdfPath);
    if (stored) return stored;
  }
  const rendered = await renderAndKeep(
    adminClient,
    await batchFor(adminClient, certificate),
    context,
  );
  const pdf = rendered.get(certificate.id);
  if (!pdf) throw new AppError('NOT_FOUND');
  return pdf;
}

// FR-ADMIN-07 "Render ulang": every servable certificate of the booking rendered again over its kept file, after the
// signatory or the template changed. Returns how many files were written.
export async function rerenderBookingCertificates(
  adminClient: DatabaseClient,
  bookingId: string,
  context: CertificateContext,
): Promise<number> {
  const servable = await servableCertificatesOf(adminClient, bookingId);
  const groups = servable.filter((row) => row.kind === 'group');
  const participants = servable.filter((row) => row.kind === 'participant');
  const [group, people] = await Promise.all([
    renderAndKeep(adminClient, groups, context),
    renderAndKeep(adminClient, participants, context),
  ]);
  return group.size + people.size;
}
