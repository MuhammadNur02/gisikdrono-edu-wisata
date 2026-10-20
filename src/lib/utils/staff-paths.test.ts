import { describe, expect, it } from 'vitest';

import {
  loginNoticeFrom,
  mfaStepPath,
  pathWithNext,
  singleSearchValue,
  staffNextPath,
} from '@/lib/utils/staff-paths';

describe('staffNextPath', () => {
  it('keeps a dashboard page, with its query', () => {
    expect(staffNextPath('/dashboard/bookings?status=paid')).toBe(
      '/dashboard/bookings?status=paid',
    );
    expect(staffNextPath('/dashboard')).toBe('/dashboard');
  });

  it.each([
    ['another host', '//evil.test/dashboard'],
    ['a backslash host', '/\\evil.test'],
    ['a public page', '/paket-wisata'],
    ['another sign-in step', '/mfa/verify'],
    ['a look-alike prefix', '/dashboardx'],
    ['nothing', undefined],
  ])('sends %s to the dashboard', (_case, next) => {
    expect(staffNextPath(next)).toBe('/dashboard');
  });
});

describe('pathWithNext', () => {
  it('carries a dashboard page along, encoded', () => {
    expect(pathWithNext('/mfa/verify', '/dashboard/bookings?status=paid')).toBe(
      '/mfa/verify?next=%2Fdashboard%2Fbookings%3Fstatus%3Dpaid',
    );
  });

  it('leaves the parameter out when the dashboard itself is next', () => {
    expect(pathWithNext('/mfa/verify', '/dashboard')).toBe('/mfa/verify');
    expect(pathWithNext('/login', '//evil.test')).toBe('/login');
  });
});

describe('mfaStepPath', () => {
  it('asks for the code when a factor is verified, and enrols one otherwise', () => {
    expect(mfaStepPath(true, '/dashboard/sessions')).toBe(
      '/mfa/verify?next=%2Fdashboard%2Fsessions',
    );
    expect(mfaStepPath(false, undefined)).toBe('/mfa/enroll');
  });
});

describe('singleSearchValue and loginNoticeFrom', () => {
  it('reads a parameter given once and ignores a repeated one', () => {
    expect(singleSearchValue('/dashboard')).toBe('/dashboard');
    expect(singleSearchValue(['/a', '/b'])).toBeUndefined();
  });

  it('shows only the notices the site links to', () => {
    expect(loginNoticeFrom('password-changed')).toBe('password-changed');
    expect(loginNoticeFrom('<script>')).toBeNull();
    expect(loginNoticeFrom(undefined)).toBeNull();
  });
});
