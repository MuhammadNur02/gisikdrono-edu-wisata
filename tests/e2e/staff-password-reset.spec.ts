import { randomUUID } from 'node:crypto';

import { expect, test, type Page, type Response } from '@playwright/test';

import { waitForRecoveryLink } from './helpers/mailbox';
import { ADMIN_RW05, AUTH_STEP, resetAuthLimits, waitForTurnstile } from './helpers/staff';

// Task P2.8.01 (docs/Security.md §5.1, AUTH-06, AUTH-09): /forgot-password answers every address alike, and the link
// in the email opens /reset-password, which still asks for the TOTP code. The reset emails count against the local
// stack's hourly email limit, so the flows run once, on the desktop project.

test.describe.configure({ timeout: 120_000 });

test.beforeAll(async () => {
  await resetAuthLimits();
});

const isDesktop = (projectName: string) => projectName === 'desktop';

async function askForReset(page: Page, email: string): Promise<Response> {
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(email);
  await waitForTurnstile(page);
  const [response] = await Promise.all([
    page.waitForResponse(
      (answer) =>
        answer.request().method() === 'POST' &&
        new URL(answer.url()).pathname === '/forgot-password',
      AUTH_STEP,
    ),
    page.getByRole('button', { name: 'Kirim tautan' }).click(),
  ]);
  await expect(page.getByRole('status').getByText('Cek email Anda')).toBeVisible(AUTH_STEP);
  return response;
}

// The names of the answer's headers, leaving out Date, which differs between any two answers.
async function headerNames(response: Response): Promise<string[]> {
  const headers = await response.headersArray();
  return headers
    .map((header) => header.name.toLowerCase())
    .filter((name) => name !== 'date')
    .sort();
}

// F1 of the PR #17 review: the PKCE reset wrote its verifier cookie only for an address that got an email.
test('a staff address and an unknown one get the same answer, and the link works in any browser', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(!isDesktop(testInfo.project.name), 'one run of the flow is enough');

  const unknown = await askForReset(page, `nobody-${randomUUID()}@example.test`);
  const askedAt = new Date(Date.now() - 2_000);
  const staff = await askForReset(page, ADMIN_RW05);

  expect(await staff.headerValue('set-cookie')).toBeNull();
  expect(await unknown.headerValue('set-cookie')).toBeNull();
  expect(await headerNames(staff)).toEqual(await headerNames(unknown));

  const link = await waitForRecoveryLink(ADMIN_RW05, askedAt);
  const elsewhere = await browser.newContext();
  const otherPage = await elsewhere.newPage();
  await otherPage.goto(link);
  await expect(otherPage).toHaveURL(/\/reset-password$/, AUTH_STEP);
  await expect(otherPage.getByLabel('Kode autentikator')).toBeVisible();
  await elsewhere.close();
});
