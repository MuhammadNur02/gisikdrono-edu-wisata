import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  accessTokenOf,
  claimsOf,
  lastAuditId,
  removeSignInTraces,
  signInDevAccount,
  signInWithPassword,
} from './helpers/staff-session';
import { DEV_ACCOUNTS, DEV_ONLY_PASSWORD } from '../../scripts/dev-accounts';

// The development staff accounts of pnpm db:seed sign in through GoTrue with their DEV-ONLY password, pass the TOTP
// step and reach AAL2 with the role and RW of their profile, as a developer does (Task P1.8.02).

const SLOW_TEST_MS = 30_000;

describe('development staff accounts of pnpm db:seed', () => {
  let auditIdBefore = 0;

  beforeAll(async () => {
    auditIdBefore = await lastAuditId();
  });

  afterAll(async () => {
    await removeSignInTraces(auditIdBefore);
  }, SLOW_TEST_MS);

  it.each(DEV_ACCOUNTS)(
    '$email signs in, passes TOTP and reaches AAL2 as $role',
    async (account) => {
      const passwordOnly = await signInWithPassword(account.email, DEV_ONLY_PASSWORD);
      expect(claimsOf(await accessTokenOf(passwordOnly)).aal).toBe('aal1');

      const staff = await signInDevAccount(account.email);
      expect(claimsOf(await accessTokenOf(staff))).toEqual(
        expect.objectContaining({
          aal: 'aal2',
          app_role: account.role,
          app_rw_id: account.rwId,
          claims_version: 1,
        }),
      );
    },
    SLOW_TEST_MS,
  );
});
