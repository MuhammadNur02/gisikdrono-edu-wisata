import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { giveRwRole, removeProfiles } from './helpers/staff-session';
import { totpCode } from '../../scripts/dev-accounts';
import { localStack } from '../../scripts/local-stack';

// The API and Auth settings of supabase/config.toml as the running stack applies them (Task P1.7.01, P1.7.05);
// scripts/supabase-config.test.mjs checks the file itself.

function visitorClient() {
  const { apiUrl, anonKey } = localStack();
  return createClient(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const FACTOR_TEST_MS = 30_000;

describe('API and Auth settings on the local stack', () => {
  it('refuses a public sign-up: staff accounts come from an invite only', async () => {
    const { data, error } = await visitorClient().auth.signUp({
      email: `daftar-${randomUUID()}@example.test`,
      password: 'Signup-attempt-123!',
    });

    expect(error?.message).toMatch(/signups not allowed/i);
    expect(data.user).toBeNull();
  });

  // I5 of the independent review of PR #17 (AUTH-12): GoTrue itself refuses a second factor, so enrolling one
  // straight through the API, past the app's check, gets nowhere either.
  it(
    'refuses a second MFA factor for an account that already has one',
    async () => {
      const { apiUrl, serviceRoleKey } = localStack();
      const admin = createClient(apiUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const email = `faktor-${randomUUID()}@example.test`;
      const password = 'Factor-limit-test-123!';
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error) throw created.error;
      try {
        await giveRwRole(created.data.user.id, email);
        const staff = visitorClient();
        await staff.auth.signInWithPassword({ email, password });
        const first = await staff.auth.mfa.enroll({ factorType: 'totp' });
        if (first.error) throw first.error;
        await staff.auth.mfa.challengeAndVerify({
          factorId: first.data.id,
          code: totpCode(first.data.totp.secret),
        });

        const second = await staff.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'kedua' });

        expect(second.error?.code).toBe('too_many_enrolled_mfa_factors');
      } finally {
        await removeProfiles([created.data.user.id]);
        await admin.auth.admin.deleteUser(created.data.user.id);
      }
    },
    FACTOR_TEST_MS,
  );

  it('exposes no GraphQL endpoint, only the public schema through PostgREST', async () => {
    const { apiUrl, anonKey } = localStack();
    const response = await fetch(`${apiUrl}/graphql/v1`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
    });

    expect(response.ok).toBe(false);
  });
});
