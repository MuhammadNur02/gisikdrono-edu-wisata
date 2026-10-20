import {
  DASHBOARD_PATH,
  LOGIN_NOTICES,
  MFA_ENROLL_PATH,
  MFA_VERIFY_PATH,
  NEXT_PARAM,
  type LoginNotice,
} from '@/config/auth';
import { isPathUnder } from '@/lib/utils/paths';
import { safeRedirect } from '@/lib/utils/safe-redirect';

// Signing in only ever leads into the dashboard, so `next` is honoured only below /dashboard and never sends a
// staff member to another sign-in step or off the site (CLAUDE.md §7.8 safeRedirect).
export function staffNextPath(next: string | null | undefined): string {
  const target = safeRedirect(next, DASHBOARD_PATH);
  return isPathUnder(target.split(/[?#]/)[0] ?? '', DASHBOARD_PATH) ? target : DASHBOARD_PATH;
}

// A sign-in step that remembers where the staff member was headed.
export function pathWithNext(path: string, next: string | null | undefined): string {
  const target = staffNextPath(next);
  if (target === DASHBOARD_PATH) return path;
  return `${path}?${new URLSearchParams({ [NEXT_PARAM]: target }).toString()}`;
}

// docs/Security.md §5.2 (AUTH-03): a password alone opens nothing. With a verified factor the TOTP code comes next;
// without one the factor is enrolled first.
export function mfaStepPath(hasVerifiedTotp: boolean, next: string | null | undefined): string {
  return pathWithNext(hasVerifiedTotp ? MFA_VERIFY_PATH : MFA_ENROLL_PATH, next);
}

type SearchValue = string | string[] | undefined;

// A query parameter given once; repeated or missing reads as absent.
export function singleSearchValue(value: SearchValue): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

// The note /login shows above the form, only for a value the site itself links to.
export function loginNoticeFrom(value: SearchValue): LoginNotice | null {
  return LOGIN_NOTICES.find((notice) => notice === value) ?? null;
}
