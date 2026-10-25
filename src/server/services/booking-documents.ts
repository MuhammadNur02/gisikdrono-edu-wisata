import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { EnumValue } from '@/db/enums';
import { svcRecordDocumentPdf } from '@/db/rpc-documents';
import type { Database } from '@/db/types';
import { renderInvoicePdf } from '@/lib/pdf/invoice';
import { renderQuotationPdf } from '@/lib/pdf/quotation';
import { renderReceiptPdf } from '@/lib/pdf/receipt';
import { documentSnapshotSchema, type DocumentSnapshot } from '@/lib/validations/document-snapshot';
import type { VerifiedDocument } from '@/types/documents';

// A booking's own documents (Task P3.6.04; docs/Security.md §10.3, §10.4): the rows the database wrote, rendered on
// first request and kept in the private documents bucket. The service-role client is handed in by document-service.ts,
// the only module that may create it; every query here is by the id the route was given, after the reader was
// authorised against the row's booking.

type DatabaseClient = SupabaseClient<Database>;

export const BOOKING_DOCUMENT_KINDS = ['quotation', 'invoice', 'receipt'] as const;
export type BookingDocumentKind = (typeof BOOKING_DOCUMENT_KINDS)[number];

const DOCUMENTS_BUCKET = 'documents';
const PDF_TYPE = 'application/pdf';

interface DocumentRow {
  bookingId: string;
  bookingCode: string;
  snapshot: DocumentSnapshot;
  number: string;
  pdfPath: string | null;
}

export type BookingDocument =
  | (DocumentRow & {
      kind: 'quotation';
      id: string;
      verifyCode: string;
      version: number;
      issuedAt: string;
      status: EnumValue<'quotation_status'>;
    })
  | (DocumentRow & {
      kind: 'invoice';
      id: string;
      issuedAt: string;
      status: EnumValue<'invoice_status'>;
    })
  | (DocumentRow & { kind: 'receipt'; id: string; invoiceNumber: string });

export interface DocumentContext {
  kelurahanAddress: string | null;
  siteUrl: string;
  // Who reads it: the staff member's id, or null for the visitor; the kept file is recorded under their name.
  readerId: string | null;
}

const QUOTATION_COLUMNS =
  'id, booking_id, quotation_number, verify_code, version, status, issued_at, snapshot, pdf_path, bookings!inner(booking_code)';
const INVOICE_COLUMNS =
  'id, booking_id, invoice_number, receipt_number, status, issued_at, snapshot, pdf_path, receipt_pdf_path, bookings!inner(booking_code)';

async function loadQuotation(
  adminClient: DatabaseClient,
  id: string,
): Promise<BookingDocument | null> {
  const { data, error } = await adminClient
    .from('quotations')
    .select(QUOTATION_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    kind: 'quotation',
    id: data.id,
    bookingId: data.booking_id,
    bookingCode: data.bookings.booking_code,
    snapshot: documentSnapshotSchema.parse(data.snapshot),
    number: data.quotation_number,
    verifyCode: data.verify_code,
    version: data.version,
    issuedAt: data.issued_at,
    status: data.status,
    pdfPath: data.pdf_path,
  };
}

async function loadInvoiceRow(adminClient: DatabaseClient, id: string) {
  const { data, error } = await adminClient
    .from('invoices')
    .select(INVOICE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadInvoice(
  adminClient: DatabaseClient,
  id: string,
): Promise<BookingDocument | null> {
  const row = await loadInvoiceRow(adminClient, id);
  if (!row) return null;
  return {
    kind: 'invoice',
    id: row.id,
    bookingId: row.booking_id,
    bookingCode: row.bookings.booking_code,
    snapshot: documentSnapshotSchema.parse(row.snapshot),
    number: row.invoice_number,
    issuedAt: row.issued_at,
    status: row.status,
    pdfPath: row.pdf_path,
  };
}

// A receipt is the invoice row's receipt number: there is none until the invoice is paid.
async function loadReceipt(
  adminClient: DatabaseClient,
  id: string,
): Promise<BookingDocument | null> {
  const row = await loadInvoiceRow(adminClient, id);
  if (!row?.receipt_number) return null;
  return {
    kind: 'receipt',
    id: row.id,
    bookingId: row.booking_id,
    bookingCode: row.bookings.booking_code,
    snapshot: documentSnapshotSchema.parse(row.snapshot),
    number: row.receipt_number,
    invoiceNumber: row.invoice_number,
    pdfPath: row.receipt_pdf_path,
  };
}

export function loadBookingDocument(
  adminClient: DatabaseClient,
  kind: BookingDocumentKind,
  id: string,
): Promise<BookingDocument | null> {
  if (kind === 'quotation') return loadQuotation(adminClient, id);
  if (kind === 'invoice') return loadInvoice(adminClient, id);
  return loadReceipt(adminClient, id);
}

// The file name a document is stored and downloaded under: its number with the slashes turned into dashes.
export function documentFileName(document: BookingDocument): string {
  return `${document.kind}-${document.number.replaceAll('/', '-')}.pdf`;
}

function storagePathFor(document: BookingDocument): string {
  return `bookings/${document.bookingId}/${documentFileName(document)}`;
}

// A document in its final state is rendered once and kept; one whose stamp may still change (a quotation that was
// superseded, an invoice not yet paid) is rendered as it stands now, so what the reader gets never lies.
export function isFinalState(document: BookingDocument): boolean {
  if (document.kind === 'quotation') return document.status === 'issued';
  if (document.kind === 'invoice') return document.status === 'paid';
  return true;
}

function render(document: BookingDocument, context: DocumentContext): Promise<Buffer> {
  if (document.kind === 'quotation') {
    return renderQuotationPdf({
      snapshot: document.snapshot,
      quotationNumber: document.number,
      verifyCode: document.verifyCode,
      version: document.version,
      issuedAt: document.issuedAt,
      status: document.status,
      kelurahanAddress: context.kelurahanAddress,
      siteUrl: context.siteUrl,
    });
  }
  if (document.kind === 'invoice') {
    return renderInvoicePdf({
      snapshot: document.snapshot,
      invoiceNumber: document.number,
      status: document.status,
      issuedAt: document.issuedAt,
      kelurahanAddress: context.kelurahanAddress,
      kind: 'invoice',
    });
  }
  return renderReceiptPdf({
    snapshot: document.snapshot,
    receiptNumber: document.number,
    invoiceNumber: document.invoiceNumber,
    kelurahanAddress: context.kelurahanAddress,
  });
}

async function storedPdf(adminClient: DatabaseClient, path: string): Promise<Buffer | null> {
  const { data, error } = await adminClient.storage.from(DOCUMENTS_BUCKET).download(path);
  if (error) return null;
  return Buffer.from(await data.arrayBuffer());
}

// The row's path column is written by internal.record_document_pdf, which names the reader as the actor the audit
// trigger asks for (review of PR #33, finding 1).
async function keepPdf(
  adminClient: DatabaseClient,
  document: BookingDocument,
  pdf: Buffer,
  readerId: string | null,
): Promise<void> {
  const path = storagePathFor(document);
  const upload = await adminClient.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, pdf, { contentType: PDF_TYPE, upsert: true });
  if (upload.error) throw upload.error;
  await svcRecordDocumentPdf(adminClient, {
    kind: document.kind,
    documentId: document.id,
    path,
    readerId,
  });
}

// The PDF bytes: the stored file of a final document, else a fresh render, kept when the document is final.
export async function bookingDocumentPdf(
  adminClient: DatabaseClient,
  document: BookingDocument,
  context: DocumentContext,
): Promise<Buffer> {
  const isFinal = isFinalState(document);
  if (isFinal && document.pdfPath) {
    const stored = await storedPdf(adminClient, document.pdfPath);
    if (stored) return stored;
  }
  const pdf = await render(document, context);
  if (isFinal) await keepPdf(adminClient, document, pdf, context.readerId);
  return pdf;
}

const QUOTATION_VERIFY_COLUMNS =
  'quotation_number, version, valid_until, status, bookings!inner(institution_name)';
const CERTIFICATE_VERIFY_COLUMNS =
  'recipient_name, institution_name, visit_date, status, purged_at';

// A document by its verify code (docs/PRD.md FR-PUB-20): the quotation or certificate the code names, or null. The
// code is random and unique across both tables (internal.new_verify_code), so a quotation is tried first. A certificate
// still held back for unpaid people has gone out to nobody, so its code names nothing yet (Task P4.5.03); a purged
// participant certificate keeps its number and status but no name (docs/PRD.md FR-POST-08).
export async function lookupVerifyCode(
  adminClient: DatabaseClient,
  code: string,
): Promise<VerifiedDocument | null> {
  const quotation = await adminClient
    .from('quotations')
    .select(QUOTATION_VERIFY_COLUMNS)
    .eq('verify_code', code)
    .maybeSingle();
  if (quotation.error) throw quotation.error;
  if (quotation.data) {
    return {
      kind: 'quotation',
      number: quotation.data.quotation_number,
      institutionName: quotation.data.bookings.institution_name,
      version: quotation.data.version,
      validUntil: quotation.data.valid_until,
      status: quotation.data.status,
    };
  }
  const certificate = await adminClient
    .from('certificates')
    .select(CERTIFICATE_VERIFY_COLUMNS)
    .eq('verify_code', code)
    .not('released_at', 'is', null)
    .maybeSingle();
  if (certificate.error) throw certificate.error;
  if (!certificate.data) return null;
  return {
    kind: 'certificate',
    recipientName: certificate.data.purged_at === null ? certificate.data.recipient_name : null,
    institutionName: certificate.data.institution_name,
    visitDate: certificate.data.visit_date,
    status: certificate.data.status,
  };
}
