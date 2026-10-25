import { expect, test, type Page } from '@playwright/test';

import {
  ADMIN_RW05,
  AUTH_STEP,
  createAccount,
  hasHorizontalScroll,
  removeAccounts,
  resetAuthLimits,
  signInToDashboard,
  submitPassword,
  submitTotp,
  SUPERADMIN,
} from './helpers/staff';
import { totpCode } from '../../scripts/dev-accounts';
import { copy } from '../../src/lib/copy/id';

// Task P2.8 (docs/Security.md §5, AUTH-03, AUTH-06, APP-05): staff reach the dashboard only with a password and a
// TOTP code, and the shell shows each role its own part. The flows run on the desktop project; the phone project
// checks the pages at 360 px.

// Each flow takes two or three sign-in steps (AUTH_STEP each), more than the default 30 s per test.
test.describe.configure({ timeout: 120_000 });

const createdAccounts: string[] = [];

test.beforeAll(async () => {
  await resetAuthLimits();
});

test.afterAll(async () => {
  await removeAccounts(createdAccounts);
});

const isDesktop = (projectName: string) => projectName === 'desktop';
// The RW switch renders the whole dashboard again, figures and all, which a loaded CI runner takes longer for.
const SWITCH_STEP = { timeout: 60_000 };
const HTTP_OK = 200;

const ENCODING_HEADERS = new Set(['content-encoding', 'content-length']);

// The bodies of the sign-in answers in order, read on their way to the page: the form keeps its last alert when a new
// submit never reaches the action, so only the answers show what the server said each time (RV-L4 of the independent
// review of PR #17). The browser keeps no copy of a streamed Server Action answer to read afterwards.
async function recordSignInAnswers(page: Page): Promise<string[]> {
  const answers: string[] = [];
  await page.route('**/login*', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    const body = await response.text();
    answers.push(body);
    // route.fetch hands the body back decoded, so its encoding headers must not go with it.
    const headers = Object.fromEntries(
      Object.entries(response.headers()).filter(([name]) => !ENCODING_HEADERS.has(name)),
    );
    return route.fulfill({ status: response.status(), headers, body });
  });
  return answers;
}

test('a visitor opening the dashboard is sent to sign in, and the page is kept for later', async ({
  page,
}) => {
  await page.goto('/dashboard/sessions');

  await expect(page).toHaveURL('/login?next=%2Fdashboard%2Fsessions', AUTH_STEP);
  await expect(page.getByRole('heading', { name: 'Masuk ke dasbor' })).toBeVisible();
  expect(await hasHorizontalScroll(page)).toBe(false);
});

test('a wrong password and an unknown address get the same answer', async ({ page }, testInfo) => {
  test.skip(!isDesktop(testInfo.project.name), 'one run of the flow is enough');
  const account = await createAccount('admin_rw');
  createdAccounts.push(account.id);
  const message = 'Email atau kata sandi tidak cocok.';

  const answers = await recordSignInAnswers(page);

  await page.goto('/login');
  await submitPassword(page, account.email, 'Wrong-Password-123!');
  await expect.poll(() => answers.length, AUTH_STEP).toBe(1);
  await submitPassword(page, 'nobody@example.test', 'Wrong-Password-123!');
  await expect.poll(() => answers.length, AUTH_STEP).toBe(2);

  const [wrongPassword, unknownAddress] = answers;
  expect(wrongPassword).toContain(message);
  expect(unknownAddress).toBe(wrongPassword);
  await expect(page.getByText(message, { exact: false })).toBeVisible(AUTH_STEP);
  await expect(page).toHaveURL(/\/login/, AUTH_STEP);
});

test('a password alone opens nothing: the AAL1 session is sent to the TOTP step', async ({
  page,
}, testInfo) => {
  test.skip(!isDesktop(testInfo.project.name), 'one run of the flow is enough');
  await page.goto('/login?next=%2Fdashboard%2Fsessions');
  await submitPassword(page, SUPERADMIN);
  await expect(page).toHaveURL('/mfa/verify?next=%2Fdashboard%2Fsessions', AUTH_STEP);

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/mfa\/verify/, AUTH_STEP);
  await page.goto('/dashboard/profile');
  await expect(page).toHaveURL(/\/mfa\/verify/, AUTH_STEP);

  await submitTotp(page);
  await expect(page).toHaveURL('/dashboard/profile', AUTH_STEP);
});

test('the superadmin sees every group and the RwSwitcher, and signing out ends the session', async ({
  page,
}, testInfo) => {
  test.skip(!isDesktop(testInfo.project.name), 'one run of the flow is enough');
  await signInToDashboard(page, SUPERADMIN);
  const sidebar = page.getByRole('navigation', { name: 'Menu dasbor' });

  for (const item of ['Reservasi', 'Ulasan', 'Rekonsiliasi', 'Pengguna', 'Peringatan Keamanan']) {
    await expect(sidebar.getByRole('link', { name: item })).toBeVisible();
  }
  const rw05 = page.getByRole('group', { name: 'Tampilkan data' }).getByRole('button', {
    name: 'RW 05',
  });
  // The switch's Server Action answers with the whole dashboard rendered again for RW 05, and its button stays
  // disabled until that render has arrived, the overview's figures included. Clicking while the first figures were
  // still streaming, then re-clicking a button that was only waiting, timed out under CI load. So: the first
  // overview in full, the page settled (hydrated), one click, and the action's own answer before the state.
  await expect(page.getByRole('region', { name: copy.dashboard.overview.kpiLabel })).toBeVisible(
    AUTH_STEP,
  );
  await page.waitForLoadState('networkidle');
  const switchAnswer = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.request().headers()['next-action'] !== undefined,
    SWITCH_STEP,
  );
  const clickedAt = Date.now();
  await rw05.click();
  const answer = await switchAnswer;
  testInfo.annotations.push({
    type: 'rw-switch',
    description: `HTTP ${String(answer.status())} after ${String(Date.now() - clickedAt)} ms`,
  });
  expect(answer.status()).toBe(HTTP_OK);
  await expect(rw05).toHaveAttribute('aria-pressed', 'true', SWITCH_STEP);

  await page.getByRole('button', { name: 'Keluar' }).click();
  await expect(page).toHaveURL('/login', AUTH_STEP);
  await page.goto('/dashboard');
  // The dashboard itself is the default next page, so the address carries no next parameter.
  await expect(page).toHaveURL('/login', AUTH_STEP);
});

test('an RW officer sees only their own groups and never the RwSwitcher', async ({
  page,
}, testInfo) => {
  await signInToDashboard(page, ADMIN_RW05);
  await expect(page.getByRole('group', { name: 'Tampilkan data' })).toHaveCount(0);

  if (!isDesktop(testInfo.project.name)) {
    expect(await hasHorizontalScroll(page)).toBe(false);
    await page.getByRole('button', { name: 'Buka menu dasbor' }).click();
  }
  const nav = page.getByRole('navigation', { name: 'Menu dasbor' }).filter({ visible: true });
  await expect(nav.getByRole('link', { name: 'Reservasi' })).toBeVisible();
  for (const hidden of ['Jadwal Pertunjukan', 'Ulasan', 'Rekap', 'Pengguna']) {
    await expect(nav.getByRole('link', { name: hidden, exact: true })).toHaveCount(0);
  }
});

test('an account without a factor enrols one from the QR code and lands on the dashboard', async ({
  page,
}, testInfo) => {
  test.skip(!isDesktop(testInfo.project.name), 'one run of the flow is enough');
  const account = await createAccount('admin_rw');
  createdAccounts.push(account.id);

  await page.goto('/login');
  await submitPassword(page, account.email);
  await expect(page).toHaveURL('/mfa/enroll', AUTH_STEP);
  await page.getByRole('button', { name: 'Tampilkan kode QR' }).click();
  await expect(
    page.getByRole('img', { name: 'Kode QR untuk aplikasi autentikator' }),
  ).toBeVisible();

  const secret = (await page.locator('code').innerText()).replace(/\s/g, '');
  await page.getByLabel('Kode autentikator').fill(totpCode(secret));
  await page.getByRole('button', { name: 'Aktifkan' }).click();
  await expect(page).toHaveURL('/dashboard', AUTH_STEP);
  await expect(page.getByText('Anda masuk sebagai Admin RW 05.')).toBeVisible();
});

test('a signed-in account without a staff role is told it has no access', async ({
  page,
}, testInfo) => {
  test.skip(!isDesktop(testInfo.project.name), 'one run of the flow is enough');
  const account = await createAccount('none');
  createdAccounts.push(account.id);

  await page.goto('/login');
  await submitPassword(page, account.email);
  await expect(page.getByRole('heading', { name: 'Akun ini belum punya akses' })).toBeVisible(
    AUTH_STEP,
  );
  await expect(page.getByRole('button', { name: 'Tampilkan kode QR' })).toHaveCount(0);
});
