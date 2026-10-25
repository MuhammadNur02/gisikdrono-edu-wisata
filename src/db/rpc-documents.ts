import 'server-only';

import { z } from 'zod';

import { resultOf, type DatabaseClient } from '@/db/rpc-result';

// The typed wrappers over the document functions of the booking flow (Task P3.6): the first quotation of a quoted
// booking, and the file a rendered document was kept in.
// The service-role client is handed in by the allow-listed services (CLAUDE.md §6.1).

const QUOTATION_NUMBER = /^SP\/GSK\/\d{4}\/\d{2}\/\d{4,}$/;
const VERIFY_CODE = /^[0-9A-HJKMNP-TV-Z]{10}$/;
const MAX_QUOTATION_VERSION = 3;

const quotationReplySchema = z.strictObject({
  quotation_id: z.uuid(),
  quotation_number: z.string().regex(QUOTATION_NUMBER),
  verify_code: z.string().regex(VERIFY_CODE),
  version: z.int().min(1).max(MAX_QUOTATION_VERSION),
  valid_until: z.iso.date(),
});

export interface QuotationIssued {
  quotationId: string;
  quotationNumber: string;
  verifyCode: string;
  version: number;
  validUntil: string;
}

// The first Surat Penawaran of a quoted booking (Task P3.6.01, P3.6.06), or null when it has one already or is no longer
// quoted: the visitor's next try issues it when the first answer was lost (review of PR #33, finding 3). A number never
// verified comes back as the Postgres error, which mapError reads by its hint.
export async function svcIssueFirstQuotation(
  adminClient: DatabaseClient,
  bookingId: string,
): Promise<QuotationIssued | null> {
  const reply = quotationReplySchema
    .nullable()
    .parse(
      await resultOf(adminClient.rpc('svc_issue_first_quotation', { p_booking_id: bookingId })),
    );
  if (reply === null) return null;
  return {
    quotationId: reply.quotation_id,
    quotationNumber: reply.quotation_number,
    verifyCode: reply.verify_code,
    version: reply.version,
    validUntil: reply.valid_until,
  };
}

export type KeptDocumentKind = 'quotation' | 'invoice' | 'receipt';

// The file a rendered document was kept in, recorded on its row under the reader's name: readerId is the staff member
// who opened it, or null for the visitor (review of PR #33, finding 1).
export function svcRecordDocumentPdf(
  adminClient: DatabaseClient,
  kept: { kind: KeptDocumentKind; documentId: string; path: string; readerId: string | null },
): Promise<void> {
  return resultOf(
    adminClient.rpc('svc_record_document_pdf', {
      p_kind: kept.kind,
      p_document_id: kept.documentId,
      p_path: kept.path,
      p_actor_id: kept.readerId ?? undefined,
    }),
  );
}

// The kept e-ticket file of a booking with the fingerprint of the tickets it shows (Task P3.11.05, 20261030080100),
// under the reader's name as svcRecordDocumentPdf records the others.
export function svcRecordTicketPdf(
  adminClient: DatabaseClient,
  kept: { bookingId: string; path: string; fingerprint: string; readerId: string | null },
): Promise<void> {
  return resultOf(
    adminClient.rpc('svc_record_ticket_pdf', {
      p_booking_id: kept.bookingId,
      p_path: kept.path,
      p_fingerprint: kept.fingerprint,
      p_actor_id: kept.readerId ?? undefined,
    }),
  );
}
