import { z } from 'zod';

import { copy } from '@/lib/copy/id';

// Free text that ends up in a WhatsApp message, an email or a document: a name, an institution, a
// package or session label. Messages leave from the kelurahan's official number, so a link, a host,
// an IP address, an email address or a phone number in them would read as the kelurahan's own
// (docs/Security.md GUEST-07, CLAUDE.md Recipe C). The database refuses the same links in the outbox
// (notifications_guest_guard); checking here first keeps that backstop from ever stopping a payment.
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

export function isSafeFreeText(value: string): boolean {
  return !FORBIDDEN_PATTERNS.some((pattern) => pattern.test(value));
}

export function freeTextSchema(maxLength: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .refine(isSafeFreeText, { message: copy.validation.freeText });
}
