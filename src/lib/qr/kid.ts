// The spelling of a QR signing kid (docs/Security.md §9.1): what a token, tickets_qr.key_id and src/lib/env.ts all
// accept. It lives apart from sign.ts so env.ts, which the Edge middleware reaches through the guest-link check, never
// pulls node:crypto into that bundle.
export const QR_KID_PATTERN = /^[a-z0-9]+$/;
