import { MOBILE_PHONE_PATTERN, normalizePhone } from '@/lib/utils/phone';

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
