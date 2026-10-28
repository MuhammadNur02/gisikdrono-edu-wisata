import { expect, test, type BrowserContext } from '@playwright/test';
import { z } from 'zod';

import { paidTicketToday, removeUnbookedPackages, type GateTicket } from './helpers/gate';
import { guestLink, tokenVersionOf } from './helpers/guest-hub';
import { runSql, sqlText } from '../../scripts/local-stack';

// Review of PR #94, L6 (Task P4.5.03; docs/PRD.md FR-POST-02, FR-POST-03; docs/Security.md §6.7, §10.3, DOC-02): a
// visit checked in at the gate gets its certificates, and the certificate link reaches them. The institution's group
// certificate opens at once; a participant's waits for the last four digits of the PIC's verified number, and then
// each one and "Unduh semua" stream a PDF, private and no-store, each download audited under the visitor. 91 days
// after the visit the page and its downloads are refused. The check-in is the gate's own transition run in SQL, as
// scanner-gate.spec.ts proves the scanner's path to it.

test.describe.configure({ timeout: 120_000 });

const PARTICIPANTS = ['Ani Sertifikat', 'Budi Sertifikat'];
const RETENTION_DAYS_PLUS_ONE = 91;
const countRowsSchema = z.array(z.object({ count: z.coerce.number() }));
const STEP = { timeout: 15_000 };
// Every guest page, action and download checks its link against link_verify:ip (30 a minute, src/config/rate-limits.ts),
// and a refusal is the page's 404. Without x-real-ip the local server counts every request of the suite, both workers'
// included, in one bucket (src/lib/utils/client-ip.ts), so another spec's guest pages in the same minute could push
// this visitor's reload over the limit and onto the 404. Each project's visitor comes from its own TEST-NET-3 address,
// as staff-lockout.spec.ts does for sign-ins, so the ten or so checks this test makes are counted for it alone.
const VISITOR_IP_BY_PROJECT: Record<string, string> = {
  desktop: '203.0.113.31',
  'phone-360': '203.0.113.32',
};
const FALLBACK_VISITOR_IP = '203.0.113.39';

test.afterAll(async () => {
  await removeUnbookedPackages();
});

// The gate's check-in of the booking's one ticket with everyone present, then the certificates it issues.
async function checkInAndCertify(ticket: GateTicket): Promise<void> {
  const code = sqlText(ticket.bookingCode);
  await runSql(`do $$
    declare
      certified uuid := (select b.id from public.bookings b where b.booking_code = ${code});
    begin
      perform set_config('app.in_rpc', '1', true);
      perform set_config('app.actor_role', 'cron', true);
      insert into public.booking_participants (booking_id, seq_no, full_name, role_label)
      select certified, n.seq, n.name, 'student'
      from unnest(array[${PARTICIPANTS.map(sqlText).join(', ')}]) with ordinality as n(name, seq);
      update public.tickets_qr set status = 'used', checked_in_at = now(), checked_in_pax = pax_count, unpaid_pax = 0
      where tickets_qr.booking_id = certified;
      update public.booking_legs set status = 'checked_in', checked_in_at = now()
      where booking_legs.booking_id = certified;
      update public.bookings set status = 'checked_in', checked_in_at = now() where id = certified;
      perform internal.issue_certificates(certified, null);
    end;
    $$;`);
}

async function auditCount(bookingCode: string, action: string): Promise<number> {
  const [row] = countRowsSchema.parse(
    await runSql(`select count(*) from public.audit_logs a
      join public.bookings b on b.booking_code = ${sqlText(bookingCode)}
      where a.action = ${sqlText(action)} and a.actor_role = 'visitor'
        and (a.entity_id = b.id::text or a.metadata ->> 'booking_id' = b.id::text)`),
  );
  return row?.count ?? 0;
}

async function expectPdf(context: BrowserContext, path: string): Promise<void> {
  const response = await context.request.get(path, { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('application/pdf');
  expect(response.headers()['cache-control']).toContain('no-store');
  expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
}

test('reaches a released certificate through the certificate link and the last-4 step-up', async ({
  browser,
}, testInfo) => {
  const ticket = await paidTicketToday(5, testInfo);
  await checkInAndCertify(ticket);
  const base = `/reservasi/${ticket.bookingCode}/sertifikat`;
  const visitorIp = VISITOR_IP_BY_PROJECT[testInfo.project.name] ?? FALLBACK_VISITOR_IP;
  const visitor = await browser.newContext({ extraHTTPHeaders: { 'x-real-ip': visitorIp } });
  const page = await visitor.newPage();

  expect((await visitor.request.get(`${base}/unduh/rombongan`)).status()).toBe(404);
  await page.goto(
    guestLink(ticket.bookingCode, 'certificate', await tokenVersionOf(ticket.bookingCode)),
  );
  await expect(page.getByText(ticket.institutionName)).toBeVisible(STEP);
  await expectPdf(visitor, `${base}/unduh/rombongan`);
  const waiting = await visitor.request.get(`${base}/unduh/peserta-1`, { maxRedirects: 0 });
  expect(waiting.status()).toBe(303);
  expect(waiting.headers()['location']).toContain(base);
  await expect(page.getByText(PARTICIPANTS[0] ?? '')).toHaveCount(0);

  await page.getByLabel('Empat digit terakhir').fill(ticket.phoneLastDigits);
  await page.getByRole('button', { name: 'Buka sertifikat peserta' }).click();
  await expect(page.getByText(PARTICIPANTS[0] ?? '')).toBeVisible(STEP);
  await expect(page.getByRole('link', { name: /Unduh semua sertifikat peserta/ })).toBeVisible();
  await expectPdf(visitor, `${base}/unduh/peserta-1`);
  await expectPdf(visitor, `${base}/unduh/peserta`);
  expect((await visitor.request.get(`${base}/unduh/peserta-3`)).status()).toBe(404);

  expect(await auditCount(ticket.bookingCode, 'certificate.downloaded')).toBe(2);
  expect(await auditCount(ticket.bookingCode, 'certificate.bundle_downloaded')).toBe(1);
  const [proofs] = countRowsSchema.parse(
    await runSql(`select count(*) from public.security_events e
      join public.bookings b on b.booking_code = ${sqlText(ticket.bookingCode)}
      where e.event_type = 'pii_revealed' and e.actor_role = 'visitor' and e.entity_id = b.id::text`),
  );
  expect(proofs?.count).toBe(1);

  await runSql(`select set_config('app.in_rpc', '1', true);
    update public.bookings
    set visit_date = public.today_jkt() - ${String(RETENTION_DAYS_PLUS_ONE)},
        visit_date_end = public.today_jkt() - ${String(RETENTION_DAYS_PLUS_ONE)}
    where booking_code = ${sqlText(ticket.bookingCode)};`);
  await page.reload();
  await expect(page.getByText(/Sertifikat reservasi ini sudah tidak tersedia/)).toBeVisible(STEP);
  expect((await visitor.request.get(`${base}/unduh/rombongan`)).status()).toBe(404);
  await visitor.close();
});
