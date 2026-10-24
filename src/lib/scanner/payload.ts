import { QR_TOKEN_PATTERN } from '@/lib/qr/token-pattern';

// docs/PRD.md FR-SCAN-03: what the camera read is a hint, never proof. A ticket's QR holds https://<site>/v/<token>
// (CLAUDE.md §7.3); the site may be another deployment's address, so only the path counts here, and only the server's
// HMAC check (src/lib/qr/verify.ts) says whether the token is genuine. Anything that is not a ticket's grammar is
// reported as `Bukan tiket` and never sent.

const LANDING_PREFIX = '/v/';
// A QR holds a few hundred characters at most; anything longer is not ours.
const MAX_PAYLOAD_LENGTH = 512;

function tokenFromUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!url.pathname.startsWith(LANDING_PREFIX)) return null;
  return url.pathname.slice(LANDING_PREFIX.length);
}

// The token of a ticket's QR, from its landing URL or as a bare token; null for any other content.
export function ticketTokenOf(raw: string): string | null {
  const payload = raw.trim();
  if (payload === '' || payload.length > MAX_PAYLOAD_LENGTH) return null;
  const token = QR_TOKEN_PATTERN.test(payload) ? payload : tokenFromUrl(payload);
  return token !== null && QR_TOKEN_PATTERN.test(token) ? token : null;
}

// FR-SCAN-06: the same payload read again within the window is the same ticket held up a second time, not a new scan.
export function isRepeatedPayload(
  payload: string,
  last: { payload: string; at: number } | null,
  now: number,
  windowMs: number,
): boolean {
  return last !== null && last.payload === payload && now - last.at < windowMs;
}
