import { randomInt, randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';
import { z } from 'zod';

import { guestLink, tokenVersionOf } from './helpers/guest-hub';
import {
  directive,
  enforcedPolicyOf,
  expectedHeadersFor,
  expectPrivateAndNoIndex,
  NO_REDIRECTS,
  SCANNER_PATH,
} from './helpers/security-headers';
import {
  createRwAdmin,
  createSuperadmin,
  removeAccounts,
  signInToDashboard,
} from './helpers/staff';
import { runSql, sqlText } from '../../scripts/local-stack';
import { xssCanaryArticle } from '../fixtures/xss-canary-article';

// Task P5.3.02, the rest of the matrix. Every check reads a status code, a header or a redirect, never a public
// page's markup, which the redesign is rebuilding; the XSS canary watches for a script that runs, not for a tag.

// A package pnpm db:seed publishes (scripts/seed-dev.sql).
const SEEDED_PACKAGE_SLUG = 'paket-eduwisata-ecowastreme';
const WEBHOOK_PATHS = ['/api/webhooks/whatsapp', '/api/webhooks/resend'];
// The jobs security.spec.ts does not already call without a bearer.
const OTHER_JOB_PATHS = ['/api/jobs/anomaly-scan', '/api/jobs/payments-poll'];

test.describe('the security smoke, the remaining matrix (Task P5.3.02)', () => {
  for (const path of OTHER_JOB_PATHS) {
    test(`${path} without the cron bearer is a 401`, async ({ request }) => {
      expect((await request.post(path, NO_REDIRECTS)).status()).toBe(401);
    });
  }

  for (const path of WEBHOOK_PATHS) {
    test(`${path} without a signature is a 403`, async ({ request }) => {
      const response = await request.post(path, {
        data: { object: 'whatsapp_business_account' },
        ...NO_REDIRECTS,
      });
      expect(response.status()).toBe(403);
    });
  }

  test('the WhatsApp verification handshake with a wrong verify token is a 403', async ({
    request,
  }) => {
    const response = await request.get(
      '/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=bukan-token&hub.challenge=123',
      NO_REDIRECTS,
    );
    expect(response.status()).toBe(403);
  });

  // next.config.ts sets a custom loader (Supabase resizes public-media images), so Next.js' own optimiser is not
  // served at all and the address is a 404; with the optimiser on, its pinned remotePatterns would answer 400.
  // Either way it never fetches or returns another site's file.
  test('the image optimiser never proxies an address outside the public-media bucket', async ({
    request,
  }) => {
    const remote = encodeURIComponent('https://evil.example/a.png');
    const response = await request.get(`/_next/image?url=${remote}&w=640&q=75`, NO_REDIRECTS);
    expect([400, 404]).toContain(response.status());
    expect(response.headers()['content-type'] ?? '').not.toMatch(/^image\//);
  });
});

test.describe('signed in as an RW 05 officer (AZ-03, STAFF-02)', () => {
  test.skip(({ isMobile }) => isMobile, 'one run is enough');
  test.describe.configure({ timeout: 90_000 });

  // An account of its own: the seeded RW 05 officer signs in from other workers, and a TOTP code twice in one
  // window is refused as a replay.
  let officer: { id: string; email: string } | undefined;

  test.beforeAll(async () => {
    officer = await createRwAdmin(5);
  });

  test.afterAll(async () => {
    await removeAccounts(officer ? [officer.id] : []);
  });

  test('an upload for RW 08 is a 403, and one for RW 05 gets past the RW check', async ({
    page,
    baseURL,
  }) => {
    await signInToDashboard(page, officer?.email ?? '');
    const sign = (rwId: number) =>
      page.request.post('/api/uploads/sign', {
        headers: { origin: baseURL ?? '' },
        data: { rwId, contentType: 'image/webp', size: 100, leadingBytes: 'UklGRg==' },
        ...NO_REDIRECTS,
      });
    const foreign = await sign(8);
    expect(foreign.status()).toBe(403);
    await expect(foreign.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    expect((await sign(5)).status()).not.toBe(403);
  });
});

test.describe('the dashboard as the superadmin: headers, cookies and the CSP (HDR-01, HDR-02, AUTH-05)', () => {
  test.skip(({ isMobile }) => isMobile, 'one run is enough');
  test.describe.configure({ timeout: 90_000 });

  let superadmin: { id: string; email: string } | undefined;

  test.beforeAll(async () => {
    superadmin = await createSuperadmin();
  });

  test.afterAll(async () => {
    await removeAccounts(superadmin ? [superadmin.id] : []);
  });

  test('/dashboard and the scanner carry the baseline headers, an enforced CSP and no-store', async ({
    page,
  }) => {
    await signInToDashboard(page, superadmin?.email ?? '');
    for (const path of ['/dashboard', SCANNER_PATH]) {
      const response = await page.request.get(path, NO_REDIRECTS);
      expect(response.status(), path).toBe(200);
      const headers = response.headers();
      for (const [name, value] of Object.entries(expectedHeadersFor(path))) {
        expect(headers[name], `${path} ${name}`).toBe(value);
      }
      const policy = enforcedPolicyOf(response);
      expect(policy).toContain("frame-ancestors 'none'");
      expect(directive(policy, 'script-src')).toContain("'strict-dynamic'");
      expectPrivateAndNoIndex(response);
    }
  });

  test('the session cookies are out of reach of page scripts', async ({ page, context }) => {
    await signInToDashboard(page, superadmin?.email ?? '');
    const cookies = await context.cookies();
    const sessionCookies = cookies.filter((cookie) => cookie.name.startsWith('sb-'));
    expect(sessionCookies.length).toBeGreaterThan(0);
    for (const cookie of sessionCookies) expect(cookie.httpOnly, cookie.name).toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toMatch(/(^|;\s*)sb-/);
  });
});

// docs/Security.md APP-03, APP-11 (the canary of tests/fixtures/xss-canary-article.ts): published as postgres, read
// as a visitor. Nothing the stored document holds may run: no dialog opens and no error page is served.
test.describe('the XSS canary article', () => {
  test.skip(({ isMobile }) => isMobile, 'one run is enough');

  const slug = `uji-e2e-kenari-${String(Date.now())}`;

  // The canary's image nodes point outside the article's own folder, which the database itself refuses
  // (articles_media_paths, pgTAP content_media_paths.sql); what reaches the page is everything else.
  const storable = {
    ...xssCanaryArticle,
    content: xssCanaryArticle.content.filter((node) => node.type !== 'image'),
  };

  test.beforeAll(async () => {
    await runSql(`insert into public.articles (rw_id, slug, title, body_json, status, published_at)
      values (null, ${sqlText(slug)}, 'Uji kenari XSS', ${sqlText(JSON.stringify(storable))}::jsonb,
              'published', now())`);
  });

  test.afterAll(async () => {
    await runSql(`delete from public.articles where slug = ${sqlText(slug)}`);
  });

  test('runs nothing it stores', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    const response = await page.goto(`/artikel/${slug}`);
    expect(response?.status()).toBe(200);
    await page.waitForLoadState('load');
    // A link the renderer let through with a script address would run on a click; there should be none, and if there
    // is one, clicking it must still open no dialog.
    for (const link of await page.locator('a[href^="javascript:"], a[href^="data:"]').all()) {
      await link.click({ noWaitAfter: true, timeout: 2_000 }).catch(() => undefined);
    }
    expect(dialogs).toEqual([]);
  });
});

// The status hub of a real booking (after #69): the link signed as src/lib/links/mint.ts signs it becomes an httpOnly
// cookie on a redirect that drops the token from the address, and the hub answers with the booking headers of
// docs/Security.md §8.2. The hold is written straight through internal.create_booking.
test.describe('the status hub of a real booking (HDR-01, HDR-02, GUEST-02)', () => {
  test.skip(({ isMobile }) => isMobile, 'one run is enough');

  const run = String(Date.now()).slice(-6);
  const sessionId = randomUUID();
  const phone = `+628110${run}${String(randomInt(10, 99))}`;
  // A minute of its own, so a run of the other project or an earlier run never takes the same session slot.
  const startMinute = randomInt(7 * 60, 15 * 60);
  const clock = (minute: number) =>
    `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  let bookingCode = '';

  test.beforeAll(async () => {
    const otpId = randomUUID();
    const rows = z.array(z.object({ code: z.string() })).parse(
      await runSql(`insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity)
          values ('${sessionId}', 5, public.today_jkt() + 21, '${clock(startMinute)}', '${clock(startMinute + 50)}',
                  'Uji hub keamanan ${run}', 50);
        insert into public.guest_otps (id, purpose, phone, code_hash, browser_hash, expires_at, verified_at)
          values ('${otpId}', 'booking_phone', ${sqlText(phone)}, repeat('a', 64), repeat('b', 64),
                  now() + interval '5 minutes', now());
        with pkg as (select id from public.tour_packages where slug = ${sqlText(SEEDED_PACKAGE_SLUG)})
        select internal.create_booking((select id from pkg), array['${sessionId}']::uuid[], 2,
          jsonb_build_object('booker_type', 'individual', 'institution_name', null, 'pic_name', 'Tamu Keamanan',
                             'pic_phone', ${sqlText(phone)}, 'pic_email', 'keamanan${run}@contoh.test', 'notes', null),
          '[]', '[]', 'pay', 'web', null, '${otpId}', '{"version": "2026-10-18"}', null,
          '{"ip": null, "user_agent": "e2e"}',
          internal.booking_quote_hash(internal.booking_quote((select id from pkg), 2, '[]', array[5]::smallint[])))
          ->> 'booking_code' as code;`),
    );
    bookingCode = rows[0]?.code ?? '';
  });

  test.afterAll(async () => {
    const booking = `select id from public.bookings where booking_code = ${sqlText(bookingCode)}`;
    await runSql(`select set_config('app.purge', 'on', true), set_config('app.in_rpc', '1', true);
      delete from public.notifications where booking_id in (${booking});
      delete from public.booking_events where booking_id in (${booking});
      delete from public.booking_legs where booking_id in (${booking});
      delete from public.guest_otps where phone = ${sqlText(phone)};
      delete from public.bookings where booking_code = ${sqlText(bookingCode)};
      update public.visit_sessions set reserved_pax = 0 where id = '${sessionId}';
      delete from public.visit_sessions where id = '${sessionId}';`);
  });

  test('turns the link into an httpOnly cookie and drops the token from the address', async ({
    request,
  }) => {
    const version = await tokenVersionOf(bookingCode);
    const hop = await request.get(guestLink(bookingCode, 'view', version), NO_REDIRECTS);
    expect(hop.status()).toBeGreaterThanOrEqual(300);
    expect(hop.status()).toBeLessThan(400);
    const location = new URL(hop.headers()['location'] ?? '', hop.url());
    expect(location.pathname).toBe(`/reservasi/${bookingCode}`);
    expect(location.searchParams.has('t')).toBe(false);
    const cookie = hop
      .headersArray()
      .find(
        (header) => header.name.toLowerCase() === 'set-cookie' && header.value.startsWith('bk_'),
      );
    expect(cookie?.value).toMatch(/;\s*HttpOnly/i);
    expectPrivateAndNoIndex(hop);
  });

  test('answers with no Referer, an enforced CSP and no-store', async ({ request }) => {
    const version = await tokenVersionOf(bookingCode);
    const response = await request.get(guestLink(bookingCode, 'view', version));
    expect(response.status()).toBe(200);
    expect(new URL(response.url()).pathname).toBe(`/reservasi/${bookingCode}`);
    const headers = response.headers();
    for (const [name, value] of Object.entries(expectedHeadersFor(`/reservasi/${bookingCode}`))) {
      expect(headers[name], name).toBe(value);
    }
    const policy = enforcedPolicyOf(response);
    expect(policy).toContain("frame-ancestors 'none'");
    expect(directive(policy, 'script-src')).toContain("'strict-dynamic'");
    expectPrivateAndNoIndex(response);
  });

  test('a tampered or expired link opens nothing', async ({ request }) => {
    const version = await tokenVersionOf(bookingCode);
    const genuine = guestLink(bookingCode, 'view', version);
    const signatureAt = genuine.lastIndexOf('.') + 1;
    const flipped = genuine.charAt(signatureAt) === 'A' ? 'B' : 'A';
    const tampered = genuine.slice(0, signatureAt) + flipped + genuine.slice(signatureAt + 1);
    expect((await request.get(tampered)).status()).toBe(404);
    expect((await request.get(guestLink(bookingCode, 'view', version, -3600))).status()).toBe(404);
  });
});
