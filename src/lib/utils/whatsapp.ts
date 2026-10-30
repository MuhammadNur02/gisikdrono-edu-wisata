import { STICKY_MOBILE_CTA_PARENTS, WHATSAPP_FAB_HIDDEN_PREFIXES } from '@/config/routes';
import { productDetailCopy } from '@/lib/copy/catalogue';
import { isPathUnder } from '@/lib/utils/paths';

const WHATSAPP_CHAT_BASE_URL = 'https://wa.me/';

// wa.me wants the number as bare digits: +6281234567890 becomes 6281234567890.
export function buildWhatsAppChatUrl(phoneE164: string, message: string): string {
  const digits = phoneE164.replace(/\D/g, '');
  return `${WHATSAPP_CHAT_BASE_URL}${digits}?text=${encodeURIComponent(message)}`;
}

// The wa.me digits of an Indonesian WhatsApp number written any common way (+62 812-3456-7890, 0812 3456 7890), or
// null when it is none: missing, too short or too long, or of another country.
const INDONESIA_CALLING_CODE = '62';
const INDONESIAN_WHATSAPP_DIGITS = /^62[0-9]{8,13}$/;

export function whatsAppDigitsOf(phone: string | null): string | null {
  if (phone === null) return null;
  const digits = phone.replace(/\D/g, '');
  const international = digits.startsWith('0')
    ? `${INDONESIA_CALLING_CODE}${digits.slice(1)}`
    : digits;
  return INDONESIAN_WHATSAPP_DIGITS.test(international) ? international : null;
}

// The "Pesan via WhatsApp" link of a product (decision of 2026-10-29: UMKM products are ordered from the Koperasi
// Merah Putih): a plain wa.me link with the message already written for the visitor. Null while the Kopdes has no
// usable number, so the page leaves the button out instead of opening a chat with nobody.
export function buildOrderChatUrl(phone: string | null, message: string): string | null {
  const digits = whatsAppDigitsOf(phone);
  return digits === null ? null : buildWhatsAppChatUrl(digits, message);
}

export interface ProductOrderChoice {
  productName: string;
  rwLabel: string;
  // Whether the product page offers variants at all; a product without them gets no variant line.
  hasVariants: boolean;
  // The variant the visitor picked, null while none is.
  chosenVariant: string | null;
}

// The message of a product's order (decision of 2026-10-30): the product, its RW and, for a product with variants,
// `Varian: <label>`, or `Varian: (pilih)` while the visitor has not picked one, so the Kopdes knows to ask.
export function productOrderMessage(choice: ProductOrderChoice): string {
  const variant = choice.hasVariants
    ? (choice.chosenVariant ?? productDetailCopy.variantUnchosen)
    : null;
  return productDetailCopy.orderMessage(choice.productName, choice.rwLabel, variant);
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
