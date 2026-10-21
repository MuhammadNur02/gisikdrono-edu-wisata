import { z } from 'zod';

import { copy } from '@/lib/copy/id';

// Free text that ends up in a WhatsApp message, an email or a document: a name, an institution, a
// package or session label. Messages leave from the kelurahan's official number, so a link, a host,
// an IP address, an email address or a phone number in them would read as the kelurahan's own
// (docs/Security.md GUEST-07, CLAUDE.md Recipe C). The database holds back any message with such a
// link (notifications_guest_guard); checking here first tells the visitor at the form instead.
const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /[a-z][a-z0-9+.-]*:\/\//i, // any scheme://
  /\b(?:javascript|data):/i,
  /\bwww\./i,
  /\b[a-z0-9-]+\.[a-z]{2,}\b/i, // a host, name.tld
  /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/, // an IPv4 address
  /@/, // an email address
  /(?<![a-z0-9/-])(?:\+ ?62|62|0)[ .-]?8(?:[ .-]?\d){7,11}(?!\d)/i, // an Indonesian phone number
  /\d{8,}/, // any other long run of digits
];

// Indonesian academic and honorific titles written with dots (S.Pd., M.Sc, Dr., Univ.Diponegoro) are
// not hosts, so they are set aside before the checks, unless a dot, letter or slash carries on from
// them: "s.pd.com" and "univ.gisik-bayar.top" still count as hosts. Kept in step with the title pattern
// of internal.refused_notification_text in supabase/migrations/0004_functions.sql.
const ACADEMIC_TITLE =
  /(?<![a-z0-9.-])(?:(?:s\.(?:pd\.i|pd|si|ag|kom|t|h|e|sos|ip|ked|psi|farm|kep|hum|ak|pt|tr|gz)|m\.(?:pd\.i|pd|si|sc|kom|m|t|h|kes|ag|hum|psi|ak|eng)|b\.sc|a\.md|ph\.d)\b(?!\.?[a-z0-9/:])\.?|(?:dr|dra|drs|ir|prof|univ|hj|kh|st|h)\.(?![/:]))/gi;

export function isSafeFreeText(value: string): boolean {
  const withoutTitles = value.replace(ACADEMIC_TITLE, ' ');
  return !FORBIDDEN_PATTERNS.some((pattern) => pattern.test(withoutTitles));
}

// What a form shows when the text is missing or too long; a field no visitor types needs neither.
interface FreeTextMessages {
  required?: string;
  tooLong?: string;
}

export function freeTextSchema(maxLength: number, messages: FreeTextMessages = {}) {
  return z
    .string()
    .trim()
    .min(1, messages.required)
    .max(maxLength, messages.tooLong)
    .refine(isSafeFreeText, { message: copy.validation.freeText });
}

// The same for a field that may stay empty: left out, blank or null, it becomes null, and null parses again unchanged.
export function optionalFreeTextSchema(
  maxLength: number,
  messages: Pick<FreeTextMessages, 'tooLong'> = {},
) {
  return z
    .string()
    .trim()
    .max(maxLength, messages.tooLong)
    .refine(isSafeFreeText, { message: copy.validation.freeText })
    .nullish()
    .transform((value) => (value === undefined || value === null || value === '' ? null : value));
}
