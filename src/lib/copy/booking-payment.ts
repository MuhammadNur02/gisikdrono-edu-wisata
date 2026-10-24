// /reservasi/[bookingCode]/bayar (docs/PRD.md FR-BOOK-10, Task P3.7.04), read through copy.booking.payment. Payment is
// only through the system, by QRIS or a Virtual Account (docs/StyleGuide.md §1, P1).

const MINUTES_PER_HOUR = 60;

export const bookingPaymentCopy = {
  title: 'Pembayaran',
  bookingOf: (bookingCode: string) => `Reservasi ${bookingCode}`,
  // The methods card of DESIGN-SPEC §3.12; the visitor picks one on Midtrans' page.
  methods: {
    title: 'Metode yang tersedia',
    qris: 'QRIS',
    qrisHint: 'Pindai dengan aplikasi m-banking atau dompet digital apa pun.',
    virtualAccount: 'Virtual Account',
    virtualAccountHint: 'Bayar dari ATM, m-banking, atau internet banking.',
    banks: ['BCA', 'BNI', 'BRI', 'Permata', 'CIMB', 'Bank lain'],
    secure:
      'Anda memilih metode di halaman pembayaran Midtrans yang aman. Kami tidak menyimpan data akun bank Anda.',
  },
  amountDue: 'Jumlah yang harus dibayar',
  copy: 'Salin',
  copied: 'Disalin',
  copyLabel: (what: string) => `Salin ${what.toLowerCase()}`,
  paxCount: (count: number) => `${String(count)} orang`,
  total: 'Total pembayaran',
  countdown: {
    label: 'Sisa waktu pembayaran',
    // What a screen reader hears, once a minute rather than every second.
    spoken: (minutes: number) =>
      minutes >= MINUTES_PER_HOUR
        ? `Sisa waktu pembayaran ${String(Math.floor(minutes / MINUTES_PER_HOUR))} jam ${String(minutes % MINUTES_PER_HOUR)} menit`
        : `Sisa waktu pembayaran ${String(minutes)} menit`,
    over: 'Waktu pembayaran sudah habis.',
  },
  pay: 'Bayar sekarang',
  continuePay: 'Lanjutkan pembayaran',
  payHint:
    'Anda akan dibawa ke halaman pembayaran Midtrans untuk memilih QRIS atau Virtual Account.',
  redirecting: 'Membuka halaman pembayaran…',
  pending: {
    title: 'Menunggu pembayaran',
    virtualAccount: (bank: string) => `Transfer ke Virtual Account ${bank}`,
    vaNumber: 'Nomor Virtual Account',
    qris: 'Pindai kode QRIS di halaman pembayaran dengan aplikasi bank atau dompet digital Anda.',
    afterPaying:
      'Setelah Anda membayar, status pesanan diperbarui otomatis. Tiket dan bukti pembayaran dikirim ke WhatsApp dan email Anda.',
  },
  banks: {
    bca: 'BCA',
    bni: 'BNI',
    bri: 'BRI',
    permata: 'Permata',
    cimb: 'CIMB Niaga',
  } as Record<string, string>,
  otherBank: 'bank pilihan Anda',
  paid: 'Pembayaran sudah kami terima. Tiket dan bukti pembayaran dikirim ke WhatsApp dan email Anda.',
  seeTickets: 'Lihat tiket',
  underReview:
    'Pembayaran pesanan ini sedang diperiksa petugas kelurahan. Kami akan menghubungi Anda lewat WhatsApp.',
  expired:
    'Waktu pembayaran pesanan ini sudah habis. Hubungi kelurahan lewat WhatsApp jika ingin melanjutkan pesanan.',
  notAwaitingPayment: 'Pesanan ini sedang tidak menunggu pembayaran.',
  errors: {
    preparing: 'Halaman pembayaran sedang disiapkan. Coba lagi beberapa detik lagi, ya.',
    tooLate:
      'Sisa waktu pembayaran kurang dari 5 menit, jadi halaman pembayaran baru tidak bisa dibuat. Hubungi kelurahan lewat WhatsApp, ya.',
  },
};
