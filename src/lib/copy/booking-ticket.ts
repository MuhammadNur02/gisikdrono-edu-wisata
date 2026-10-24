// /reservasi/[bookingCode]/tiket and /v/[token] (docs/PRD.md FR-BOOK-13, FR-PUB-21; Task P3.10.02, P3.10.03), read
// through copy.booking.ticket. The landing says valid or not, and nothing about the booking or its check-in.
export const bookingTicketCopy = {
  title: 'Tiket kunjungan',
  description: 'Tunjukkan kode QR ini kepada petugas di gerbang RW pada hari kunjungan.',
  ticketOf: (rwName: string) => `Tiket ${rwName}`,
  qrLabel: (rwName: string) => `Kode QR tiket ${rwName}`,
  code: 'Kode tiket',
  visitDate: 'Tanggal kunjungan',
  session: 'Sesi',
  pax: 'Jumlah peserta',
  paxCount: (count: number) => `${String(count)} orang`,
  brightness: 'Naikkan kecerahan layar saat pemindaian.',
  noQr: 'Kode QR tiket ini tidak lagi bisa ditampilkan. Hubungi kelurahan lewat WhatsApp, ya.',
  expired: 'Tanggal kunjungan tiket ini sudah lewat.',
  none: 'Tiket muncul di sini setelah pembayaran diterima.',
  landing: {
    title: 'Pemeriksaan tiket',
    valid: 'Tiket valid',
    validFor: (rwName: string, visitDate: string) => `Untuk ${rwName}, ${visitDate}.`,
    invalid: 'Tiket tidak valid',
    invalidHint: 'Kode QR ini tidak dikenali sebagai tiket Edu Wisata Gisikdrono yang berlaku.',
    rateLimited: 'Terlalu banyak pemeriksaan dari jaringan Anda. Coba lagi beberapa saat lagi, ya.',
  },
};
