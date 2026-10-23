import { randomInt, randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { Database } from '@/db/types';
import { bookingDocumentFile, readBookingDocument } from '@/server/services/document-service';

import { lastAuditId } from './helpers/staff-session';
import { localStack, runSql, sqlText } from '../../scripts/local-stack';

// A booking's quotation rendered, kept and served again against the real stack (Task P3.6.04; review of PR #33,
// finding 1): the unit tests stand in for the database, so only this run proves the audit trigger accepts the write
// that records the kept file, and that the second read comes from storage rather than a fresh render.
vi.mock('next/cache', () => ({ unstable_cache: <Read>(read: Read) => read }));
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () =>
    createClient<Database>(localStack().apiUrl, localStack().serviceRoleKey, {
      auth: { persistSession: false },
    }),
}));
vi.mock('@/lib/supabase/anon', () => ({
  createSupabaseAnonClient: () =>
    createClient(localStack().apiUrl, localStack().anonKey, { auth: { persistSession: false } }),
}));

const PACKAGE_ID = '00000000-0000-4000-9000-0000000d0001';
const SESSION_ID = '00000000-0000-4000-9000-0000000d0101';
const PHONE = `+62857${String(randomInt(100000, 999999))}77`;
const SLOW_MS = 120_000;

const idRowsSchema = z.array(z.object({ id: z.string() }));

let auditIdBefore = 0;
let quotationId = '';

async function quotedBookingWithItsQuotation(): Promise<string> {
  const otpId = randomUUID();
  const rows = idRowsSchema.parse(
    await runSql(`insert into public.guest_otps (id, purpose, phone, code_hash, browser_hash, expires_at, verified_at)
        values ('${otpId}', 'booking_phone', ${sqlText(PHONE)}, repeat('a', 64), repeat('b', 64),
                now() + interval '5 minutes', now());
      select (internal.create_booking('${PACKAGE_ID}', array['${SESSION_ID}']::uuid[], 20,
        jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Integrasi', 'pic_name', 'Ani Integrasi',
                           'pic_phone', ${sqlText(PHONE)}, 'pic_email', 'integrasi@contoh.test', 'notes', null),
        '[]', '[]', 'quote', 'web', null, '${otpId}', '{"version": "2026-10-18"}', null,
        '{"ip": null, "user_agent": "Integration"}',
        internal.booking_quote_hash(internal.booking_quote('${PACKAGE_ID}', 20, '[]', array[5]::smallint[])))
        ->> 'booking_id') as id;`),
  );
  const bookingId = rows[0]?.id ?? '';
  const issued = idRowsSchema.parse(
    await runSql(
      `select (internal.issue_first_quotation('${bookingId}') ->> 'quotation_id') as id`,
    ),
  );
  return issued[0]?.id ?? '';
}

beforeAll(async () => {
  auditIdBefore = await lastAuditId();
  await runSql(`insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status)
      values ('${PACKAGE_ID}', 5, 'regular', 'uji-integrasi-dokumen', 'Paket Uji Dokumen', 'per_pax', 30000, 'published');
    insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
      ('${SESSION_ID}', 5, public.today_jkt() + 6, '13:05', '14:05', 'Uji dokumen', 40);`);
  quotationId = await quotedBookingWithItsQuotation();
}, SLOW_MS);

// One query string is one transaction, so the purge and fence switches end with it.
afterAll(async () => {
  const kept = z
    .array(z.object({ pdf_path: z.string().nullable() }))
    .parse(await runSql(`select pdf_path from public.quotations where id = '${quotationId}'`));
  const path = kept[0]?.pdf_path;
  if (path) {
    const admin = createClient<Database>(localStack().apiUrl, localStack().serviceRoleKey, {
      auth: { persistSession: false },
    });
    await admin.storage.from('documents').remove([path]);
  }
  const bookings = `select id from public.bookings where package_id = '${PACKAGE_ID}'`;
  await runSql(`select set_config('app.purge', 'on', true), set_config('app.in_rpc', '1', true);
    delete from public.notifications where booking_id in (${bookings});
    delete from public.quotations where booking_id in (${bookings});
    delete from public.booking_events where booking_id in (${bookings});
    delete from public.booking_legs where booking_id in (${bookings});
    delete from public.guest_otps where phone = ${sqlText(PHONE)};
    delete from public.bookings where package_id = '${PACKAGE_ID}';
    delete from public.visit_sessions where id = '${SESSION_ID}';
    delete from public.package_price_history where package_id = '${PACKAGE_ID}';
    delete from public.tour_packages where id = '${PACKAGE_ID}';
    delete from public.audit_logs where id > ${String(auditIdBefore)};`);
}, SLOW_MS);

describe('a booking document through document-service', () => {
  it(
    "renders the issued quotation on its first read and records the kept file under the visitor's name",
    async () => {
      const document = await readBookingDocument('quotation', quotationId);
      if (!document) throw new Error('the quotation should be there');
      const pdf = await bookingDocumentFile(document, null);
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

      const rows = z
        .array(z.object({ pdf_path: z.string().nullable(), actor_role: z.string().nullable() }))
        .parse(
          await runSql(`select q.pdf_path,
              (select a.actor_role from public.audit_logs a
               where a.entity_type = 'quotations' and a.entity_id = q.id::text and a.action = 'quotations.update'
               order by a.id desc limit 1) as actor_role
            from public.quotations q where q.id = '${quotationId}'`),
        );
      expect(rows[0]?.pdf_path).toBe(
        `bookings/${document.bookingId}/quotation-${document.number.replaceAll('/', '-')}.pdf`,
      );
      expect(rows[0]?.actor_role).toBe('visitor');
    },
    SLOW_MS,
  );

  it(
    'serves the kept file on the next read instead of rendering again',
    async () => {
      const kept = await readBookingDocument('quotation', quotationId);
      if (!kept?.pdfPath) throw new Error('the quotation should name its kept file');
      const first = await bookingDocumentFile(kept, null);
      const again = await bookingDocumentFile(kept, null);
      expect(again.equals(first)).toBe(true);
    },
    SLOW_MS,
  );
});
