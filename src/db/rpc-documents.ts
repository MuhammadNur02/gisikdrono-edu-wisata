import 'server-only';

import { z } from 'zod';

import { resultOf, type DatabaseClient } from '@/db/rpc-result';

// The typed wrappers over the document functions of the booking flow (Task P3.6): the quotation of a quoted booking.
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

// The Surat Penawaran of a quoted booking (Task P3.6.01). A fourth version, a booking that is not quoted and a number
// never verified come back as the Postgres error, which mapError reads by its hint. actorId is the officer re-issuing
// it, or null for the visitor's own request.
export async function svcCreateQuotation(
  adminClient: DatabaseClient,
  bookingId: string,
  actorId: string | null = null,
): Promise<QuotationIssued> {
  const reply = quotationReplySchema.parse(
    await resultOf(
      adminClient.rpc('svc_create_quotation', {
        p_booking_id: bookingId,
        p_actor_id: actorId ?? undefined,
      }),
    ),
  );
  return {
    quotationId: reply.quotation_id,
    quotationNumber: reply.quotation_number,
    verifyCode: reply.verify_code,
    version: reply.version,
    validUntil: reply.valid_until,
  };
}
