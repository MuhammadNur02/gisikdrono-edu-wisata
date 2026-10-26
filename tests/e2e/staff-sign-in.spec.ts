import { expect, test, type Locator, type Page, type Response } from '@playwright/test';

import { recordSignInAnswers } from './helpers/sign-in-answers';
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
import { RW_SCOPE_COOKIE } from '../../src/config/dashboard';
import { copy } from '../../src/lib/copy/id';

// Task P2.8 (docs/Security.md §5, AUTH-03, AUTH-06, APP-05): staff reach the dashboard only with a password and a
// TOTP code, and the shell shows each role its own part. The flows run on the desktop project; the phone project
// checks the pages at 360 px.

// Each flow takes two or three sign-in steps (AUTH_STEP each), more than the default 30 s per test.
test.describe.configure({ timeout: 120_000 });

const createdAccounts: string[] = [];

// Only the desktop project resets the counters: every flow here runs there alone. The lockout test lives in
// staff-lockout.spec.ts, which runs after every other file, so no reset can land in the middle of it.
test.beforeAll(async ({}, testInfo) => {
  if (isDesktop(testInfo.project.name)) await resetAuthLimits();
});

test.afterAll(async () => {
  await removeAccounts(createdAccounts);
});

const isDesktop = (projectName: string) => projectName === 'desktop';
// The RW switch renders the whole dashboard again, figures and all, which a loaded CI runner takes longer for.
const SWITCH_STEP = { timeout: 90_000 };
// F-74-3: each wait has its own bound, and together they stay inside the test's own timeout (SWITCH_TEST_MS).
const SETTLE_STEP = { timeout: 20_000 };
// How long after a click the button must show that the switch took it (D4 of the delta review of PR #72).
const CLICK_TAKEN_WAIT = { timeout: 10_000 };
const SWITCH_TEST_MS = 240_000;
const SWITCH_CLICKS = 2;
const HTTP_OK = 200;

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

// The switch's own answer is the Server Action response that sets the rw_scope cookie, so another action on the page
// (F-74-2 of the review of PR #74) never stands in for it.
function isRwScopeAnswer(response: Response): Promise<boolean> | boolean {
  if (response.request().method() !== 'POST') return false;
  if (response.request().headers()['next-action'] === undefined) return false;
  return response
    .headerValue('set-cookie')
    .then((cookie) => cookie?.includes(`${RW_SCOPE_COOKIE}=`) ?? false);
}

// The switch took the click when its button is disabled for the transition (rw-switcher.tsx) or, after a quick answer,
// pressed: the button's own state, never some other action's POST.
async function isClickTaken(button: Locator): Promise<boolean> {
  const taken = async () =>
    (await button.isDisabled()) || (await button.getAttribute('aria-pressed')) === 'true';
  return expect
    .poll(taken, CLICK_TAKEN_WAIT)
    .toBe(true)
    .then(
      () => true,
      () => false,
    );
}

// A click that lands before the button hydrated does nothing (F-74-1), so a click the button does not take within
// CLICK_TAKEN_WAIT is made once more, at most SWITCH_CLICKS in all. A click that was taken is only waited for.
async function switchRw(
  page: Page,
  button: Locator,
): Promise<{ answer: Response; clicks: number }> {
  const answer = page.waitForResponse(isRwScopeAnswer, SWITCH_STEP);
  // Awaited below; this only keeps a timeout during the clicks from reading as an unhandled rejection.
  answer.catch(() => undefined);
  let clicks = 0;
  while (clicks < SWITCH_CLICKS) {
    await button.click(SETTLE_STEP);
    clicks += 1;
    if (await isClickTaken(button)) break;
  }
  return { answer: await answer, clicks };
}

test('the superadmin sees every group and the RwSwitcher, and signing out ends the session', async ({
  page,
}, testInfo) => {
  test.skip(!isDesktop(testInfo.project.name), 'one run of the flow is enough');
  test.setTimeout(SWITCH_TEST_MS);
  await signInToDashboard(page, SUPERADMIN);
  const sidebar = page.getByRole('navigation', { name: 'Menu dasbor' });

  for (const item of ['Reservasi', 'Ulasan', 'Rekonsiliasi', 'Pengguna', 'Peringatan Keamanan']) {
    await expect(sidebar.getByRole('link', { name: item })).toBeVisible();
  }
  const rw05 = page.getByRole('group', { name: 'Tampilkan data' }).getByRole('button', {
    name: 'RW 05',
  });
  // The switch's Server Action answers with the dashboard rendered again for RW 05. Its overview is a Suspense
  // boundary keyed by the scope (dashboard/page.tsx), so the button is pressed as soon as the shell has arrived and the
  // figures stream in after it; before that key, the transition waited for every figure, which under CI load outlasted
  // the wait (PR #68). The test still starts from a settled, hydrated page, clicks, and waits for the action's own
  // answer before the state, and then for the RW 05 figures.
  await expect(page.getByRole('region', { name: copy.dashboard.overview.kpiLabel })).toBeVisible(
    AUTH_STEP,
  );
  await page.waitForLoadState('networkidle', SETTLE_STEP);
  const clickedAt = Date.now();
  const { answer, clicks } = await switchRw(page, rw05);
  testInfo.annotations.push({
    type: 'rw-switch',
    description: `HTTP ${String(answer.status())} after ${String(Date.now() - clickedAt)} ms, ${String(clicks)} click(s)`,
  });
  expect(answer.status()).toBe(HTTP_OK);
  await expect(rw05).toHaveAttribute('aria-pressed', 'true', AUTH_STEP);
  await expect(page.getByRole('region', { name: copy.dashboard.overview.kpiLabel })).toBeVisible(
    SWITCH_STEP,
  );

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
