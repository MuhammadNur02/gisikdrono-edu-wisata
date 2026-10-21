import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from 'next/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isLocalDevelopment } from '@/lib/local-development';

import DevOtpPage from './page.dev';
import { pageExtensionsFor } from '../../../../../next.config';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/lib/local-development', () => ({ isLocalDevelopment: vi.fn() }));
vi.mock('@/server/actions/otp', () => ({
  requestPhoneOtpAction: vi.fn(),
  verifyPhoneOtpAction: vi.fn(),
}));

// The OTP playground must not exist outside a developer's machine (docs/Security.md §7.6: a code never reaches a page
// or a log on staging or production). Two locks, each tested here.
describe('/dev/otp', () => {
  beforeEach(() => {
    vi.mocked(isLocalDevelopment).mockReset();
  });

  it('is in no build: only `next dev` knows the page.dev.tsx extension', () => {
    expect(pageExtensionsFor(PHASE_PRODUCTION_BUILD)).not.toContain('dev.tsx');
    expect(pageExtensionsFor(PHASE_PRODUCTION_SERVER)).not.toContain('dev.tsx');
    expect(pageExtensionsFor(PHASE_DEVELOPMENT_SERVER)).toContain('dev.tsx');
  });

  it('answers 404 on a dev server that is not a local one, such as one on the staging database', () => {
    vi.mocked(isLocalDevelopment).mockReturnValue(false);
    expect(() => DevOtpPage()).toThrow('NEXT_NOT_FOUND');
  });

  it('shows the OTP field on a local development server, and never a code', () => {
    vi.mocked(isLocalDevelopment).mockReturnValue(true);
    const page = DevOtpPage();
    expect(JSON.stringify(page.props)).toContain('Mailpit');
    expect(JSON.stringify(page.props)).not.toMatch(/\b\d{6}\b/);
  });
});
