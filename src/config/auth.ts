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
// The only address in the Supabase Auth redirect allow-list (docs/Security.md APP-13).
export const AUTH_CALLBACK_PATH = '/auth/callback';
export const SIGN_OUT_PATH = '/auth/signout';

// What /login says above the form after a flow that ended there.
export const LOGIN_NOTICE_PARAM = 'info';
export const LOGIN_NOTICES = ['password-changed', 'link-expired'] as const;
export type LoginNotice = (typeof LOGIN_NOTICES)[number];

// The name staff see for this site in their authenticator app.
export const TOTP_ISSUER = 'Edu Wisata Gisikdrono';

// /forgot-password answers no sooner than this, so an address that gets a reset email takes as long as one that
// does not (docs/Security.md §5.1: the same response for every address).
export const PASSWORD_RESET_ANSWER_MS = 2000;

// docs/Security.md §8.3 and §4.3: what Turnstile's siteverify must say about a token.
export const TURNSTILE_MAX_TOKEN_AGE_SECONDS = 300;
export const TURNSTILE_TIMEOUT_MS = 5000;
