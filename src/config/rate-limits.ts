import type { RateLimitRule } from '@/types/rate-limit';

// docs/Security.md §8.3: every limit the server keeps in rate_limit_buckets, by bucket name. A limiter that cannot
// reach the database refuses (fail-closed), so sign-in, password reset, the scanner, exports and link minting never
// open up because Postgres is busy. Only booking creation (Task P3.4.02) may fail open, and only because Turnstile
// still stands in front of it (§4.3, BOOK-16).
export const RATE_LIMITS = {
  // Staff sign-in, per visitor IP and per IP and address, counted here before Auth is even asked: Auth sees the
  // app's sign-ins arrive from this server's IP, and on the Pro plan it locks no account itself (§5.5, R6).
  'login:ip': { limit: 10, windowSeconds: 300, whenUnavailable: 'fail-closed' },
  'login:ip+email': { limit: 5, windowSeconds: 900, whenUnavailable: 'fail-closed' },
  // /forgot-password answers the same when any of these is used up (silent success). It counts per IP and per IP and
  // address, as sign-in does, so nobody else can use up a staff member's own resets (F2 of the PR #17 review). The
  // address's daily ceiling is counted after the answer, for the requests that got that far, and stops a flood of
  // reset emails sent from many IPs; a window of a day is as long as rate_limit_buckets keeps a row.
  'password_reset:ip': { limit: 10, windowSeconds: 3600, whenUnavailable: 'fail-closed' },
  'password_reset:ip+email': { limit: 3, windowSeconds: 3600, whenUnavailable: 'fail-closed' },
  'password_reset:email': { limit: 10, windowSeconds: 86400, whenUnavailable: 'fail-closed' },
  // auth/callback per visitor IP, counted before Supabase Auth verifies the link. Auth sees every verification come
  // from this server's IP, so without it one visitor could use up Auth's per-IP verification limit for every staff
  // member (RV-M1 of the independent review of PR #17).
  'auth_callback:ip': { limit: 10, windowSeconds: 900, whenUnavailable: 'fail-closed' },
  // Per staff member per hour. upload_sign counts api/uploads/sign and each booklet's single api/uploads/sign-pages;
  // upload_finalize leaves room for a whole booklet (its PDF and 100 pages) and photos; upload_forbidden caps how
  // many refused attempts are recorded one by one (security review of PR #14, L6, L8).
  upload_sign: { limit: 60, windowSeconds: 3600, whenUnavailable: 'fail-closed' },
  upload_finalize: { limit: 300, windowSeconds: 3600, whenUnavailable: 'fail-closed' },
  upload_forbidden: { limit: 10, windowSeconds: 3600, whenUnavailable: 'fail-closed' },
  // Task P2.4.08: the public "Unduh PDF" of a published booklet, per visitor IP.
  'booklet:download': { limit: 30, windowSeconds: 60, whenUnavailable: 'fail-closed' },
  // Task P4.6.03: the history's "Unduh lagi", per staff member, before each repeat download is logged (review of PR #63).
  'export_download:user': { limit: 30, windowSeconds: 3600, whenUnavailable: 'fail-closed' },
  // Task P3.6.04 (docs/Security.md §10.3, DOC-01): a booking's own documents (quotation, invoice, receipt), per
  // visitor IP and per booking, counted before the row is looked up, so guessing ids costs the same as reading.
  'document:ip': { limit: 30, windowSeconds: 60, whenUnavailable: 'fail-closed' },
  'document:booking': { limit: 20, windowSeconds: 600, whenUnavailable: 'fail-closed' },
  // Task P4.5.03 (review of PR #71, L3): "Render ulang PDF" renders a whole class at once, so each staff member may run
  // it five times an hour.
  'certificate_rerender:user': { limit: 5, windowSeconds: 3600, whenUnavailable: 'fail-closed' },
  // Task P3.6.05: the public verify page, per visitor IP.
  'verify:code': { limit: 30, windowSeconds: 60, whenUnavailable: 'fail-closed' },
  // Task P3.6.06: "Minta Surat Penawaran", per visitor IP, on top of the booking limits.
  'quotation:create': { limit: 3, windowSeconds: 3600, whenUnavailable: 'fail-closed' },
  // Task P3.7.04: "Bayar sekarang", per booking. An open Snap page is reused, so a visitor reaches this only by asking
  // Midtrans for a new page again and again.
  'payment_start:booking': { limit: 10, windowSeconds: 3600, whenUnavailable: 'fail-closed' },
  // docs/Security.md §3.3 step 2 (Task P3.8.03): the Midtrans webhook, per sender IP and for all senders together,
  // counted before anything else is written. Refused rejections are recorded at most twenty an hour per IP.
  'webhook_midtrans:ip': { limit: 30, windowSeconds: 60, whenUnavailable: 'fail-closed' },
  'webhook_midtrans:all': { limit: 600, windowSeconds: 60, whenUnavailable: 'fail-closed' },
  'webhook_rejection:ip': { limit: 20, windowSeconds: 3600, whenUnavailable: 'fail-closed' },
  // docs/Security.md §8.3 (Task P3.11.06, P3.11.09; review of PR #66, L4, and its re-review, L-C): Meta's and Resend's
  // delivery reports, per sender IP before the signature is checked and, for Meta, for all senders together only once a
  // body verified, so an unsigned host never uses up Meta's share (re-review of PR #70, M-2). Past either limit a report is answered 429, which only makes its sender try it again
  // later, so the caps follow what this site sends, a few hundred messages a day, not Meta's own throughput.
  'webhook_whatsapp:ip': { limit: 600, windowSeconds: 60, whenUnavailable: 'fail-closed' },
  'webhook_whatsapp:all': { limit: 600, windowSeconds: 60, whenUnavailable: 'fail-closed' },
  'webhook_resend:ip': { limit: 300, windowSeconds: 60, whenUnavailable: 'fail-closed' },
  // Task P3.10.03: the public QR landing /v/[token], per visitor IP, so ticket ids cannot be guessed in bulk.
  'qr_landing:ip': { limit: 60, windowSeconds: 60, whenUnavailable: 'fail-closed' },
  // Task P3.11.07: GET /api/health, per IP, so its reads cannot be used to load the database. The uptime monitor asks
  // every few minutes; a database the limiter cannot reach answers as down.
  'health:ip': { limit: 30, windowSeconds: 60, whenUnavailable: 'fail-closed' },
  // Visitors (Task P3.2, P3.3), per IP. The daily caps on codes (5 per number or address, 20 per IP) are counted by
  // internal.issue_phone_otp itself; these stop a burst before it reaches Turnstile and the database. A code has five
  // tries of its own; the verify limit stops one IP from trying many codes at once.
  'otp_request:ip': { limit: 10, windowSeconds: 900, whenUnavailable: 'fail-closed' },
  'otp_verify:ip': { limit: 30, windowSeconds: 900, whenUnavailable: 'fail-closed' },
  // docs/PRD.md FR-BOOK-16: 5 lookups per IP in 15 minutes.
  'lookup:ip': { limit: 5, windowSeconds: 900, whenUnavailable: 'fail-closed' },
  // Every guest page and action checks its link; the status page refreshing every 5 s stays well inside this.
  'link_verify:ip': { limit: 30, windowSeconds: 60, whenUnavailable: 'fail-closed' },
  'link_revoke:booking': { limit: 5, windowSeconds: 3600, whenUnavailable: 'fail-closed' },
  // Task P4.11.02 (docs/Security.md RL-04): reviews sent from one IP a day, counted before Turnstile. A booking takes one
  // review only; this stops one IP filling the moderation queue through many links.
  'review:submit': { limit: 3, windowSeconds: 86400, whenUnavailable: 'fail-closed' },
  // docs/Security.md §4.3 (BOOK-13): bookings a day per proven contact (the WhatsApp number, or while WhatsApp codes
  // are degraded the address, in its BOOK-11 spelling) and per IP and browser. These fail open, the only ones that
  // do, because Turnstile and the database's own caps (two unpaid holds per contact, half a session) still stand
  // (BOOK-16). A day is as long as rate_limit_buckets keeps a row.
  'booking:phone': { limit: 5, windowSeconds: 86400, whenUnavailable: 'fail-open' },
  'booking:email': { limit: 5, windowSeconds: 86400, whenUnavailable: 'fail-open' },
  'booking:ip+ua': { limit: 10, windowSeconds: 86400, whenUnavailable: 'fail-open' },
  // Every "Konfirmasi & Bayar" or "Minta Surat Penawaran" sent from one IP, counted right after the form is read and
  // before Turnstile, so a burst of submits reaches neither siteverify nor the database (review of PR #27, L1).
  'booking_create:ip': { limit: 20, windowSeconds: 900, whenUnavailable: 'fail-closed' },
  // The wizard's read-only answers (Task P3.5.01, P3.5.03): the seats left every 15 s and the quote as add-ons change.
  // They show what the database already says, so a refusal costs the visitor a refresh, never a booking. A school lab
  // or a kampung behind one IP has several visitors choosing at once (review of PR #27, L7).
  'session_availability:ip': { limit: 30, windowSeconds: 60, whenUnavailable: 'fail-closed' },
  'quote_preview:ip': { limit: 30, windowSeconds: 60, whenUnavailable: 'fail-closed' },
  // Task P4.1.01 (docs/Security.md AUTH-11): the codes a signed-in staff member types to unlock the idle screen or to
  // step up before a critical action, per account. A code has a million values and changes every 30 s, so ten tries
  // in fifteen minutes leave a guesser nothing and a typo plenty of room.
  'step_up:user': { limit: 10, windowSeconds: 900, whenUnavailable: 'fail-closed' },
  // Task P4.8.02 (L2 of the PR #43 review): invites a superadmin creates, per account. A kelurahan invites a handful
  // of officers a year, so ten an hour leaves room for corrections and caps a stolen session minting codes.
  'invite:user': { limit: 10, windowSeconds: 3600, whenUnavailable: 'fail-closed' },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;
