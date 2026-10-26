import { STICKY_MOBILE_CTA_PARENTS, WHATSAPP_FAB_HIDDEN_PREFIXES } from '@/config/routes';
import { isPathUnder } from '@/lib/utils/paths';

const WHATSAPP_CHAT_BASE_URL = 'https://wa.me/';

// wa.me wants the number as bare digits: +6281234567890 becomes 6281234567890.
export function buildWhatsAppChatUrl(phoneE164: string, message: string): string {
  const digits = phoneE164.replace(/\D/g, '');
  return `${WHATSAPP_CHAT_BASE_URL}${digits}?text=${encodeURIComponent(message)}`;
}

// A message the visitor sends to a contact of their own choosing, such as the treasurer: wa.me with no number opens
// the contact picker.
export function buildWhatsAppShareUrl(message: string): string {
  return `${WHATSAPP_CHAT_BASE_URL}?text=${encodeURIComponent(message)}`;
}

// The page title carries the site name after the template's separator; the greeting names the page alone.
export function pageTopicFromTitle(documentTitle: string, siteName: string): string {
  const topic = documentTitle.split(' | ')[0]?.trim() ?? '';
  return topic === '' ? siteName : topic;
}

export function isWhatsAppFabHidden(pathname: string): boolean {
  return WHATSAPP_FAB_HIDDEN_PREFIXES.some((prefix) => isPathUnder(pathname, prefix));
}

// The pages strictly below a parent, such as /paket-wisata/<slug>; the catalogue itself has no sticky bar.
export function hasStickyMobileCta(pathname: string): boolean {
  return STICKY_MOBILE_CTA_PARENTS.some((parent) => pathname.startsWith(`${parent}/`));
}
