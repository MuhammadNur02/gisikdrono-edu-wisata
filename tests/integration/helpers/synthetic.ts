import { randomInt } from 'node:crypto';

// Phone numbers for fixtures (review of PR #84, L-5). Every one starts with SYNTHETIC_PHONE_PREFIX, +62 811 0, a block
// these suites keep for made-up visitors and never give a real person, followed by a six-digit tag of the run and an
// index. A stray row or message is then plain to see and easy to remove, and the result still passes every check a
// real number meets: the table's ^\+62[0-9]{8,13}$ and issue_phone_otp's Indonesian mobile ^\+628[0-9]{7,11}$ for an
// index of two digits.

export const SYNTHETIC_PHONE_PREFIX = '+628110';

// A tag of six digits for one run of one suite, so neither its daily caps nor its rows meet an earlier run's.
export function runTag(): string {
  return String(randomInt(100000, 999999));
}

export function syntheticPhone(run: string, index: number, digits = 2): string {
  return `${SYNTHETIC_PHONE_PREFIX}${run}${String(index).padStart(digits, '0')}`;
}

// The LIKE pattern of every number syntheticPhone gives one run.
export function syntheticPhonesOf(run: string): string {
  return `${SYNTHETIC_PHONE_PREFIX}${run}%`;
}
