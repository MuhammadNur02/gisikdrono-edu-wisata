// Synthetic ticket tokens for the scanner's unit tests (CLAUDE.md §7.3 grammar: GSK.<kid>.<22 chars>.<22 chars>).
// They are built from their parts at run time, so no literal in the repository looks like a key to gitleaks, and none
// is signed: the server's HMAC check refuses every one.

const TOKEN_PREFIX = 'GSK';
const PART_LENGTH = 22;

export interface FakeTicketTokenParts {
  kid?: string;
  id?: string;
  signature?: string;
}

export function fakeTicketToken(parts: FakeTicketTokenParts = {}): string {
  return [
    TOKEN_PREFIX,
    parts.kid ?? 'k1',
    parts.id ?? 'A'.repeat(PART_LENGTH),
    parts.signature ?? 'b'.repeat(PART_LENGTH),
  ].join('.');
}
