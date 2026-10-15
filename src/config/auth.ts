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
