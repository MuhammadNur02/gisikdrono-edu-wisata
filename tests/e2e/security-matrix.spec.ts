import { expect, test } from '@playwright/test';

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

  test('the image optimiser refuses an address outside the public-media bucket', async ({
    request,
  }) => {
    const remote = encodeURIComponent('https://evil.example/a.png');
    const response = await request.get(`/_next/image?url=${remote}&w=640&q=75`, NO_REDIRECTS);
    expect(response.status()).toBe(400);
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

  test.beforeAll(async () => {
    await runSql(`insert into public.articles (rw_id, slug, title, body_json, status, published_at)
      values (null, ${sqlText(slug)}, 'Uji kenari XSS', ${sqlText(JSON.stringify(xssCanaryArticle))}::jsonb,
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
