// What a sign-in step returns when it succeeds: the page the browser goes to next, always a path on this site that
// the server chose (src/lib/utils/staff-paths.ts).
export interface NextStep {
  redirectTo: string;
}

// /mfa/enroll draws the QR code from this (src/lib/utils/qr-path.ts); the secret is shown as well, for typing into an
// authenticator by hand.
export interface TotpEnrolment {
  factorId: string;
  secret: string;
  qr: { size: number; path: string };
}
