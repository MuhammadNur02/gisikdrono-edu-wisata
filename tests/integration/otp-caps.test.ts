import { randomInt, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { lastAuditId } from './helpers/staff-session';
import {
  runTag,
  SYNTHETIC_PHONE_PREFIX,
  syntheticPhone,
  syntheticPhonesOf,
} from './helpers/synthetic';
import { runSql, sqlText } from '../../scripts/local-stack';

// The WhatsApp code caps of internal.issue_phone_otp (Task P5.1.02; docs/Security.md §4.1, GUEST-04): one code a minute
// per number and browser, five a day per number and browser, fifteen a day per number, twenty a day per IP, and the
// soft breaker of 500 codes a day, past which WhatsApp codes stop, the visitor is offered an email code instead and
// a critical alert is raised. Earlier codes are written straight into guest_otps, a few hours old, as the day's
// history; each case uses numbers of its own.

const RUN = runTag();
const BREAKER = 500;
const PER_BROWSER = 5;
const PER_NUMBER = 15;
const PER_IP = 20;
const HISTORY_AGE = "interval '3 hours'";

const replySchema = z.array(z.object({ reply: z.object({ result: z.string() }) }));

const phoneOf = (index: number) => syntheticPhone(RUN, index);
const browserOf = (label: string) => label.padEnd(8, '0').slice(0, 8).repeat(8);
const BROWSER = browserOf('aaaaaaaa');
const OTHER_BROWSER = browserOf('bbbbbbbb');

async function issue(
  target: { phone?: string; email?: string },
  browser = BROWSER,
  ip: string | null = null,
) {
  const channel = target.phone ? 'whatsapp' : 'email';
  const rows = replySchema.parse(
    await runSql(`select internal.issue_phone_otp('${randomUUID()}', 'booking_phone', '${channel}', '${browser}',
        repeat('c', 64), '123456', ${target.phone ? sqlText(target.phone) : 'null'},
        ${target.email ? sqlText(target.email) : 'null'}, null, ${ip ? `${sqlText(ip)}::inet` : 'null'}) as reply`),
  );
  return rows[0]?.reply.result;
}

// Codes issued earlier today, for one number from one browser and IP each.
async function history(rows: { phone: string; browser?: string; ip?: string }[]): Promise<void> {
  const values = rows
    .map(
      (row) => `(gen_random_uuid(), 'booking_phone', ${sqlText(row.phone)}, repeat('a', 64),
        '${row.browser ?? BROWSER}', now() - ${HISTORY_AGE} + interval '5 minutes', now() - ${HISTORY_AGE},
        ${row.ip ? `${sqlText(row.ip)}::inet` : 'null'})`,
    )
    .join(', ');
  await runSql(`insert into public.guest_otps (id, purpose, phone, code_hash, browser_hash, expires_at, created_at, ip)
    values ${values}`);
}

let auditIdBefore = 0;
let suiteStart = '';

beforeAll(async () => {
  auditIdBefore = await lastAuditId();
  const [start] = z
    .array(z.object({ now: z.string() }))
    .parse(await runSql('select now()::text as now'));
  suiteStart = start?.now ?? '';
  await runSql(
    `update public.site_settings set value = 'true' where key in ('whatsapp_enabled', 'email_enabled')`,
  );
});

// One query string is one transaction, so the purge switch ends with it.
afterAll(async () => {
  await runSql(`select set_config('app.purge', 'on', true);
    delete from public.notifications where template = 'phone_otp'
      and (recipient like '${syntheticPhonesOf(RUN)}' or recipient like 'otp${RUN}%');
    -- The out-of-band messages the breaker's alerts queued for the superadmins (review of PR #84, L-6).
    delete from public.notifications where template = 'security_alert' and created_at >= ${sqlText(suiteStart)}::timestamptz;
    delete from public.guest_otps where phone like '${syntheticPhonesOf(RUN)}' or email like 'otp${RUN}%';
    delete from public.security_alerts
      where fingerprint in ('otp_breaker:half:' || public.today_jkt(), 'otp_breaker:tripped:' || public.today_jkt());
    delete from public.audit_logs where id > ${String(auditIdBefore)};`);
});

describe('the WhatsApp code caps', () => {
  it('sends a code, then asks the same browser to wait a minute for the next one', async () => {
    await expect(issue({ phone: phoneOf(1) })).resolves.toBe('sent');
    await expect(issue({ phone: phoneOf(1) })).resolves.toBe('cooldown');
    await expect(issue({ phone: phoneOf(1) }, OTHER_BROWSER)).resolves.toBe('sent');
  });

  it('stops a number at five codes a day from one browser', async () => {
    await history(Array.from({ length: PER_BROWSER - 1 }, () => ({ phone: phoneOf(2) })));
    await expect(issue({ phone: phoneOf(2) })).resolves.toBe('sent');
    await history(Array.from({ length: PER_BROWSER }, () => ({ phone: phoneOf(3) })));
    await expect(issue({ phone: phoneOf(3) })).resolves.toBe('limited');
  });

  it('stops a number at fifteen codes a day across browsers', async () => {
    const browsers = ['cccccccc', 'dddddddd', 'eeeeeeee'].map(browserOf);
    const earlier = (phone: string, count: number) =>
      history(
        Array.from({ length: count }, (_, index) => ({
          phone,
          browser: browsers[index % browsers.length],
        })),
      );
    await earlier(phoneOf(4), PER_NUMBER - 1);
    await expect(issue({ phone: phoneOf(4) }, browserOf('ffffffff'))).resolves.toBe('sent');
    await earlier(phoneOf(5), PER_NUMBER);
    await expect(issue({ phone: phoneOf(5) }, browserOf('ffffffff'))).resolves.toBe('limited');
  });

  it('stops an IP at twenty codes a day across numbers', async () => {
    const ip = `198.51.100.${String(randomInt(1, 254))}`;
    await history(
      Array.from({ length: PER_IP - 1 }, (_, index) => ({ phone: phoneOf(20 + index), ip })),
    );
    await expect(issue({ phone: phoneOf(49) }, BROWSER, ip)).resolves.toBe('sent');
    await expect(issue({ phone: phoneOf(50) }, BROWSER, ip)).resolves.toBe('limited');
    await expect(issue({ phone: phoneOf(51) }, BROWSER, '198.51.100.255')).resolves.toBe('sent');
  });
});

describe('the soft breaker of 500 WhatsApp codes a day', () => {
  it('offers no email code while WhatsApp codes go out', async () => {
    await expect(issue({ email: `otp${RUN}a@contoh.test` })).resolves.toBe('unavailable');
  });

  it('stops WhatsApp codes past 500, raises a critical alert and opens email codes', async () => {
    await runSql(`insert into public.guest_otps (id, purpose, phone, code_hash, browser_hash, expires_at, created_at)
      select gen_random_uuid(), 'booking_phone', '${SYNTHETIC_PHONE_PREFIX}${RUN}' || lpad(n::text, 3, '0'), repeat('a', 64),
             repeat('b', 64), now(), now() - ${HISTORY_AGE}
      from generate_series(1, ${String(BREAKER)}) as n`);

    await expect(issue({ phone: phoneOf(60) })).resolves.toBe('degraded');
    const alerts = z.array(z.object({ severity: z.string() })).parse(
      await runSql(`select severity::text from public.security_alerts
          where fingerprint = 'otp_breaker:tripped:' || public.today_jkt() and acknowledged_at is null`),
    );
    expect(alerts).toEqual([{ severity: 'critical' }]);
    await expect(issue({ email: `otp${RUN}b@contoh.test` })).resolves.toBe('sent');
  });
});
