import { GUEST_LINK_TTL_SECONDS } from '@/config/guest';
import type { NotificationTemplateName, OutgoingMessage } from '@/lib/notifications/types';

// The words of the messages the worker can send so far, for email and for the local Mailpit's copy of a WhatsApp
// message. WhatsApp's own wording is the template Meta approved (docs/notifications.md); these say the same thing.
// The other templates of docs/Task.md Appendix B join this list as their tasks land (P3.11.02 to P3.11.04).

export const SENDABLE_TEMPLATES = [
  'phone_otp',
  'booking_link',
] as const satisfies readonly NotificationTemplateName[];
export type SendableTemplate = (typeof SENDABLE_TEMPLATES)[number];

export function isSendableTemplate(
  template: NotificationTemplateName,
): template is SendableTemplate {
  return SENDABLE_TEMPLATES.some((sendable) => sendable === template);
}

const SITE_NAME = 'Edu Wisata Gisikdrono';
const DAY_SECONDS = 86400;
// The manage and view links a lookup sends live equally long.
const LINK_LIFETIME_DAYS = Math.round(GUEST_LINK_TTL_SECONDS.view / DAY_SECONDS);

export interface MessageText {
  subject: string;
  text: string;
}

function param(message: OutgoingMessage, name: string): string {
  return String(message.bodyParams[name] ?? '');
}

function otpText(message: OutgoingMessage): MessageText {
  const code = param(message, 'code');
  return {
    subject: `Kode verifikasi ${SITE_NAME}`,
    text: [
      `${code} adalah kode verifikasi Anda untuk memesan kunjungan di ${SITE_NAME}.`,
      'Kode berlaku 5 menit. Jangan berikan kode ini kepada siapa pun, termasuk petugas kelurahan.',
      'Jika Anda tidak sedang memesan, abaikan pesan ini.',
    ].join('\n\n'),
  };
}

function bookingLinkText(message: OutgoingMessage): MessageText {
  const bookingCode = param(message, 'booking_code');
  return {
    subject: `Tautan reservasi ${bookingCode}`,
    text: [
      `Halo ${param(message, 'name')},`,
      `Ini tautan untuk membuka reservasi ${bookingCode} di ${SITE_NAME}:\n${message.link?.url ?? ''}`,
      `Tautan berlaku ${String(LINK_LIFETIME_DAYS)} hari dan hanya untuk Anda; jangan teruskan ke orang lain.`,
      'Jika Anda tidak memintanya, abaikan pesan ini.',
    ].join('\n\n'),
  };
}

export function messageText(
  message: OutgoingMessage & { template: SendableTemplate },
): MessageText {
  return message.template === 'phone_otp' ? otpText(message) : bookingLinkText(message);
}
