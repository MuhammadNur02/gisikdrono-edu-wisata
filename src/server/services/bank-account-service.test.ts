import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/db/types';
import { bankAccountsCopy } from '@/lib/copy/bank-accounts';
import { staffCopy } from '@/lib/copy/staff';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  getMaskedBankAccount,
  revealBankAccountNumber,
  setBankAccount,
} from '@/server/services/bank-account-service';

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('@/server/services/rw-unit-service', () => ({ listRwUnitsForStaff: vi.fn() }));

const VENDOR_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000dd';
const MASKED = {
  bank_name: 'BRI',
  account_holder: 'Ibu Sari',
  account_masked: '••••••7890',
  account_number: null,
};

interface RecordedCall {
  path: string;
  body: unknown;
}

// The superadmin's session client, played by a fetch that records each RPC and answers with `answer`.
function sessionAnswering(answer: () => Response): RecordedCall[] {
  const calls: RecordedCall[] = [];
  const client = createClient<Database>('http://supabase.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
        calls.push({ path: url.pathname, body });
        return Promise.resolve(answer());
      },
    },
  });
  vi.mocked(createSupabaseServerClient).mockResolvedValue(client);
  return calls;
}

const refusal = (code: string, hint: string | null) =>
  Response.json({ code, message: 'x', hint }, { status: code === '42501' ? 403 : 400 });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the bank account service', () => {
  it('reads a vendor account masked, without spending a reveal', async () => {
    const calls = sessionAnswering(() => Response.json(MASKED));
    await expect(getMaskedBankAccount({ kind: 'vendor', vendorId: VENDOR_ID })).resolves.toEqual({
      bankName: 'BRI',
      accountHolder: 'Ibu Sari',
      accountMasked: '••••••7890',
    });
    expect(calls).toEqual([
      {
        path: '/rest/v1/rpc/get_vendor_bank_account',
        body: { p_vendor_id: VENDOR_ID, p_reveal: false },
      },
    ]);
  });

  it('reveals an RW treasury number with the reason', async () => {
    const calls = sessionAnswering(() =>
      Response.json({ ...MASKED, account_number: '1234567890' }),
    );
    const values = { target: { kind: 'rw' as const, rwId: 5 }, reason: 'Cek transfer' };
    await expect(revealBankAccountNumber(values)).resolves.toBe('1234567890');
    expect(calls[0]).toEqual({
      path: '/rest/v1/rpc/get_rw_treasury_account',
      body: { p_rw_id: 5, p_reveal: true, p_reason: 'Cek transfer' },
    });
  });

  it('sets an account through its RPC', async () => {
    const calls = sessionAnswering(() => new Response(null, { status: 204 }));
    await setBankAccount({
      target: { kind: 'rw', rwId: 8 },
      bankName: 'BNI',
      accountNumber: '0011223344',
      accountHolder: 'Kas RW 08',
    });
    expect(calls[0]).toEqual({
      path: '/rest/v1/rpc/set_rw_treasury_account',
      body: {
        p_rw_id: 8,
        p_bank_name: 'BNI',
        p_account_number: '0011223344',
        p_account_holder: 'Kas RW 08',
      },
    });
  });

  it('says why a step is refused', async () => {
    const target = { kind: 'vendor' as const, vendorId: VENDOR_ID };
    sessionAnswering(() => refusal('42501', 'FRESH_TOTP'));
    await expect(revealBankAccountNumber({ target, reason: 'Cek' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      userMessage: staffCopy.notFresh,
    });
    sessionAnswering(() => refusal('P0001', 'RATE_LIMITED'));
    await expect(revealBankAccountNumber({ target, reason: 'Cek' })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      userMessage: bankAccountsCopy.rateLimited,
    });
    sessionAnswering(() => refusal('P0002', null));
    await expect(getMaskedBankAccount(target)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
