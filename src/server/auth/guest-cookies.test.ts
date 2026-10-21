import { describe, expect, it, vi } from 'vitest';

import { readPhoneProofCookie, rememberPhoneProof } from '@/server/auth/guest-cookies';

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
    jar.clear();
    await expect(readPhoneProofCookie()).resolves.toBeNull();
    jar.set('gsk_phone', { value: 'forged.value', options: {} });
    await expect(readPhoneProofCookie()).resolves.toBeNull();
  });
});
