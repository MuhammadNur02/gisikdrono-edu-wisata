import 'server-only';

import { createHash } from 'node:crypto';

import { svcRecordTicketPdf } from '@/db/rpc-documents';
import type { DatabaseClient } from '@/db/rpc-result';
import { renderTicketPdf } from '@/lib/pdf/ticket';
import { getTicketsForBooking } from '@/server/services/ticket-service';
import type { GuestTicket } from '@/types/ticket';

// The e-ticket PDF of a booking (Task P3.11.05; docs/Security.md §10.3): rendered on first need and kept in the
// private documents bucket as bookings/<id>/ticket-<code>.pdf, with the fingerprint of the tickets it shows, so a
// moved session, a corrected group size or a suspended ticket makes the next reader get a fresh file (review of
// PR #66, L1). The service-role client is handed in by document-service.ts or the outbox worker; every query here is
// by the booking id an authorised reader or a claimed outbox row gave.

const DOCUMENTS_BUCKET = 'documents';
const PDF_TYPE = 'application/pdf';
const USABLE_STATUSES: ReadonlySet<string> = new Set(['issued', 'used']);

export interface TicketDocument {
  bookingId: string;
  bookingCode: string;
  // The name it is stored and downloaded under.
  fileName: string;
  pdfPath: string | null;
  // The fingerprint of the tickets the kept file was rendered from; null when none is kept.
  pdfFingerprint: string | null;
  tickets: GuestTicket[];
}

export function ticketFileName(bookingCode: string): string {
  return `ticket-${bookingCode}.pdf`;
}

export async function loadTicketDocument(
  adminClient: DatabaseClient,
  bookingId: string,
): Promise<TicketDocument | null> {
  const { data, error } = await adminClient
    .from('bookings')
    .select('id, booking_code, ticket_pdf_path, ticket_pdf_fingerprint')
    .eq('id', bookingId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const tickets = await getTicketsForBooking(data.id, adminClient);
  if (tickets.length === 0) return null;
  return {
    bookingId: data.id,
    bookingCode: data.booking_code,
    fileName: ticketFileName(data.booking_code),
    pdfPath: data.ticket_pdf_path,
    pdfFingerprint: data.ticket_pdf_fingerprint,
    tickets,
  };
}

export function ticketStoragePath(document: TicketDocument): string {
  return `bookings/${document.bookingId}/${document.fileName}`;
}

// Everything a ticket page prints, in ticket order: when any of it changes, the kept file no longer tells the truth.
export function ticketsFingerprint(tickets: readonly GuestTicket[]): string {
  const printed = [...tickets]
    .sort((left, right) => left.ticketCode.localeCompare(right.ticketCode))
    .map((ticket) => [
      ticket.ticketCode,
      ticket.status,
      ticket.validOn,
      ticket.startTime,
      ticket.endTime,
      ticket.paxCount,
      ticket.rwName,
      ticket.qr?.path ?? null,
    ]);
  return createHash('sha256').update(JSON.stringify(printed)).digest('hex');
}

// A file is kept only while every ticket in it may still be scanned and has its QR: a suspended, revoked or retired
// ticket is rendered as it stands now, with its notice, so the file never shows a QR the gate would refuse.
export function isKeepable(document: TicketDocument): boolean {
  return document.tickets.every(
    (ticket) => USABLE_STATUSES.has(ticket.status) && ticket.qr !== null,
  );
}

// The kept file still shows these very tickets.
function isKeptFileCurrent(document: TicketDocument): boolean {
  return (
    document.pdfPath !== null && document.pdfFingerprint === ticketsFingerprint(document.tickets)
  );
}

async function storedPdf(adminClient: DatabaseClient, path: string): Promise<Buffer | null> {
  const { data, error } = await adminClient.storage.from(DOCUMENTS_BUCKET).download(path);
  if (error) return null;
  return Buffer.from(await data.arrayBuffer());
}

async function keepPdf(
  adminClient: DatabaseClient,
  document: TicketDocument,
  pdf: Buffer,
  readerId: string | null,
): Promise<string> {
  const path = ticketStoragePath(document);
  const upload = await adminClient.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, pdf, { contentType: PDF_TYPE, upsert: true });
  if (upload.error) throw upload.error;
  await svcRecordTicketPdf(adminClient, {
    bookingId: document.bookingId,
    path,
    fingerprint: ticketsFingerprint(document.tickets),
    readerId,
  });
  return path;
}

export interface TicketPdfContext {
  kelurahanAddress: string | null;
  // The staff member reading it, or null for the visitor and the outbox worker.
  readerId: string | null;
}

function render(document: TicketDocument, kelurahanAddress: string | null): Promise<Buffer> {
  return renderTicketPdf({
    bookingCode: document.bookingCode,
    tickets: document.tickets,
    kelurahanAddress,
  });
}

// The PDF bytes: the kept file while it still shows these tickets, else a fresh render, kept when it may be.
export async function ticketDocumentPdf(
  adminClient: DatabaseClient,
  document: TicketDocument,
  context: TicketPdfContext,
): Promise<Buffer> {
  const keepable = isKeepable(document);
  if (keepable && document.pdfPath !== null && isKeptFileCurrent(document)) {
    const stored = await storedPdf(adminClient, document.pdfPath);
    if (stored) return stored;
  }
  const pdf = await render(document, context.kelurahanAddress);
  if (keepable) await keepPdf(adminClient, document, pdf, context.readerId);
  return pdf;
}

// The kept file's path for the WhatsApp document header, rendering and keeping it first when none shows these
// tickets; null when the booking has no ticket file that may be kept (no tickets, or one no longer valid).
export async function keptTicketPdfPath(
  adminClient: DatabaseClient,
  bookingId: string,
  kelurahanAddress: string | null,
): Promise<string | null> {
  const document = await loadTicketDocument(adminClient, bookingId);
  if (document === null || !isKeepable(document)) return null;
  // A recorded path names a file that was uploaded first; the retention run clears the path with the file.
  if (document.pdfPath !== null && isKeptFileCurrent(document)) return document.pdfPath;
  return keepPdf(adminClient, document, await render(document, kelurahanAddress), null);
}
