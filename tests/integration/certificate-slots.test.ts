import { randomInt, randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/db/types';
import { guestCertificateFile } from '@/server/services/guest-certificate-downloads';
import { participantCertificateIdsOf } from '@/server/services/guest-certificate-reads';
import { loadGuestCertificates } from '@/server/services/guest-certificates';

import { lastAuditId } from './helpers/staff-session';
import { runTag, syntheticPhone } from './helpers/synthetic';
import { localStack, runSql, sqlText } from '../../scripts/local-stack';

// The guest certificate page's participant slots against the real tables (review of PR #107, L3): peserta-<n> counts in
// the order the booking's participant certificates were issued, whatever became of them since, so revoking the first
// leaves peserta-1 empty and keeps peserta-2 and peserta-3 on the second and third persons. The unit tests stand in for
// these queries; only this run proves participantCertificateIdsOf, standingCertificatesOf and servableCertificatesOf
// agree on the database's own order. The booking is written straight into the table as a checked-in visit would leave
// it, as retention.test.ts does.

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RUN = runTag();
const PACKAGE_ID = randomUUID();
const BOOKING_ID = randomUUID();
const PEOPLE = ['Ani Slot', 'Budi Slot', 'Citra Slot'] as const;
const TODAY = new Date().toISOString().slice(0, 'YYYY-MM-DD'.length);

const randomCode = (length: number) =>
  Array.from({ length }, () => CROCKFORD[randomInt(0, CROCKFORD.length)] ?? '0').join('');

const adminClient = () =>
  createClient<Database>(localStack().apiUrl, localStack().serviceRoleKey, {
    auth: { persistSession: false },
  });

// One participant certificate per person, issued a minute apart in the list's order, all released.
function certificateRow(seq: number): string {
  return `('${BOOKING_ID}', (select p.id from public.booking_participants p where p.booking_id = '${BOOKING_ID}'
      and p.seq_no = ${String(seq)}), 'participant', 'SERT/GSK/2026/8${RUN}${String(seq)}', '${randomCode(10)}',
    ${sqlText(PEOPLE[seq - 1] ?? '')}, public.today_jkt() - 1, '{5}', now() - interval '${String(10 - seq)} minutes',
    now())`;
}

let auditIdBefore = 0;

beforeAll(async () => {
  auditIdBefore = await lastAuditId();
  const participants = PEOPLE.map(
    (name, index) => `('${BOOKING_ID}', ${String(index + 1)}, ${sqlText(name)})`,
  );
  await runSql(`select set_config('app.in_rpc', '1', true);
    insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status)
      values ('${PACKAGE_ID}', 5, 'regular', 'uji-slot-${RUN}', 'Paket Uji Slot', 'per_pax', 30000, 'published');
    insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
      pic_phone, pic_email, phone_verified_at, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
      amount_paid, paid_at, consent_version, consented_at)
    values ('${BOOKING_ID}', 'GSK-${randomCode(8)}', 'completed', '${PACKAGE_ID}', '{}', '{5}', 'school', 'Bu Slot',
      ${sqlText(syntheticPhone(RUN, 1))}, 'slot${RUN}@contoh.test', now(), 3, public.today_jkt() - 1,
      public.today_jkt() - 1, 90000, 90000, 90000, now() - interval '7 days', 'v1', now() - interval '8 days');
    insert into public.booking_participants (booking_id, seq_no, full_name) values ${participants.join(', ')};
    insert into public.certificates (booking_id, participant_id, kind, certificate_number, verify_code, recipient_name,
      visit_date, rw_ids, issued_at, released_at)
    values ${[1, 2, 3].map(certificateRow).join(', ')};`);
  await runSql(`select set_config('app.in_rpc', '1', true);
    update public.certificates set status = 'revoked', revoked_at = now(), revoke_reason = 'Uji slot'
    where booking_id = '${BOOKING_ID}' and recipient_name = ${sqlText(PEOPLE[0])};`);
});

// One query string is one transaction, so the purge and fence switches end with it.
afterAll(async () => {
  await runSql(`select set_config('app.purge', 'on', true), set_config('app.in_rpc', '1', true);
    delete from public.certificates where booking_id = '${BOOKING_ID}';
    delete from public.booking_participants where booking_id = '${BOOKING_ID}';
    delete from public.bookings where id = '${BOOKING_ID}';
    delete from public.package_price_history where package_id = '${PACKAGE_ID}';
    delete from public.tour_packages where id = '${PACKAGE_ID}';
    delete from public.audit_logs where id > ${String(auditIdBefore)};`);
});

describe('participant certificate slots (review of PR #107, L3)', () => {
  it('counts every participant certificate the booking was issued, the revoked one included, in issue order', async () => {
    const ids = await participantCertificateIdsOf(adminClient(), BOOKING_ID);
    expect(ids).toHaveLength(PEOPLE.length);
  });

  it('keeps peserta-2 and peserta-3 on the second and third persons once the first is revoked', async () => {
    const view = await loadGuestCertificates(adminClient(), {
      bookingId: BOOKING_ID,
      hasPhoneProof: true,
      today: TODAY,
    });
    expect(view.state).toBe('ready');
    const slots =
      view.state === 'ready' ? view.certificates.map((row) => [row.slot, row.recipient]) : [];
    expect(slots).toEqual([
      ['peserta-2', PEOPLE[1]],
      ['peserta-3', PEOPLE[2]],
    ]);
  });

  it('leaves peserta-1 empty: its download is the 404 of an unknown slot', async () => {
    await expect(
      guestCertificateFile(adminClient(), {
        bookingId: BOOKING_ID,
        bookingCode: 'GSK-0000SLOT',
        slot: { kind: 'participant', position: 1 },
        hasPhoneProof: true,
        today: TODAY,
        siteUrl: 'http://localhost:3000',
        ipHash: 'a'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
