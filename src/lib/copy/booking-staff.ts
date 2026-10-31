import {
  HOLD_EXTENSION_LIMITS,
  type REVIEW_RESOLUTIONS,
  type RESENDABLE_TEMPLATES,
  type STAFF_CANCEL_CATEGORIES,
} from '@/config/bookings';

// The staff steps of /dashboard/bookings/[id] (Task P4.3.08; docs/PRD.md §13.1 A28). Indonesian, as every surface
// staff read (CLAUDE.md §4 no. 14).

type CancelCategory = (typeof STAFF_CANCEL_CATEGORIES)[number];
type Resolution = (typeof REVIEW_RESOLUTIONS)[number];
type ResendTemplate = (typeof RESENDABLE_TEMPLATES)[number];

export const bookingStaffCopy = {
  title: 'Tindakan petugas',
  description: 'Setiap tindakan tercatat di riwayat pemesanan dan log audit.',
  cancel: {
    open: 'Batalkan pemesanan',
    title: (code: string) => `Batalkan ${code}`,
    category: 'Alasan pembatalan',
    categories: {
      guest_request: 'Atas permintaan tamu (refund sesuai ketentuan kunjungan)',
      kelurahan:
        'Dari pihak kelurahan/RW: penutupan, cuaca di luar ketentuan, atau kesalahan petugas (refund penuh)',
    } satisfies Record<CancelCategory, string>,
    reason: 'Catatan alasan',
    previewLoading: 'Menghitung pengembalian dana…',
    refundNone: 'Pemesanan ini belum dibayar, jadi tidak ada dana yang dikembalikan.',
    refundOf: (amount: string, pct: number | null) =>
      pct === null
        ? `Dana yang dikembalikan: ${amount}.`
        : `Dana yang dikembalikan: ${amount} (${String(pct)}%).`,
    submit: 'Batalkan pemesanan',
    done: 'Pemesanan dibatalkan.',
  },
  extend: {
    open: 'Perpanjang batas bayar',
    title: 'Perpanjang batas pembayaran',
    field: 'Batas pembayaran baru (WIB)',
    hint: `Harus lebih lambat dari batas sekarang, dan paling lama ${String(HOLD_EXTENSION_LIMITS.maxDays)} hari dari sekarang. Pemesanan dari web: paling lambat ${String(HOLD_EXTENSION_LIMITS.webMarginHours)} jam sebelum sesi pertama dimulai. Pemesanan petugas untuk satu RW: sampai pukul 23.59 WIB pada hari kunjungan; paket gabungan: sebelum sesi pertama dimulai. Tidak bisa selama penanggung jawab masih membuka tautan pembayaran.`,
    submit: 'Perpanjang',
    done: 'Batas pembayaran diperpanjang.',
  },
  reactivate: {
    open: 'Aktifkan lagi',
    description:
      'Pemesanan yang kedaluwarsa ditahan lagi bila kursinya masih ada, dan penanggung jawab menerima tautan pembayaran baru.',
    submit: 'Aktifkan lagi pemesanan',
    done: 'Pemesanan aktif lagi dan tautan pembayaran dikirim.',
  },
  resend: {
    open: 'Kirim pesan',
    title: 'Kirim pesan ke penanggung jawab',
    template: 'Pesan',
    channel: 'Saluran',
    channelHint:
      'Hanya saluran yang bisa menjangkau penanggung jawab yang ditampilkan: WhatsApp perlu nomor yang sudah terverifikasi.',
    channels: { whatsapp: 'WhatsApp', email: 'Email' },
    lastQueued: (channel: string, when: string) => `${channel} (terakhir ${when})`,
    firstSend: (channel: string) => `${channel} (belum pernah dikirim)`,
    emptyTitle: 'Belum ada pesan yang bisa dikirim',
    emptyHint:
      'Pesan hanya bisa dikirim ulang bila sudah pernah dikirim dan masih sesuai dengan status pemesanannya. Pengingat pembayaran bisa dikirim pertama kali untuk pemesanan rombongan (sekolah, kampus, instansi, perusahaan) atau pemesanan petugas yang menunggu pembayaran, sebelum batas bayarnya lewat; untuk pemesanan petugas, setelah tautan pembayaran terkirim dan sebelum sesi pertamanya dimulai.',
    templates: {
      booking_created: 'Tautan pembayaran',
      payment_reminder: 'Pengingat pembayaran',
      payment_received_ticket: 'Tiket',
      booking_cancelled: 'Pemberitahuan pembatalan',
      visit_reminder_d1: 'Pengingat H-1',
      certificate_ready: 'Sertifikat',
      refund_processed: 'Pengembalian dana',
    } satisfies Record<ResendTemplate, string>,
    submit: 'Kirim',
    done: 'Pesan masuk antrean pengiriman.',
  },
  review: {
    open: 'Selesaikan tinjauan',
    title: (code: string) => `Selesaikan tinjauan ${code}`,
    description:
      'Pemesanan ini dibayar setelah waktu tahannya habis, dan kursi sesinya sudah terisi rombongan lain. Pindahkan ke sesi lain atau kembalikan seluruh dananya; tamu tidak bersalah, jadi ketentuan refund tidak berlaku.',
    resolution: 'Penyelesaian',
    resolutions: {
      move: 'Pindahkan ke sesi lain (dana tetap)',
      refund: 'Kembalikan seluruh dana',
    } satisfies Record<Resolution, string>,
    session: (rw: string) => `Sesi baru ${rw}`,
    sessionPlaceholder: 'Pilih sesi',
    noSessions: 'Tidak ada sesi terbuka untuk RW ini.',
    reason: 'Catatan alasan',
    submit: 'Selesaikan',
    done: 'Tinjauan diselesaikan.',
  },
  close: 'Tutup',
  validation: {
    reason: (min: number) => `Tulis alasan paling sedikit ${String(min)} karakter.`,
    sessions: 'Pilih satu sesi baru untuk setiap RW.',
    category: 'Pilih alasan pembatalan.',
    expiresAt: 'Pilih tanggal dan jam batas pembayaran.',
  },
  errors: {
    stateInvalid:
      'Pemesanan ini tidak bisa diubah dengan cara ini sekarang. Muat ulang halaman untuk melihat statusnya.',
    priceChanged: 'Jumlah pengembalian dana berubah. Periksa lagi angkanya, lalu kirim ulang.',
    quotaUnavailable: 'Kursi sesi yang dipilih sudah habis. Pilih sesi lain.',
    notSent:
      'Pesan tidak bisa dikirim sekarang: salurannya sedang dimatikan, nomor WhatsApp penanggung jawab belum terverifikasi, atau batas email harian sebelum pembayaran sudah tercapai. Coba saluran lain, atau coba lagi besok.',
    neverSent: 'Pesan ini belum pernah dikirim untuk pemesanan ini, jadi belum bisa dikirim ulang.',
    payLinkNotSent:
      'Tautan pembayaran belum terkirim ke penanggung jawab. Kirim dulu pesan "Tautan pembayaran", lalu kirim pengingatnya setelah pesan itu terkirim.',
    reminderDayUnknown:
      'Pengingat H-1 terakhir pemesanan ini tidak mencatat tanggal kunjungannya, jadi tidak bisa dikirim ulang. Pengingat berikutnya dikirim otomatis sehari sebelum kunjungan.',
    qrKeyUnknown:
      'Kunci tanda tangan tiket belum terdaftar, jadi tiket tidak bisa dibuat. Hubungi pengelola sistem.',
    ledgerMissing:
      'Pembayaran pemesanan ini belum masuk pembagian hasil, jadi tinjauannya belum bisa diselesaikan. Periksa aturan bagi hasil paketnya, lalu coba lagi.',
    holdOpenPayment:
      'Penanggung jawab sedang membuka tautan pembayaran. Perpanjang setelah tautan itu kedaluwarsa.',
  },
} as const;
