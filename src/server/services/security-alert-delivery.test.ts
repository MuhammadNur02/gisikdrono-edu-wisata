import { beforeEach, describe, expect, it, vi } from 'vitest';

import { svcClaimSecurityAlerts, svcReleaseSecurityAlert } from '@/db/rpc-outbox';
import type { DatabaseClient } from '@/db/rpc-result';
import type { NotificationProvider, OutgoingMessage } from '@/lib/notifications/types';

import { deliverSecurityAlerts } from './security-alert-delivery';

vi.mock('@/db/rpc-outbox', () => ({
  svcClaimSecurityAlerts: vi.fn(),
  svcReleaseSecurityAlert: vi.fn(),
}));

const RECIPIENT = 'keamanan@example.test';
const ALERTS = [
  {
    id: 'a-1',
    rule: 'payment_review',
    severity: 'high' as const,
    lastSeenAt: '2026-10-24T03:00:00+00:00',
  },
  {
    id: 'a-2',
    rule: 'tickets_without_payment',
    severity: 'critical' as const,
    lastSeenAt: '2026-10-24T03:05:00+00:00',
  },
];

// The delivery reads nothing itself; the claim and the release are mocked.
const adminClient = {} as DatabaseClient;

function emailAnswering(isAccepted: (message: OutgoingMessage) => boolean) {
  const sent: OutgoingMessage[] = [];
  const provider: NotificationProvider = {
    send: (message) => {
      sent.push(message);
      return Promise.resolve(
        isAccepted(message)
          ? { ok: true, providerMessageId: 'email-1' }
          : { ok: false, errorCode: 'network', error: 'down', isPermanent: false },
      );
    },
  };
  return { provider, sent };
}

beforeEach(() => {
  vi.mocked(svcClaimSecurityAlerts).mockReset().mockResolvedValue(ALERTS);
  vi.mocked(svcReleaseSecurityAlert).mockReset().mockResolvedValue(undefined);
});

describe('deliverSecurityAlerts', () => {
  it('emails each claimed alert with its rule, severity and time only, and its dashboard link', async () => {
    const { provider, sent } = emailAnswering(() => true);
    await expect(deliverSecurityAlerts(adminClient, provider, RECIPIENT)).resolves.toBe(2);
    expect(sent[0]).toMatchObject({
      template: 'security_alert',
      recipient: RECIPIENT,
      bodyParams: { severity: 'high', rule: 'payment_review', time: '24 Okt 2026, 10.00 WIB' },
      link: { url: 'http://127.0.0.1:3000/dashboard/security-alerts', buttonSuffix: null },
    });
    expect(svcReleaseSecurityAlert).not.toHaveBeenCalled();
  });

  it('gives an alert whose email failed back to the next run', async () => {
    const { provider } = emailAnswering((message) => message.notificationId === 'a-1');
    await expect(deliverSecurityAlerts(adminClient, provider, RECIPIENT)).resolves.toBe(1);
    expect(svcReleaseSecurityAlert).toHaveBeenCalledWith(expect.anything(), 'a-2');
  });
});
