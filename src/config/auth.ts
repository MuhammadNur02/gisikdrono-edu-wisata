// docs/Security.md §5.4: the staff session lives only in httpOnly cookies the browser script cannot read.
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
} as const;

export const LOGIN_PATH = '/login';
export const DASHBOARD_PATH = '/dashboard';
export const NEXT_PARAM = 'next';

export const FORGOT_PASSWORD_PATH = '/forgot-password';
export const RESET_PASSWORD_PATH = '/reset-password';
export const MFA_VERIFY_PATH = '/mfa/verify';
export const MFA_ENROLL_PATH = '/mfa/enroll';
export const ONBOARDING_PATH = '/onboarding';
// The only address in the Supabase Auth redirect allow-list (docs/Security.md APP-13).
export const AUTH_CALLBACK_PATH = '/auth/callback';
export const SIGN_OUT_PATH = '/auth/signout';

// What /login says above the form after a flow that ended there.
export const LOGIN_NOTICE_PARAM = 'info';
export const LOGIN_NOTICES = [
  'password-changed',
  'link-expired',
  // S1 of the PR #17 review: Supabase Auth could not end the account's other sessions.
  'password-changed-sessions-remain',
  'signed-out-here-only',
  // /onboarding accepted the invite and ended the onboarding session (Task P4.8.01).
  'onboarding-done',
  // auth/callback's own limit or its outage: the link has not been used and still works while it lasts.
  'link-try-later',
] as const;
export type LoginNotice = (typeof LOGIN_NOTICES)[number];

// How a session opened by the recovery email's token_hash names itself in amr: Supabase Auth gives `otp` to every
// email-link session, recovery included (measured on the local stack: verifyOtp({ type: 'recovery' }) gives
// amr [{ method: 'otp' }]); only a PKCE code said `recovery`, and this site no longer sends PKCE links. Another
// `otp` session would prove the same mailbox, and /reset-password still asks for the TOTP code.
export const RECOVERY_AUTH_METHOD = 'otp';

// docs/Security.md §5.3 (AUTH-11): how recent a TOTP check a critical write needs, the five minutes
// internal.has_fresh_totp() allows in the database (0004).
export const STEP_UP_MAX_AGE_SECONDS = 300;

// The name staff see for this site in their authenticator app.
export const TOTP_ISSUER = 'Edu Wisata Gisikdrono';

// docs/Security.md §8.3 and §4.3: what Turnstile's siteverify must say about a token.
export const TURNSTILE_MAX_TOKEN_AGE_SECONDS = 300;
export const TURNSTILE_TIMEOUT_MS = 5000;

// Turnstile's `action` for each form (letters, digits, - and _ only). The widget sends it with the token, and
// verifyTurnstile refuses a token whose answer names another form (I1 of the PR #17 review). Sign-in's token is
// checked by Supabase Auth itself, so its action is only reported in Cloudflare's analytics.
export const TURNSTILE_ACTIONS = {
  signIn: 'login',
  passwordReset: 'password_reset',
  passwordChange: 'password_change',
  mfaVerify: 'mfa_verify',
  // The visitor's forms (Task P3.2, P3.3). The email code has its own action, so a token solved for the WhatsApp
  // request cannot open the email fallback the breaker reserves for an interactive check.
  otpRequest: 'otp_request',
  otpEmail: 'otp_email',
  bookingLookup: 'booking_lookup',
  bookingCreate: 'booking_create',
  // The post-visit review form (Task P4.11.02).
  reviewSubmit: 'review_submit',
} as const;
export type TurnstileAction = (typeof TURNSTILE_ACTIONS)[keyof typeof TURNSTILE_ACTIONS];
