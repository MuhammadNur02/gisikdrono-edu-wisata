import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ensureOtpBrowserId,
  readOtpBrowserCookie,
  readPhoneProofCookie,
  rememberPhoneProof,
} from '@/server/auth/guest-cookies';

const jar = vi.hoisted(() => new Map<string, { value: string; options: unknown }>());

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      set: (name: string, value: string, options: unknown) =>
        void jar.set(name, { value, options }),
      get: (name: string) => jar.get(name),
    }),
}));

const PROOF = {
  channel: 'whatsapp' as const,
  phone: '+6281234567890',
  email: null,
  otpId: '0192f3a4-5b6c-7d8e-9f01-0000000000aa',
};

beforeEach(() => {
  jar.clear();
});

describe('the gsk_phone cookie', () => {
  it('is httpOnly, Secure and SameSite=Lax for 30 minutes, and reads back what was proven', async () => {
    await rememberPhoneProof(PROOF);
    expect(jar.get('gsk_phone')?.options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 1800,
    });
    await expect(readPhoneProofCookie()).resolves.toMatchObject(PROOF);
  });

  it('reads nothing from no cookie or a forged one', async () => {
    await expect(readPhoneProofCookie()).resolves.toBeNull();
    jar.set('gsk_phone', { value: 'forged.value', options: {} });
    await expect(readPhoneProofCookie()).resolves.toBeNull();
  });
});

// Review of PR #20, M1: a pending code belongs to the browser that asked for it.
describe('the gsk_otp_browser cookie', () => {
  it('gives a browser without one a signed id for a day, httpOnly, Secure and Lax', async () => {
    const browserId = await ensureOtpBrowserId();
    expect(browserId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(jar.get('gsk_otp_browser')?.options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 86_400,
    });
    await expect(readOtpBrowserCookie()).resolves.toBe(browserId);
  });

  it('keeps the id a browser already holds, so its pending code stays its own', async () => {
    const browserId = await ensureOtpBrowserId();
    await expect(ensureOtpBrowserId()).resolves.toBe(browserId);
  });

  it('replaces a forged value with a new id, and reads no id from no cookie or a forged one', async () => {
    await expect(readOtpBrowserCookie()).resolves.toBeNull();
    jar.set('gsk_otp_browser', { value: 'forged.value', options: {} });
    await expect(readOtpBrowserCookie()).resolves.toBeNull();
    const browserId = await ensureOtpBrowserId();
    expect(jar.get('gsk_otp_browser')?.value).not.toBe('forged.value');
    await expect(readOtpBrowserCookie()).resolves.toBe(browserId);
  });
});
