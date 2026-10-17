import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { localStack } from './helpers/local-stack';

// The API and Auth settings of supabase/config.toml as the running stack applies them (Task P1.7.01, P1.7.05);
// scripts/supabase-config.test.mjs checks the file itself.

function visitorClient() {
  const { apiUrl, anonKey } = localStack();
  return createClient(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

describe('API and Auth settings on the local stack', () => {
  it('refuses a public sign-up: staff accounts come from an invite only', async () => {
    const { data, error } = await visitorClient().auth.signUp({
      email: `daftar-${randomUUID()}@example.test`,
      password: 'Signup-attempt-123!',
    });

    expect(error?.message).toMatch(/signups not allowed/i);
    expect(data.user).toBeNull();
  });

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
