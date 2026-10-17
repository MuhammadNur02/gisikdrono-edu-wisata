import { describe, expect, it } from 'vitest';

import { findPublicEnvProblems } from './public-env';

const SAMPLE_NUMBER = '+6281200000000';
const OFFICIAL_LOOKING_NUMBER = '+6281234567890';

describe('findPublicEnvProblems', () => {
  it('refuses the sample WhatsApp number on production', () => {
    expect(
      findPublicEnvProblems({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER: SAMPLE_NUMBER,
      }),
    ).toEqual([
      'NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER looks like a sample number; production needs the kelurahan number',
    ]);
  });

  it('accepts a real-looking number on production', () => {
    expect(
      findPublicEnvProblems({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER: OFFICIAL_LOOKING_NUMBER,
      }),
    ).toEqual([]);
  });

  it('lets local, CI and preview builds use the sample', () => {
    for (const VERCEL_ENV of [undefined, 'development', 'preview'] as const) {
      expect(
        findPublicEnvProblems({ VERCEL_ENV, NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER: SAMPLE_NUMBER }),
      ).toEqual([]);
    }
  });
});
