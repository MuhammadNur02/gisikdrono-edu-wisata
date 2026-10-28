import {
  INTERNATIONAL_PHONE_PATTERN,
  MOBILE_PHONE_PATTERN,
  normalizePhone,
} from '@/lib/utils/phone';

// docs/Security.md §4.3 (BOOK-11): the one spelling of an email address or a phone number that limits, duplicate
// checks and notifications count by, so 'A.Budi+promo@Gmail.com' and 'abudi@gmail.com' land in one bucket.

// Gmail ignores dots in the mailbox and everything after a plus; googlemail.com is the same mailbox.
const GMAIL_DOMAINS: ReadonlySet<string> = new Set(['gmail.com', 'googlemail.com']);
const GMAIL_DOMAIN = 'gmail.com';
const PLUS_TAG = '+';

export function normalizeEmail(email: string): string {
  const lowered = email.trim().toLowerCase();
  const at = lowered.lastIndexOf('@');
  const domain = lowered.slice(at + 1);
  if (at <= 0 || !GMAIL_DOMAINS.has(domain)) return lowered;
  const [mailbox = ''] = lowered.slice(0, at).split(PLUS_TAG);
  return `${mailbox.replaceAll('.', '')}@${GMAIL_DOMAIN}`;
}

// E.164 +62 mobile numbers only, or null: a landline cannot receive the WhatsApp OTP a booking needs.
export function normalizeMobilePhone(input: string): string | null {
  const phone = normalizePhone(input);
  return phone !== null && MOBILE_PHONE_PATTERN.test(phone) ? phone : null;
}

const INDONESIAN_PREFIX = '+62';

// Task P4.3.10: the number an officer enters for a group. An Indonesian number in any of the ways people write it, or a
// number from abroad that starts with + and its country code, returned in E.164; null otherwise. The officer checks it
// with the group, since this path has no OTP.
export function normalizeInternationalPhone(input: string): string | null {
  const indonesian = normalizePhone(input);
  if (indonesian !== null) return indonesian;
  const trimmed = input.trim();
  if (!trimmed.startsWith('+')) return null;
  const phone = `+${trimmed.replace(/\D/g, '')}`;
  // A +62 number normalizePhone refused is no Indonesian number, and no foreign one either (review of PR #91, L6).
  if (phone.startsWith(INDONESIAN_PREFIX)) return null;
  return INTERNATIONAL_PHONE_PATTERN.test(phone) ? phone : null;
}
