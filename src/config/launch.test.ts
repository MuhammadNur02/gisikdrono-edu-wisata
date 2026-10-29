import { afterEach, describe, expect, it, vi } from 'vitest';

import { isPrelaunchFlag } from './launch';

describe('isPrelaunchFlag', () => {
  it('is pre-launch for "on" only; unset and "off" are a launched site', () => {
    expect(isPrelaunchFlag('on')).toBe(true);
    expect(isPrelaunchFlag('off')).toBe(false);
    expect(isPrelaunchFlag(undefined)).toBe(false);
  });
});

// Read fresh from the stubbed environment, since the flag is fixed when the build reads it.
async function loadIsPrelaunch(flag: string) {
  vi.stubEnv('NEXT_PUBLIC_FLAG_PRELAUNCH', flag);
  vi.resetModules();
  const { isPrelaunch } = await import('./launch');
  return isPrelaunch();
}

describe('isPrelaunch', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('follows NEXT_PUBLIC_FLAG_PRELAUNCH', async () => {
    await expect(loadIsPrelaunch('on')).resolves.toBe(true);
    await expect(loadIsPrelaunch('off')).resolves.toBe(false);
    await expect(loadIsPrelaunch('')).resolves.toBe(false);
  });
});
