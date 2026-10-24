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

  it('sends nothing to the local Mailpit outside a local development server', async () => {
    const urls = capturedFetch();
    const providers = notificationProviders(false);
    await providers.whatsapp.send(OTP_MESSAGE);
    await providers.email.send({ ...OTP_MESSAGE, channel: 'email', recipient: 'ani@example.test' });
    expect(urls.some((url) => url.includes('127.0.0.1'))).toBe(false);
    expect(urls).toEqual(['https://api.resend.com/emails']);
  });

  it('refuses WhatsApp outright when the Meta credentials are missing, as on staging without a number', async () => {
    capturedFetch();
    await expect(notificationProviders(false).whatsapp.send(OTP_MESSAGE)).resolves.toMatchObject({
      ok: false,
      errorCode: 'whatsapp_not_configured',
      isPermanent: true,
    });
  });

  it('delivers both channels to the local Mailpit on a developer machine', async () => {
    const urls = capturedFetch();
    const providers = notificationProviders(true);
    await providers.whatsapp.send(OTP_MESSAGE);
    await providers.email.send({ ...OTP_MESSAGE, channel: 'email', recipient: 'ani@example.test' });
    expect(urls).toEqual([
      'http://127.0.0.1:54324/api/v1/send',
      'http://127.0.0.1:54324/api/v1/send',
    ]);
  });

  it('chooses by the deployment it runs in when asked nothing, and this test run is no laptop', async () => {
    const urls = capturedFetch();
    await notificationProviders().email.send({ ...OTP_MESSAGE, channel: 'email' });
    expect(urls).toEqual(['https://api.resend.com/emails']);
  });
});

describe('securityAlertProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emails alerts through Resend directly, or the local Mailpit on a developer machine', async () => {
    const urls = capturedFetch();
    const alert = {
      ...OTP_MESSAGE,
      channel: 'email' as const,
      template: 'security_alert' as const,
    };
    await securityAlertProvider(false).send(alert);
    await securityAlertProvider(true).send(alert);
    await securityAlertProvider().send(alert);
    expect(urls).toEqual([
      'https://api.resend.com/emails',
      'http://127.0.0.1:54324/api/v1/send',
      'https://api.resend.com/emails',
    ]);
  });
});
