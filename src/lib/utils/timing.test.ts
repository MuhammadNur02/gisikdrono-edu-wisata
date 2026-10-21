import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { waitUntilElapsed } from './timing';

describe('waitUntilElapsed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds a quick answer back until the minimum has passed', async () => {
    const startedAt = Date.now();
    let isDone = false;
    void waitUntilElapsed(startedAt, 1000).then(() => {
      isDone = true;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(isDone).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(isDone).toBe(true);
  });

  it('adds nothing to an answer that already took longer', async () => {
    const startedAt = Date.now() - 5000;
    await expect(waitUntilElapsed(startedAt, 1000)).resolves.toBeUndefined();
  });
});
