// The grammar of a ticket token: 'GSK.' + kid + '.' + base64url(ticket id) + '.' + 22 characters of signature
// (CLAUDE.md §7.3). It lives apart from verify.ts, which is server-only, so the scanner can tell a ticket from any
// other QR before it sends anything (docs/PRD.md FR-SCAN-03). Only verify.ts decides whether a token is genuine.
export const QR_TOKEN_PATTERN = /^GSK\.([a-z0-9]+)\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})$/;
