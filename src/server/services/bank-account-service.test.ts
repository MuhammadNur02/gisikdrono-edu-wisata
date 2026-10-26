import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/db/types';
import { bankAccountsCopy } from '@/lib/copy/bank-accounts';
import { staffCopy } from '@/lib/copy/staff';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  getMaskedBankAccount,
  listRwTreasuryAccounts,
  revealBankAccountNumber,
  setBankAccount,
} from '@/server/services/bank-account-service';
import { listRwUnitsForStaff } from '@/server/services/rw-unit-service';
import type { RwUnitSummary } from '@/types/rw-unit';

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('@/server/services/rw-unit-service', () => ({ listRwUnitsForStaff: vi.fn() }));
const logged = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: logged.error, info: vi.fn(), warn: vi.fn() }),
}));

const VENDOR_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000dd';
const MASKED = {
  bank_name: 'BRI',
  account_holder: 'Ibu Sari',
  account_masked: '••••7890',
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
      accountMasked: '••••7890',
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

const unit = (id: 5 | 8, name: string): RwUnitSummary => ({
  id,
  label: `RW 0${String(id)}`,
  accentKey: 'leaf',
  name,
  shortName: name,
  slug: `rw-0${String(id)}`,
  path: `/rw-0${String(id)}`,
  iconKey: 'recycle',
  scheduleEnabled: false,
});

// Review of PR #85, L-d: one RW's failed read is null on the page and logged by the RW's number and the error's kind.
describe('listRwTreasuryAccounts', () => {
  it('shows the other RWs when one read fails, and logs that one by ids only', async () => {
    vi.mocked(listRwUnitsForStaff).mockResolvedValue([
      unit(5, 'RW 05 Ecowastreme'),
      unit(8, 'RW 08'),
    ]);
    const client = createClient<Database>('http://supabase.test', 'test-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (_input, init) => {
          const body = typeof init?.body === 'string' ? init.body : '';
          return Promise.resolve(
            body.includes('"p_rw_id":8')
              ? Response.json({ code: '57014', message: 'canceling statement' }, { status: 500 })
              : Response.json(MASKED),
          );
        },
      },
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client);

    const accounts = await listRwTreasuryAccounts();
    expect(accounts.map((row) => [row.rwId, row.account?.accountMasked ?? null])).toEqual([
      [5, '••••7890'],
      [8, null],
    ]);
    expect(logged.error).toHaveBeenCalledTimes(1);
    expect(logged.error).toHaveBeenCalledWith('internal_error', {
      step: 'treasury_read',
      rwId: 8,
      errorName: 'object',
      postgresCode: '57014',
    });
  });
});
