import { afterEach, describe, expect, it, vi } from 'vitest';

import { notificationProviders, securityAlertProvider } from '@/lib/notifications/providers';
import type { OutgoingMessage } from '@/lib/notifications/types';

const OTP_MESSAGE: OutgoingMessage = {
  notificationId: 'n-1',
  channel: 'whatsapp',
  template: 'phone_otp',
  recipient: '+6281234567890',
  bodyParams: { code: '482913' },
  link: null,
};
const MAILPIT = 'http://127.0.0.1:54324/api/v1/send';
const RESEND = 'https://api.resend.com/emails';

function capturedFetch() {
  const urls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    urls.push(input instanceof Request ? input.url : input.toString());
    return Promise.resolve(
      Response.json({ messages: [{ id: 'wamid.1' }], id: 'email-1', ID: 'mp-1' }),
    );
  });
  return urls;
}

describe('notificationProviders', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reaches Meta and Resend on a live deployment, never the local Mailpit', async () => {
    const urls = capturedFetch();
    const providers = notificationProviders('live');
    await providers?.whatsapp.send(OTP_MESSAGE);
    await providers?.email.send({
      ...OTP_MESSAGE,
      channel: 'email',
      recipient: 'ani@example.test',
    });
    expect(urls.some((url) => url.includes('127.0.0.1'))).toBe(false);
    expect(urls).toEqual([RESEND]);
  });

  it('refuses WhatsApp outright when the Meta credentials are missing, as on staging without a number', async () => {
    capturedFetch();
    await expect(notificationProviders('live')?.whatsapp.send(OTP_MESSAGE)).resolves.toMatchObject({
      ok: false,
      errorCode: 'whatsapp_not_configured',
      isPermanent: true,
    });
  });

  it('delivers both channels to the local Mailpit for a stack on this machine', async () => {
    const urls = capturedFetch();
    const providers = notificationProviders('mailpit');
    await providers?.whatsapp.send(OTP_MESSAGE);
    await providers?.email.send({
      ...OTP_MESSAGE,
      channel: 'email',
      recipient: 'ani@example.test',
    });
    expect(urls).toEqual([MAILPIT, MAILPIT]);
  });

  it('has no provider at all where nothing may be delivered', () => {
    expect(notificationProviders('none')).toBeNull();
  });

  // Independent review of PR #50, M1: this test run, like CI's e2e server, is no Vercel deployment.
  it('chooses by the deployment it runs in when asked nothing, and this test run reaches no real provider', async () => {
    const urls = capturedFetch();
    await notificationProviders()?.email.send({ ...OTP_MESSAGE, channel: 'email' });
    expect(urls).toEqual([MAILPIT]);
  });
});

describe('securityAlertProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emails alerts through Resend on a live deployment, the local Mailpit for a local stack, nowhere else', async () => {
    const urls = capturedFetch();
    const alert = {
      ...OTP_MESSAGE,
      channel: 'email' as const,
      template: 'security_alert' as const,
    };
    await securityAlertProvider('live')?.send(alert);
    await securityAlertProvider('mailpit')?.send(alert);
    await securityAlertProvider()?.send(alert);
    expect(urls).toEqual([RESEND, MAILPIT, MAILPIT]);
    expect(securityAlertProvider('none')).toBeNull();
  });
});
