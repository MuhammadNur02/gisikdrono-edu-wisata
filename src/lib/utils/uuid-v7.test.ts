import { describe, expect, it } from 'vitest';

import { createUuidV7, UUID_V7_PATTERN, uuidV7Time } from './uuid-v7';

describe('createUuidV7', () => {
  it('writes a version 7 UUID that carries the time it was made', () => {
    const now = Date.UTC(2026, 9, 18, 3, 4, 5, 678);

    const uuid = createUuidV7(now);

    expect(uuid).toMatch(UUID_V7_PATTERN);
    expect(uuidV7Time(uuid)).toBe(now);
  });

  it('never repeats itself within the same millisecond', () => {
    const now = Date.now();

    expect(createUuidV7(now)).not.toBe(createUuidV7(now));
  });
});

describe('uuidV7Time', () => {
  it('refuses anything that is not a UUID v7', () => {
    expect(uuidV7Time('4d1f8a2e-3b5c-4d6e-8f70-123456789abc')).toBeNull();
    expect(uuidV7Time('../../public-media/x')).toBeNull();
    expect(uuidV7Time('')).toBeNull();
  });
});
