import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { svcIssueFirstQuotation, svcRecordDocumentPdf } from '@/db/rpc-documents';

import { clientAnswering } from '../../tests/fixtures/postgrest-client';

const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const QUOTATION_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000cc';
const OFFICER_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000dd';

describe('svcIssueFirstQuotation', () => {
  const ISSUED = {
    quotation_id: QUOTATION_ID,
    quotation_number: 'SP/GSK/2026/10/0007',
    verify_code: '7F3K9Q2M4A',
    version: 1,
    valid_until: '2026-11-06',
  };

  it("asks for the booking's first quotation and reads the number, code, version and validity back", async () => {
    const { client, requests } = clientAnswering(200, ISSUED);
    await expect(svcIssueFirstQuotation(client, BOOKING_ID)).resolves.toEqual({
      quotationId: QUOTATION_ID,
      quotationNumber: 'SP/GSK/2026/10/0007',
      verifyCode: '7F3K9Q2M4A',
      version: 1,
      validUntil: '2026-11-06',
    });
    expect(requests[0]).toEqual({
      url: 'http://supabase.test/rest/v1/rpc/svc_issue_first_quotation',
      body: { p_booking_id: BOOKING_ID },
    });
  });

  it('answers null when the booking has its quotation already', async () => {
    const { client } = clientAnswering(200, null);
    await expect(svcIssueFirstQuotation(client, BOOKING_ID)).resolves.toBeNull();
  });

  it('refuses a reply of another shape', async () => {
    const { client } = clientAnswering(200, { ...ISSUED, version: 4 });
    await expect(svcIssueFirstQuotation(client, BOOKING_ID)).rejects.toBeInstanceOf(ZodError);
  });
});

describe('svcRecordDocumentPdf', () => {
  const PATH = `bookings/${BOOKING_ID}/quotation-SP-GSK-2026-10-0007.pdf`;

  it('records the kept file under the staff reader who opened it', async () => {
    const { client, requests } = clientAnswering(204, null);
    await svcRecordDocumentPdf(client, {
      kind: 'quotation',
      documentId: QUOTATION_ID,
      path: PATH,
      readerId: OFFICER_ID,
    });
    expect(requests[0]).toEqual({
      url: 'http://supabase.test/rest/v1/rpc/svc_record_document_pdf',
      body: {
        p_kind: 'quotation',
        p_document_id: QUOTATION_ID,
        p_path: PATH,
        p_actor_id: OFFICER_ID,
      },
    });
  });

  it('names no actor for a visitor, which the function records as the visitor', async () => {
    const { client, requests } = clientAnswering(204, null);
    await svcRecordDocumentPdf(client, {
      kind: 'receipt',
      documentId: QUOTATION_ID,
      path: PATH,
      readerId: null,
    });
    expect(requests[0]?.body).toEqual({
      p_kind: 'receipt',
      p_document_id: QUOTATION_ID,
      p_path: PATH,
    });
  });
});
