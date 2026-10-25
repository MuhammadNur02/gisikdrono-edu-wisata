import { GUEST_LINK_TTL_SECONDS } from '@/config/guest';
import { DB_ENUMS } from '@/db/enums';
import type { NotificationTemplateName, OutgoingMessage } from '@/lib/notifications/types';

// The words of every message, for email and for the local Mailpit's copy of a WhatsApp message (Task P3.11.04).
// WhatsApp's own wording is the template Meta approves (docs/notifications.md); these say the same thing. Every
// value arrives already shown the Indonesian way (src/lib/notifications/compose.ts), and links only as addresses:
// an email never carries an attachment (docs/Security.md EP-03).

export const SENDABLE_TEMPLATES = DB_ENUMS.notification_template;

const SITE_NAME = 'Edu Wisata Gisikdrono';
const DAY_SECONDS = 86400;
// The manage and view links a lookup sends live equally long.
const LINK_LIFETIME_DAYS = Math.round(GUEST_LINK_TTL_SECONDS.view / DAY_SECONDS);
const SIGN_OFF = `Salam,\n${SITE_NAME}`;

export interface MessageText {
  subject: string;
  text: string;
}

type Words = (
  value: (name: string) => string,
  link: string,
) => { subject: string; lines: string[] };

function linkLine(label: string, link: string): string[] {
  return link === '' ? [] : [`${label}:\n${link}`];
}

const MESSAGE_WORDS: Record<NotificationTemplateName, Words> = {
  phone_otp: (value) => ({
    subject: `Kode verifikasi ${SITE_NAME}`,
    lines: [
      `${value('code')} adalah kode verifikasi Anda untuk memesan kunjungan di ${SITE_NAME}.`,
      'Kode berlaku 5 menit. Jangan berikan kode ini kepada siapa pun, termasuk petugas kelurahan.',
      'Jika Anda tidak sedang memesan, abaikan pesan ini.',
    ],
  }),
  booking_link: (value, link) => ({
    subject: `Tautan reservasi ${value('booking_code')}`,
    lines: [
      `Halo ${value('name')},`,
      `Ini tautan untuk membuka reservasi ${value('booking_code')} di ${SITE_NAME}:\n${link}`,
      `Tautan berlaku ${String(LINK_LIFETIME_DAYS)} hari dan hanya untuk Anda; jangan teruskan ke orang lain.`,
      'Jika Anda tidak memintanya, abaikan pesan ini.',
    ],
  }),
  weather_disruption: (value) => ({
    subject: `Kunjungan ${value('booking_code')} terhalang cuaca`,
    lines: [
      `Halo ${value('name')},`,
      `Kelurahan mengabarkan kunjungan pesanan ${value('booking_code')} di ${value('rw')} pada ` +
        `${value('date')} terhalang cuaca.`,
      `Sampai ${value('deadline')} Anda bisa memindah jadwal (paling banyak ${value('moves')} kali) atau meminta ` +
        'pengembalian dana dikurangi biaya Midtrans. Bila tidak ada pilihan sampai batas itu, dana ' +
        'dikembalikan otomatis.',
      'Tautan untuk mengelola reservasi kami kirim dalam pesan terpisah.',
    ],
  }),
  booking_created: (value, link) => ({
    subject: `Pesanan ${value('booking_code')} menunggu pembayaran`,
    lines: [
      `Halo ${value('name')},`,
      `Pesanan ${value('booking_code')} sudah kami catat: ${value('package')}, ${value('date')}, ${value('session')}, ` +
        `${value('pax')} orang. Totalnya ${value('total')}.`,
      `Kuota sesi kami tahan sampai ${value('deadline')}. Selesaikan pembayaran sebelum itu, ya.`,
      ...linkLine('Buka pesanan', link),
    ],
  }),
  quotation_ready: (value, link) => ({
    subject: `Surat Penawaran ${value('quotation_number')}`,
    lines: [
      `Halo ${value('name')},`,
      `Surat Penawaran ${value('quotation_number')} untuk pesanan ${value('booking_code')} sudah siap dan ` +
        `berlaku sampai ${value('valid_until')}.`,
      ...linkLine('Lihat penawaran', link),
    ],
  }),
  payment_reminder: (value, link) => ({
    subject: `Pengingat pembayaran ${value('booking_code')}`,
    lines: [
      `Halo ${value('name')},`,
      `Pembayaran pesanan ${value('booking_code')} sebesar ${value('total')} belum kami terima. ` +
        `Batasnya ${value('deadline')}; setelah itu kuota sesi dilepas.`,
      ...linkLine('Bayar sekarang', link),
    ],
  }),
  payment_received_ticket: (value, link) => ({
    subject: `Tiket kunjungan ${value('booking_code')}`,
    lines: [
      `Halo ${value('name')},`,
      `Pembayaran pesanan ${value('booking_code')} sudah kami terima. Tiket Anda: ${value('package')}, ` +
        `${value('date')}, ${value('session')}, ${value('pax')} orang.`,
      'Tunjukkan kode QR tiket kepada petugas di gerbang RW pada hari kunjungan.',
      ...linkLine('Lihat tiket', link),
    ],
  }),
  booking_expired: (value, link) => ({
    subject: `Pesanan ${value('booking_code')} kedaluwarsa`,
    lines: [
      `Halo ${value('name')},`,
      `Batas pembayaran pesanan ${value('booking_code')} sudah lewat, jadi kuota sesinya kami lepas.`,
      ...linkLine('Masih ingin berkunjung? Pesan lagi', link),
    ],
  }),
  booking_cancelled: (value) => ({
    subject: `Pesanan ${value('booking_code')} dibatalkan`,
    lines: [`Halo ${value('name')},`, `Pesanan ${value('booking_code')} sudah dibatalkan.`],
  }),
  visit_reminder_d1: (value, link) => ({
    subject: 'Besok jadwal kunjungan Anda',
    lines: [
      `Halo ${value('name')},`,
      `Besok, ${value('date')}, ${value('session')}, rombongan Anda kami tunggu di ${value('gate')}.`,
      'Siapkan kode QR tiket untuk dipindai petugas di gerbang.',
      ...linkLine('Lihat tiket', link),
    ],
  }),
  checked_in_thanks: (value) => ({
    subject: `Terima kasih sudah berkunjung ke ${SITE_NAME}`,
    lines: [
      `Halo ${value('name')},`,
      `Terima kasih, ${value('institution')}, sudah berkunjung hari ini.`,
    ],
  }),
  certificate_ready: (value, link) => ({
    subject: `Sertifikat kunjungan ${value('booking_code')}`,
    lines: [
      `Halo ${value('name')},`,
      `Sertifikat kunjungan pesanan ${value('booking_code')} sudah bisa diunduh.`,
      ...linkLine('Unduh sertifikat', link),
    ],
  }),
  review_invite: (value, link) => ({
    subject: 'Bagaimana kunjungan Anda?',
    lines: [
      `Halo ${value('name')},`,
      'Terima kasih sudah berkunjung. Ceritakan pengalaman Anda supaya kunjungan berikutnya makin baik.',
      ...linkLine('Beri ulasan', link),
    ],
  }),
  refund_processed: (value) => ({
    subject: `Pengembalian dana ${value('booking_code')}`,
    lines: [
      `Halo ${value('name')},`,
      `Dana ${value('amount')} untuk pesanan ${value('booking_code')} sudah kami kembalikan.`,
    ],
  }),
  admin_new_paid_booking: (value, link) => ({
    subject: `Pesanan lunas ${value('booking_code')}`,
    lines: [
      `Pesanan ${value('booking_code')} sudah lunas: ${value('visit_date')}, ${value('pax')} orang.`,
      ...(value('institution') === '' ? [] : [`Instansi: ${value('institution')}.`]),
      ...(value('rw_name') === '' ? [] : [`Kunjungan ke ${value('rw_name')}.`]),
      ...(value('total') === '' ? [] : [`Total: ${value('total')}.`]),
      ...linkLine('Buka dasbor', link),
    ],
  }),
  admin_booking_needs_review: (value, link) => ({
    subject: `Pesanan ${value('booking_code')} perlu diperiksa`,
    lines: [
      `Pesanan ${value('booking_code')} (${value('visit_date')}) perlu diperiksa: ${value('reason')}.`,
      ...linkLine('Buka dasbor', link),
    ],
  }),
  security_alert: (value, link) => ({
    subject: `Peringatan keamanan ${value('severity')}: ${value('rule')}`,
    lines: [
      `Aturan ${value('rule')} terpicu pada ${value('time')}, tingkat ${value('severity')}.`,
      ...linkLine('Periksa di dasbor', link),
    ],
  }),
};

export function isStaffTemplate(template: NotificationTemplateName): boolean {
  return template.startsWith('admin_') || template === 'security_alert';
}

export interface MessageLines {
  subject: string;
  // The paragraphs in order, the sign-off included; a link stands on its own line after its label.
  lines: string[];
}

// The words of a message as paragraphs, for the plain-text body and the HTML layout of src/lib/email alike.
export function messageLines(message: OutgoingMessage): MessageLines {
  const value = (name: string) => message.bodyParams[name] ?? '';
  const { subject, lines } = MESSAGE_WORDS[message.template](value, message.link?.url ?? '');
  const hasSignOff = !isStaffTemplate(message.template) && message.template !== 'phone_otp';
  return { subject, lines: hasSignOff ? [...lines, SIGN_OFF] : lines };
}

export function messageText(message: OutgoingMessage): MessageText {
  const { subject, lines } = messageLines(message);
  return { subject, text: lines.join('\n\n') };
}
