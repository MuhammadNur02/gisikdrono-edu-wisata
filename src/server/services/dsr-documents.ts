import 'server-only';

import type { DatabaseClient } from '@/db/rpc-result';
import { dsrCopy } from '@/lib/copy/dsr';
import { renderDsrExportPdf, type DsrExportData } from '@/lib/pdf/dsr-export';

// The access-request export of Task P4.10.03 (docs/Security.md §7.6): the booking's own data, read with the
// service-role client document-service.ts hands in, keyed by the booking of a request the superadmin has just read
// under RLS, and kept as two files under bookings/<id>/dsr/, the folder dsr_record_export checks. Nothing here goes
// back to the superadmin: the files reach the guest only through their own link (dsr-guest.ts).

const DOCUMENTS_BUCKET = 'documents';
const JSON_TYPE = 'application/json';
const PDF_TYPE = 'application/pdf';
const JSON_INDENT = 2;

const BOOKING_COLUMNS = `booking_code, pic_name, pic_phone, pic_email, institution_name, booker_type, visit_date,
  visit_date_end, pax_count, status, package_snapshot, notes, created_at`;

export interface DsrExportPaths {
  jsonPath: string;
  pdfPath: string;
}

export function dsrExportPaths(bookingId: string, requestId: string): DsrExportPaths {
  const folder = `bookings/${bookingId}/dsr/${requestId}`;
  return { jsonPath: `${folder}.json`, pdfPath: `${folder}.pdf` };
}

function packageNameOf(snapshot: unknown): string {
  if (typeof snapshot !== 'object' || snapshot === null || !('name' in snapshot)) return '';
  return typeof snapshot.name === 'string' ? snapshot.name : '';
}

async function readBooking(adminClient: DatabaseClient, bookingId: string) {
  const { data, error } = await adminClient
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('id', bookingId)
    .single();
  if (error) throw error;
  return data;
}

async function readLines(adminClient: DatabaseClient, bookingId: string) {
  const [participants, payments, invoices, quotations] = await Promise.all([
    adminClient
      .from('booking_participants')
      .select('seq_no, full_name, group_label, role_label')
      .eq('booking_id', bookingId)
      .order('seq_no'),
    adminClient
      .from('payments')
      .select('method, status, gross_amount, settlement_time')
      .eq('booking_id', bookingId)
      .order('created_at'),
    adminClient
      .from('invoices')
      .select('invoice_number, receipt_number, issued_at')
      .eq('booking_id', bookingId),
    adminClient
      .from('quotations')
      .select('quotation_number, issued_at')
      .eq('booking_id', bookingId),
  ]);
  for (const answer of [participants, payments, invoices, quotations]) {
    if (answer.error) throw answer.error;
  }
  return {
    participants: participants.data ?? [],
    payments: payments.data ?? [],
    invoices: invoices.data ?? [],
    quotations: quotations.data ?? [],
  };
}

type ExportBooking = Awaited<ReturnType<typeof readBooking>>;
type ExportLines = Awaited<ReturnType<typeof readLines>>;

function bookerOf(booking: ExportBooking): DsrExportData['booker'] {
  return {
    name: booking.pic_name,
    phone: booking.pic_phone,
    email: booking.pic_email,
    institution: booking.institution_name,
    bookerType: booking.booker_type,
  };
}

function visitOf(booking: ExportBooking): DsrExportData['visit'] {
  return {
    packageName: packageNameOf(booking.package_snapshot),
    visitDate: booking.visit_date,
    visitDateEnd: booking.visit_date_end,
    paxCount: booking.pax_count,
    status: booking.status,
    notes: booking.notes,
    createdAt: booking.created_at,
  };
}

function documentsOf(lines: ExportLines): DsrExportData['documents'] {
  return [
    ...lines.quotations.map((q) => ({
      label: 'SP',
      number: q.quotation_number,
      issuedAt: q.issued_at,
    })),
    ...lines.invoices.flatMap((i) => [
      { label: 'INV', number: i.invoice_number, issuedAt: i.issued_at },
      ...(i.receipt_number
        ? [{ label: 'KW', number: i.receipt_number, issuedAt: i.issued_at }]
        : []),
    ]),
  ];
}

export async function loadDsrExport(
  adminClient: DatabaseClient,
  bookingId: string,
  nowIso: string,
): Promise<DsrExportData> {
  const [booking, lines] = await Promise.all([
    readBooking(adminClient, bookingId),
    readLines(adminClient, bookingId),
  ]);
  return {
    bookingCode: booking.booking_code,
    generatedAt: nowIso,
    booker: bookerOf(booking),
    visit: visitOf(booking),
    participants: lines.participants.map((p) => ({
      seqNo: p.seq_no,
      fullName: p.full_name,
      groupLabel: p.group_label,
      roleLabel: p.role_label,
    })),
    payments: lines.payments.map((p) => ({
      method: p.method ?? dsrCopy.export.none,
      status: p.status,
      amount: p.gross_amount,
      settledAt: p.settlement_time,
    })),
    documents: documentsOf(lines),
  };
}

// Both files, or neither: a failed second upload takes the first one out again.
export async function keepDsrExport(
  adminClient: DatabaseClient,
  data: DsrExportData,
  paths: DsrExportPaths,
): Promise<void> {
  const bucket = adminClient.storage.from(DOCUMENTS_BUCKET);
  const json = Buffer.from(JSON.stringify(data, null, JSON_INDENT), 'utf8');
  const pdf = await renderDsrExportPdf(data);
  const first = await bucket.upload(paths.jsonPath, json, { contentType: JSON_TYPE, upsert: true });
  if (first.error) throw first.error;
  const second = await bucket.upload(paths.pdfPath, pdf, { contentType: PDF_TYPE, upsert: true });
  if (second.error) {
    await bucket.remove([paths.jsonPath]);
    throw second.error;
  }
}

export async function dropDsrExport(
  adminClient: DatabaseClient,
  paths: DsrExportPaths,
): Promise<void> {
  await adminClient.storage.from(DOCUMENTS_BUCKET).remove([paths.jsonPath, paths.pdfPath]);
}
