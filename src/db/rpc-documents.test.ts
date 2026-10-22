import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { svcCreateQuotation } from '@/db/rpc-documents';

import { clientAnswering } from '../../tests/fixtures/postgrest-client';

describe('svcCreateQuotation', () => {
  const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
  const OFFICER_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000dd';
  const ISSUED = {
    quotation_id: '0192f3a4-5b6c-7d8e-9f01-0000000000cc',
    quotation_number: 'SP/GSK/2026/10/0007',
    verify_code: '7F3K9Q2M4A',
    version: 1,
    valid_until: '2026-11-06',
  };

  it("asks for the booking's quotation and reads the number, code, version and validity back", async () => {
    const { client, requests } = clientAnswering(200, ISSUED);
    await expect(svcCreateQuotation(client, BOOKING_ID)).resolves.toEqual({
      quotationId: ISSUED.quotation_id,
      quotationNumber: 'SP/GSK/2026/10/0007',
      verifyCode: '7F3K9Q2M4A',
      version: 1,
      validUntil: '2026-11-06',
    });
    expect(requests[0]).toEqual({
      url: 'http://supabase.test/rest/v1/rpc/svc_create_quotation',
      body: { p_booking_id: BOOKING_ID },
    });
  });

  it('names the officer who re-issues one', async () => {
    const { client, requests } = clientAnswering(200, { ...ISSUED, version: 2 });
    await svcCreateQuotation(client, BOOKING_ID, OFFICER_ID);
    expect(requests[0]?.body).toEqual({ p_booking_id: BOOKING_ID, p_actor_id: OFFICER_ID });
  });

  it('refuses a reply of another shape', async () => {
    const { client } = clientAnswering(200, { ...ISSUED, version: 4 });
    await expect(svcCreateQuotation(client, BOOKING_ID)).rejects.toBeInstanceOf(ZodError);
  });
});
