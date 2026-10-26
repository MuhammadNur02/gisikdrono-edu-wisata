import { describe, expect, it } from 'vitest';

import { toneSchedule } from '@/lib/scanner/beep';

describe('toneSchedule', () => {
  it('gives green one short note, amber two with a gap, red one long low note', () => {
    expect(toneSchedule('success')).toEqual([{ frequency: 1046, startMs: 0, durationMs: 120 }]);
    expect(toneSchedule('warning')).toEqual([
      { frequency: 784, startMs: 0, durationMs: 90 },
      { frequency: 784, startMs: 170, durationMs: 90 },
    ]);
    const [low] = toneSchedule('danger');
    expect(low?.durationMs).toBeGreaterThan(300);
    expect(low?.frequency).toBeLessThan(400);
  });
});
