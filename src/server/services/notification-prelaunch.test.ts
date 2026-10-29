import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isPrelaunch } from '@/config/launch';
import { svcClaimNotifications } from '@/db/rpc-outbox';
import type { DatabaseClient } from '@/db/rpc-result';
import type { NotificationProviders } from '@/lib/notifications/types';

import { processNotifications } from './notification-service';

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock('@/db/rpc-outbox', () => ({
  svcClaimNotifications: vi.fn(() => Promise.resolve([])),
  svcCompleteNotification: vi.fn(),
  svcFailNotification: vi.fn(),
}));
vi.mock('@/config/launch', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isPrelaunch: vi.fn(() => false),
}));

const asked: string[] = [];

// The one read a pre-launch worker makes first: whatsapp_enabled, through the service-role client it is handed.
function clientWithSwitch(row: { value: unknown } | null): DatabaseClient {
  const query = {
    select: () => query,
    eq: (_column: string, key: string) => {
      asked.push(key);
      return query;
    },
    maybeSingle: () => Promise.resolve({ data: row, error: null }),
  };
  return { from: () => query } as unknown as DatabaseClient;
}

const send = vi.fn();
const PROVIDERS: NotificationProviders = { whatsapp: { send }, email: { send } };

beforeEach(() => {
  vi.clearAllMocks();
  asked.length = 0;
  vi.mocked(isPrelaunch).mockReturnValue(true);
});

// docs/Security.md §8.9: no WhatsApp credentials before launch, so no WhatsApp message may reach a provider, fail for
// want of them, and dead-letter into an alert.
describe('processNotifications in a pre-launch build', () => {
  it('works the outbox once whatsapp_enabled is off, where the claim cancels the WhatsApp messages', async () => {
    await expect(
      processNotifications(clientWithSwitch({ value: false }), PROVIDERS),
    ).resolves.toEqual({ processed: 0, failed: 0 });
    expect(asked).toEqual(['whatsapp_enabled']);
    expect(svcClaimNotifications).toHaveBeenCalledTimes(1);
  });

  it('claims nothing at all while whatsapp_enabled is still on, or its row is missing', async () => {
    for (const row of [{ value: true }, null]) {
      await expect(processNotifications(clientWithSwitch(row), PROVIDERS)).resolves.toEqual({
        processed: 0,
        failed: 0,
      });
    }
    expect(svcClaimNotifications).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('reads no switch on a launched build', async () => {
    vi.mocked(isPrelaunch).mockReturnValue(false);
    await processNotifications(clientWithSwitch({ value: true }), PROVIDERS);
    expect(asked).toEqual([]);
    expect(svcClaimNotifications).toHaveBeenCalledTimes(1);
  });
});
