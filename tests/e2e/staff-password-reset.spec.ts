import { randomUUID } from 'node:crypto';

import { expect, test, type Page, type Response } from '@playwright/test';

import { waitForAuthLink } from './helpers/mailbox';
import {
  ADMIN_RW05,
  AUTH_STEP,
  createAccount,
  removeAccounts,
  resetAuthLimits,
  waitForTurnstile,
} from './helpers/staff';

// Task P2.8.01 (docs/Security.md §5.1, AUTH-06, AUTH-09): /forgot-password answers every address alike, and the link
// in the email opens /reset-password, which still asks for the TOTP code. The reset emails count against the local
// stack's hourly email limit, so the flows run once, on the desktop project.

test.describe.configure({ timeout: 120_000 });

const createdAccounts: string[] = [];

test.beforeAll(async () => {
  await resetAuthLimits();
});

test.afterAll(async () => {
  await removeAccounts(createdAccounts);
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

// The answer's headers with their values, leaving out Date and the CSP nonce, which differ between any two answers.
async function headerShape(response: Response): Promise<string[]> {
  const headers = await response.headersArray();
  return headers
    .filter((header) => header.name.toLowerCase() !== 'date')
    .map(
      (header) =>
        `${header.name.toLowerCase()}: ${header.value.replace(/'nonce-[^']+'/g, "'nonce-…'")}`,
    )
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
  expect(await headerShape(staff)).toEqual(await headerShape(unknown));

  const link = await waitForAuthLink(ADMIN_RW05, askedAt);
  const elsewhere = await browser.newContext();
  const otherPage = await elsewhere.newPage();
  await otherPage.goto(link);
  await expect(otherPage).toHaveURL(/\/reset-password$/, AUTH_STEP);
  await expect(otherPage.getByLabel('Kode autentikator')).toBeVisible();
  await elsewhere.close();
});

// M2 of the PR #17 review: without a factor, the mailbox alone would set a permanent password (risk R24).
test('an account without an authenticator is sent to the superadmin, not to a new password', async ({
  page,
}, testInfo) => {
  test.skip(!isDesktop(testInfo.project.name), 'one run of the flow is enough');
  const account = await createAccount('admin_rw');
  createdAccounts.push(account.id);

  const askedAt = new Date(Date.now() - 2_000);
  await askForReset(page, account.email);
  await page.goto(await waitForAuthLink(account.email, askedAt));

  await expect(page).toHaveURL(/\/reset-password$/, AUTH_STEP);
  await expect(page.getByText('Hubungi superadmin untuk memulihkan akun.')).toBeVisible();
  await expect(page.getByLabel('Kata sandi baru')).toHaveCount(0);
});
