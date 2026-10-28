import { describe, expect, it, vi } from 'vitest';

import { blockedOf } from './adjustment-reads';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));

const A = '0192f3a4-5b6c-7d8e-9f01-0000000000a1';
const B = '0192f3a4-5b6c-7d8e-9f01-0000000000b2';
const RELEASED = { release_note: 'Angka Midtrans sudah dicek', released_sum: 80000 };

// Review of PR #80, L-3, tested as the review of PR #103 asks: an adjustment is blocked while its latest
// refund_key_mismatch alert has no release note, whether that alert was acknowledged or not.
describe('blockedOf', () => {
  it('blocks on a latest alert without a release note', () => {
    expect(blockedOf([{ fingerprint: `refund_key_mismatch:${A}`, details: {} }])).toEqual(new Set([A]));
  });

  it('releases on a latest alert that carries one', () => {
    expect(blockedOf([{ fingerprint: `refund_key_mismatch:${A}`, details: RELEASED }])).toEqual(new Set());
  });

  it('reads only the newest alert of each adjustment', () => {
    const alerts = [
      { fingerprint: `refund_key_mismatch:${A}`, details: {} },
      { fingerprint: `refund_key_mismatch:${B}`, details: RELEASED },
      { fingerprint: `refund_key_mismatch:${A}`, details: RELEASED },
      { fingerprint: `refund_key_mismatch:${B}`, details: {} },
    ];
    expect(blockedOf(alerts)).toEqual(new Set([A]));
  });

  it('treats an empty release note as none', () => {
    expect(
      blockedOf([{ fingerprint: `refund_key_mismatch:${A}`, details: { release_note: '' } }]),
    ).toEqual(new Set([A]));
  });
});
