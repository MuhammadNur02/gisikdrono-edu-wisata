import { INVITE_CODE_GROUP_LENGTH } from '@/config/staff';

// The spelling of the codes the superadmin reads out to a new officer (docs/Security.md §5.1): Crockford base32,
// which has no I, L, O or U, so a code read aloud or copied by hand is hard to get wrong.
export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const LOOK_ALIKES: Record<string, string> = { O: '0', I: '1', L: '1' };
const GROUP_SEPARATOR = '-';

// What someone types, `abcde fghij-klmno`, in the one spelling the hash is made of: upper case, no separators,
// look-alike letters read as the digit people meant.
export function normalizeStaffCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/[OIL]/g, (letter) => LOOK_ALIKES[letter] ?? letter);
}

// `ABCDE-FGHJK-MNPQR-STVWX`: groups of five for reading out.
export function formatStaffCode(code: string): string {
  const groups: string[] = [];
  for (let start = 0; start < code.length; start += INVITE_CODE_GROUP_LENGTH) {
    groups.push(code.slice(start, start + INVITE_CODE_GROUP_LENGTH));
  }
  return groups.join(GROUP_SEPARATOR);
}
