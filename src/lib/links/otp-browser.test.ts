import { describe, expect, it } from 'vitest';

import { sign } from '@/lib/links/hmac';
import { newOtpBrowserId, readOtpBrowserId, signOtpBrowserId } from '@/lib/links/otp-browser';

describe('the gsk_otp_browser cookie value', () => {
  it('names a browser by 128 random bits, never the same twice', () => {
    const ids = Array.from({ length: 200 }, newOtpBrowserId);
    expect(ids.every((id) => /^[A-Za-z0-9_-]{22}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reads back the id it signed', async () => {
    const id = newOtpBrowserId();
    await expect(readOtpBrowserId(await signOtpBrowserId(id))).resolves.toBe(id);
  });

  it('refuses an id with another id put in its place, or signed as another kind of token', async () => {
    const value = await signOtpBrowserId(newOtpBrowserId());
    const [, signature = ''] = value.split('.');
    const other = newOtpBrowserId();
    await expect(readOtpBrowserId(`${other}.${signature}`)).resolves.toBeNull();
    const asPhoneProof = `${other}.${await sign('gsk-phone-proof-v1', other)}`;
    await expect(readOtpBrowserId(asPhoneProof)).resolves.toBeNull();
  });

  it.each([
    '',
    'garbage',
    `${'a'.repeat(22)}.${'b'.repeat(42)}`,
    `${'a'.repeat(23)}.${'b'.repeat(43)}`,
  ])('refuses %s', async (value) => {
    await expect(readOtpBrowserId(value)).resolves.toBeNull();
  });
});
