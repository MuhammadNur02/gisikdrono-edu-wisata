import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { EnumValue } from '@/db/enums';
import type { Database } from '@/db/types';
import { renderInvoicePdf } from '@/lib/pdf/invoice';
import { renderQuotationPdf } from '@/lib/pdf/quotation';
import { renderReceiptPdf } from '@/lib/pdf/receipt';
import { documentSnapshotSchema, type DocumentSnapshot } from '@/lib/validations/document-snapshot';

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

async function keepPdf(
  adminClient: DatabaseClient,
  document: BookingDocument,
  pdf: Buffer,
): Promise<void> {
  const path = storagePathFor(document);
  const upload = await adminClient.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, pdf, { contentType: PDF_TYPE, upsert: true });
  if (upload.error) throw upload.error;
  const { error } =
    document.kind === 'quotation'
      ? await adminClient.from('quotations').update({ pdf_path: path }).eq('id', document.id)
      : await adminClient
          .from('invoices')
          .update(document.kind === 'invoice' ? { pdf_path: path } : { receipt_pdf_path: path })
          .eq('id', document.id);
  if (error) throw error;
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
  if (isFinal) await keepPdf(adminClient, document, pdf);
  return pdf;
}
