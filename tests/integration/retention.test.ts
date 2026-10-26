import { randomInt, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { lastAuditId } from './helpers/staff-session';
import { runTag, syntheticPhone } from './helpers/synthetic';
import { runSql, sqlText } from '../../scripts/local-stack';

// The nightly retention run of 02:00 WIB against the real tables (Task P5.1.02; docs/Security.md §7.6, PDP-03,
// CLAUDE.md §7.6): participants leave 90 days after the visit, an unpaid hold that expired or was cancelled loses its
// booker's contact and its participants after 7 days, and every booking loses its booker's contact
// pii_retention_months (24) after the visit. A booking inside each limit keeps everything. The bookings are written
// straight into the table in the states those dates mean, as the transition functions would have left them.

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PACKAGE_ID = randomUUID();
const RUN = runTag();

const codeOf = () =>
  `GSK-${Array.from({ length: 8 }, () => CROCKFORD[randomInt(0, CROCKFORD.length)] ?? '0').join('')}`;

// Each booking: its state, and how long ago its visit, expiry or cancellation was.
const BOOKINGS = {
  visitedLongAgo: { id: randomUUID(), status: 'completed', visitDaysAgo: 91 },
  visitedRecently: { id: randomUUID(), status: 'completed', visitDaysAgo: 89 },
  expiredLongAgo: { id: randomUUID(), status: 'expired', expiredDaysAgo: 8 },
  expiredRecently: { id: randomUUID(), status: 'expired', expiredDaysAgo: 6 },
  cancelledLongAgo: { id: randomUUID(), status: 'cancelled', expiredDaysAgo: 8 },
  visitedPastRetention: { id: randomUUID(), status: 'completed', visitDaysAgo: 25 * 31 },
  visitedWithinRetention: { id: randomUUID(), status: 'completed', visitDaysAgo: 23 * 30 },
} as const;

type BookingName = keyof typeof BOOKINGS;
type Fixture = (typeof BOOKINGS)[BookingName];

const PARTICIPANTS_PER_BOOKING = 2;
// A participant's certificate, with the PDF it was rendered to, for the oldest and the most recent visit.
const CERTIFIED: readonly BookingName[] = ['visitedLongAgo', 'visitedRecently'];
const pdfPathOf = (name: BookingName) => `certificates/${BOOKINGS[name].id}/peserta-1.pdf`;

function certificateRow(name: BookingName, index: number): string {
  const booking = BOOKINGS[name];
  const verifyCode = Array.from(
    { length: 10 },
    () => CROCKFORD[randomInt(0, CROCKFORD.length)] ?? '0',
  ).join('');
  return `('${booking.id}', (select p.id from public.booking_participants p where p.booking_id = '${booking.id}'
      and p.seq_no = 1), 'participant', 'SERT/GSK/2026/9${RUN}${String(index)}', '${verifyCode}',
    'Peserta ${name} 1', public.today_jkt() - ${String('visitDaysAgo' in booking ? booking.visitDaysAgo : 0)}, '{5}',
    '${pdfPathOf(name)}', now())`;
}

const stateSchema = z.array(
  z.object({
    pic_name: z.string().nullable(),
    pic_phone: z.string().nullable(),
    pic_email: z.string().nullable(),
    purged: z.boolean(),
    participants: z.number(),
  }),
);

function bookingRow(name: BookingName, index: number): string {
  const fixture: Fixture = BOOKINGS[name];
  const visitDaysAgo = 'visitDaysAgo' in fixture ? fixture.visitDaysAgo : -14;
  const lapsedDaysAgo = 'expiredDaysAgo' in fixture ? fixture.expiredDaysAgo : null;
  const isPaid = fixture.status === 'completed';
  const lapsedAt =
    lapsedDaysAgo === null ? 'null' : `now() - interval '${String(lapsedDaysAgo)} days'`;
  return `('${fixture.id}', '${codeOf()}', '${fixture.status}', '${PACKAGE_ID}', '{}', '{5}', 'school',
    'Bu Retensi ${String(index)}', ${sqlText(syntheticPhone(RUN, index))}, 'retensi${RUN}${String(index)}@contoh.test',
    now(), 10, public.today_jkt() - ${String(visitDaysAgo)}, public.today_jkt() - ${String(visitDaysAgo)},
    300000, 300000, ${isPaid ? '300000' : '0'}, ${isPaid ? `now() - interval '${String(visitDaysAgo + 7)} days'` : 'null'},
    ${fixture.status === 'expired' ? lapsedAt : 'null'}, ${fixture.status === 'cancelled' ? lapsedAt : 'null'},
    'v1', now() - interval '1 year')`;
}

async function stateOf(name: BookingName) {
  const rows = stateSchema.parse(
    await runSql(`select b.pic_name, b.pic_phone, b.pic_email::text, b.pii_purged_at is not null as purged,
        (select count(*)::int from public.booking_participants p where p.booking_id = b.id) as participants
      from public.bookings b where b.id = '${BOOKINGS[name].id}'`),
  );
  return rows[0];
}

let auditIdBefore = 0;

beforeAll(async () => {
  auditIdBefore = await lastAuditId();
  const names = Object.keys(BOOKINGS) as BookingName[];
  const participants = names.flatMap((name) =>
    Array.from(
      { length: PARTICIPANTS_PER_BOOKING },
      (_, seq) =>
        `('${BOOKINGS[name].id}', ${String(seq + 1)}, ${sqlText(`Peserta ${name} ${String(seq + 1)}`)})`,
    ),
  );
  await runSql(`select set_config('app.in_rpc', '1', true);
    insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status)
      values ('${PACKAGE_ID}', 5, 'regular', 'uji-retensi-${RUN}', 'Paket Uji Retensi', 'per_pax', 30000, 'published');
    insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
      pic_phone, pic_email, phone_verified_at, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
      amount_paid, paid_at, expired_at, cancelled_at, consent_version, consented_at)
    values ${names.map((name, index) => bookingRow(name, index)).join(',\n')};
    insert into public.booking_participants (booking_id, seq_no, full_name) values ${participants.join(', ')};
    insert into public.certificates (booking_id, participant_id, kind, certificate_number, verify_code, recipient_name,
      visit_date, rw_ids, pdf_path, rendered_at)
    values ${CERTIFIED.map((name, index) => certificateRow(name, index)).join(', ')};`);
});

// One query string is one transaction, so the purge and fence switches end with it.
afterAll(async () => {
  await runSql(`select set_config('app.purge', 'on', true), set_config('app.in_rpc', '1', true);
    delete from public.certificates where booking_id in (select id from public.bookings where package_id = '${PACKAGE_ID}');
    delete from public.booking_participants where booking_id in (select id from public.bookings where package_id = '${PACKAGE_ID}');
    delete from public.bookings where package_id = '${PACKAGE_ID}';
    delete from public.package_price_history where package_id = '${PACKAGE_ID}';
    delete from public.tour_packages where id = '${PACKAGE_ID}';
    delete from public.audit_logs where id > ${String(auditIdBefore)};`);
});

describe('the retention run', () => {
  it('removes the participants of a visit more than 90 days past and keeps a more recent one', async () => {
    await runSql('select internal.purge_participants()');

    expect(await stateOf('visitedLongAgo')).toMatchObject({ participants: 0, purged: false });
    expect(await stateOf('visitedRecently')).toMatchObject({
      participants: PARTICIPANTS_PER_BOOKING,
      purged: false,
    });
  });

  it('erases the participant from the old certificate and hands its PDF to the storage purge', async () => {
    const certificates = z
      .array(
        z.object({
          booking_id: z.string(),
          recipient_name: z.string(),
          participant: z.boolean(),
          purged: z.boolean(),
          purgeable: z.boolean(),
        }),
      )
      .parse(
        await runSql(`select c.booking_id::text, c.recipient_name, c.participant_id is not null as participant,
            c.purged_at is not null as purged,
            exists (select 1 from internal.purgeable_files(1000) f where f.path = c.pdf_path) as purgeable
          from public.certificates c
          where c.booking_id in ('${BOOKINGS.visitedLongAgo.id}', '${BOOKINGS.visitedRecently.id}')`),
      );
    const byBooking = new Map(certificates.map((row) => [row.booking_id, row]));
    expect(byBooking.get(BOOKINGS.visitedLongAgo.id)).toMatchObject({
      recipient_name: '[dihapus]',
      participant: false,
      purged: true,
      purgeable: true,
    });
    expect(byBooking.get(BOOKINGS.visitedRecently.id)).toMatchObject({
      recipient_name: 'Peserta visitedRecently 1',
      participant: true,
      purged: false,
      purgeable: false,
    });
  });

  it('erases an unpaid hold a week after it lapsed, and every booking 24 months after its visit', async () => {
    await runSql('select internal.anonymise_booker_pii()');

    const erased = {
      pic_name: 'anon',
      pic_phone: null,
      pic_email: null,
      purged: true,
      participants: 0,
    };
    expect(await stateOf('expiredLongAgo')).toEqual(erased);
    expect(await stateOf('cancelledLongAgo')).toEqual(erased);
    expect(await stateOf('visitedPastRetention')).toMatchObject({
      pic_name: 'anon',
      pic_phone: null,
      purged: true,
    });
    expect(await stateOf('expiredRecently')).toMatchObject({
      pic_name: 'Bu Retensi 3',
      purged: false,
      participants: PARTICIPANTS_PER_BOOKING,
    });
    expect(await stateOf('visitedRecently')).toMatchObject({
      pic_name: 'Bu Retensi 1',
      purged: false,
    });
    expect(await stateOf('visitedWithinRetention')).toMatchObject({
      pic_name: 'Bu Retensi 6',
      pic_phone: syntheticPhone(RUN, 6),
      purged: false,
    });
  });

  it('records each run in the audit log by its counts alone', async () => {
    const rows = z.array(z.object({ job: z.string(), metadata: z.string() })).parse(
      await runSql(`select metadata ->> 'job' as job, metadata::text as metadata from public.audit_logs
          where id > ${String(auditIdBefore)} and action = 'purge_run' order by id`),
    );
    expect(rows.map((row) => row.job)).toEqual(['purge_participants', 'anonymise_booker_pii']);
    for (const row of rows) expect(row.metadata).not.toContain('Retensi');
  });

  it('changes nothing more when it runs again the same night', async () => {
    const before = await Promise.all((Object.keys(BOOKINGS) as BookingName[]).map(stateOf));
    await runSql('select internal.purge_participants(); select internal.anonymise_booker_pii();');
    const after = await Promise.all((Object.keys(BOOKINGS) as BookingName[]).map(stateOf));
    expect(after).toEqual(before);
  });
});
