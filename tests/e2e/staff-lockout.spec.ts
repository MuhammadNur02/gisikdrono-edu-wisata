import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { recordSignInAnswers } from './helpers/sign-in-answers';
import {
  AUTH_STEP,
  createAccount,
  removeAccounts,
  resetAuthLimits,
  submitPassword,
} from './helpers/staff';
import { copy } from '../../src/lib/copy/id';

// Task P4.8.04 (docs/Security.md §5.1, §8.3; AUTH-06, RL-02): five wrong passwords for one address get the generic
// answer, the sixth the locked one (login:ip+email, 5 in 15 minutes), and an address with no account reads the same at
// every step. Each address signs in from an IP of its own, so these twelve tries never use up the shared login:ip
// limit of the other specs' sign-ins.
//
// This file is the project `auth-lockout` of playwright.config.ts, which runs once every other file is done: the
// other files reset every login:% counter in their beforeAll (resetAuthLimits), and the counters are keyed by peppered
// hashes the tests cannot single out, so a reset that landed in the middle of these tries wiped their count and the
// sixth read as an ordinary failure (#72, #69). Alone at the end, nothing resets them under it.

// Two addresses, six sign-ins each (I78-2 of the review of PR #78: the bound the test had in staff-sign-in.spec.ts).
const LOCKOUT_TEST_MS = 180_000;
test.describe.configure({ timeout: LOCKOUT_TEST_MS });

// login:ip+email allows five tries in fifteen minutes; the sixth is refused before Supabase Auth is asked.
const SIGN_IN_TRIES = 6;
const createdAccounts: string[] = [];

test.beforeAll(async () => {
  await resetAuthLimits();
});

test.afterAll(async () => {
  await removeAccounts(createdAccounts);
});

async function sixWrongPasswords(page: Page, email: string, clientIp: string): Promise<string[]> {
  await page.unroute('**/login*');
  const answers = await recordSignInAnswers(page, clientIp);
  await page.goto('/login');
  for (let attempt = 1; attempt <= SIGN_IN_TRIES; attempt += 1) {
    await submitPassword(page, email, 'Wrong-Password-123!');
    await expect.poll(() => answers.length, AUTH_STEP).toBe(attempt);
  }
  return answers;
}

test('the sixth failed sign-in for an address gets the locked message, and an unknown address reads the same', async ({
  page,
}) => {
  const account = await createAccount('admin_rw');
  createdAccounts.push(account.id);
  const failed = copy.auth.signIn.failed;
  const locked = copy.errors.RATE_LIMITED;

  const known = await sixWrongPasswords(page, account.email, '198.51.100.1');
  for (const answer of known.slice(0, SIGN_IN_TRIES - 1)) expect(answer).toContain(failed);
  expect(known[SIGN_IN_TRIES - 1]).toContain(locked);
  expect(known[SIGN_IN_TRIES - 1]).not.toContain(failed);
  await expect(page.getByText(locked)).toBeVisible(AUTH_STEP);

  const unknown = await sixWrongPasswords(
    page,
    `nobody-${randomUUID()}@example.test`,
    '198.51.101.1',
  );
  for (const answer of unknown.slice(0, SIGN_IN_TRIES - 1)) expect(answer).toContain(failed);
  expect(unknown[SIGN_IN_TRIES - 1]).toContain(locked);
  await expect(page).toHaveURL(/\/login/, AUTH_STEP);
});
