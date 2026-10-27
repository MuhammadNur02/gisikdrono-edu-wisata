import { describe, expect, it } from 'vitest';

import { CERTIFICATE_PROOF_TTL_SECONDS } from '@/config/guest';
import { isCertificateProof, signCertificateProof } from '@/lib/links/certificate-proof';
import { sign } from '@/lib/links/hmac';

const NOW = 1_790_000_000;
const CODE = 'GSK-7F3K9Q2M';
const OTHER_CODE = 'GSK-7F3K9Q2N';
const BINDING = { bookingCode: CODE, tokenVersion: 2 };
const AT_NOW = { ...BINDING, nowSeconds: NOW };

describe('signCertificateProof and isCertificateProof', () => {
  it('holds for half an hour, for its own booking', async () => {
    const { value, maxAge } = await signCertificateProof(BINDING, NOW);
    expect(maxAge).toBe(CERTIFICATE_PROOF_TTL_SECONDS);
    await expect(isCertificateProof(value, AT_NOW)).resolves.toBe(true);
    await expect(
      isCertificateProof(value, { ...AT_NOW, nowSeconds: NOW + maxAge - 1 }),
    ).resolves.toBe(true);
    await expect(isCertificateProof(value, { ...AT_NOW, nowSeconds: NOW + maxAge })).resolves.toBe(
      false,
    );
  });

  it("never opens another booking's certificates", async () => {
    const { value } = await signCertificateProof(BINDING, NOW);
    await expect(isCertificateProof(value, { ...AT_NOW, bookingCode: OTHER_CODE })).resolves.toBe(
      false,
    );
  });

  it('ends once the links are revoked', async () => {
    const { value } = await signCertificateProof(BINDING, NOW);
    await expect(isCertificateProof(value, { ...AT_NOW, tokenVersion: 3 })).resolves.toBe(false);
  });

  it('refuses a proof whose booking, version or expiry was changed, or signed as another kind of token', async () => {
    const { value } = await signCertificateProof(BINDING, NOW);
    const [, version = '', exp = '', signature = ''] = value.split('.');
    await expect(
      isCertificateProof(`${OTHER_CODE}.${version}.${exp}.${signature}`, {
        ...AT_NOW,
        bookingCode: OTHER_CODE,
      }),
    ).resolves.toBe(false);
    await expect(
      isCertificateProof(`${CODE}.3.${exp}.${signature}`, { ...AT_NOW, tokenVersion: 3 }),
    ).resolves.toBe(false);
    await expect(
      isCertificateProof(`${CODE}.${version}.${String(Number(exp) + 1)}.${signature}`, AT_NOW),
    ).resolves.toBe(false);
    const message = `${CODE}.${version}.${exp}`;
    await expect(
      isCertificateProof(`${message}.${await sign('gsk-phone-proof-v1', message)}`, AT_NOW),
    ).resolves.toBe(false);
  });

  it.each([
    '',
    'garbage',
    `${CODE}.2.123`,
    `${CODE}.123.${'a'.repeat(43)}`,
    `${CODE}.2.abc.${'a'.repeat(43)}`,
    `${CODE}.x.123.${'a'.repeat(43)}`,
    `GSK-ILOU0000.2.1.${'a'.repeat(43)}`,
  ])('refuses %s', async (value) => {
    await expect(isCertificateProof(value, AT_NOW)).resolves.toBe(false);
  });
});
