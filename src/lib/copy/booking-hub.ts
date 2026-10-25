// The status hub /reservasi/[bookingCode] (docs/PRD.md FR-BOOK-11, FR-BOOK-17, FR-BOOK-23..25; DESIGN-SPEC §3.11).
// Kept out of copy.booking in src/lib/copy/id.ts, which every dashboard island ships, and imported only by the hub's
// own components and actions (first-load budget, docs/StyleGuide.md §10.1).
import type { EnumValue } from '@/db/enums';

type BookingStatus = EnumValue<'booking_status'>;

export const bookingHubCopy = {
  title: 'Status reservasi',
  manageTitle: 'Kelola reservasi',
  reservation: (bookingCode: string) => `Reservasi ${bookingCode}`,
  copy: 'Salin',
  copied: 'Disalin',
  copyFailed: 'Gagal menyalin. Salin manual, ya.',
  codeWhat: 'kode reservasi',
  status: {
    quoted: 'Penawaran dikirim',
    pending_payment: 'Menunggu pembayaran',
    paid: 'Lunas',
    checked_in: 'Sudah hadir',
    completed: 'Selesai',
    no_show: 'Tidak hadir',
    expired: 'Kedaluwarsa',
    cancelled: 'Dibatalkan',
    refunded: 'Dana dikembalikan',
  } satisfies Record<BookingStatus, string>,
  needsReview: 'Perlu ditinjau',
  headline: {
    quoted: 'Surat penawaran sudah terbit',
    pending_payment: 'Selesaikan pembayaran sebelum waktu habis',
    paid: 'Pembayaran diterima. Sampai jumpa di hari kunjungan',
    checked_in: 'Rombongan sudah hadir. Selamat belajar!',
    completed: 'Kunjungan selesai. Terima kasih!',
    no_show: 'Rombongan tidak hadir pada hari kunjungan',
    expired: 'Waktu pembayaran sudah habis',
    cancelled: 'Reservasi ini dibatalkan',
    refunded: 'Dana reservasi ini sudah dikembalikan',
  } satisfies Record<BookingStatus, string>,
  lead: {
    quoted:
      'Ajukan surat penawaran ke bendahara. Kuota sesi belum dipegang sampai Anda menekan Konfirmasi & Bayar.',
    pending_payment:
      'Kuota sesi dipegang sampai batas bayar. Bayar lewat QRIS atau Virtual Account di halaman pembayaran Midtrans.',
    paid: 'Tiket rombongan sudah terbit dan dikirim ke WhatsApp dan email penanggung jawab.',
    checked_in: 'E-sertifikat terbit setelah semua gerbang kunjungan dilewati.',
    completed: 'Undangan ulasan dikirim lewat WhatsApp. Pendapat Anda membantu kampung kami.',
    no_show: 'Hubungi kelurahan lewat WhatsApp bila ada yang perlu dibicarakan.',
    expired:
      'Kuota sesi sudah dilepas. Hubungi kelurahan lewat WhatsApp bila ingin melanjutkan reservasi ini.',
    cancelled: 'Tiket dicabut dan kuota sesi sudah dilepas.',
    refunded: 'Bukti pengembalian dana dikirim ke WhatsApp dan email penanggung jawab.',
  } satisfies Record<BookingStatus, string>,
  underReview:
    'Pembayaran reservasi ini sedang diperiksa petugas kelurahan. Kami akan menghubungi Anda lewat WhatsApp.',
  countdown: {
    deadline: 'Batas bayar',
    releases: 'Lewat dari itu, kursi dilepas otomatis.',
    hours: 'jam',
    minutes: 'menit',
    seconds: 'detik',
    over: 'Waktu pembayaran sudah habis.',
    // What a screen reader hears, once a minute rather than every second.
    spokenPrefix: 'Sisa waktu pembayaran',
  },
  payment: {
    method: 'Metode (dipilih di Midtrans)',
    virtualAccount: (bank: string) => `Virtual Account ${bank}`,
    qris: 'QRIS',
    notChosen: 'Belum dipilih',
    vaNumber: 'Nomor Virtual Account',
    amount: 'Jumlah yang harus dibayar',
    polling: 'Menunggu konfirmasi dari bank. Halaman ini diperbarui otomatis.',
    pay: 'Bayar sekarang',
    continuePay: 'Lanjutkan pembayaran',
    changeMethod: 'Ganti metode pembayaran',
  },
  instructions: {
    title: 'Cara bayar',
    virtualAccount: [
      'Buka aplikasi m-banking, internet banking, atau ATM bank Anda.',
      'Pilih transfer ke Virtual Account, lalu masukkan nomor di atas.',
      'Periksa nama tagihan dan jumlahnya, lalu konfirmasi.',
    ],
    qris: [
      'Buka halaman pembayaran Midtrans lewat tombol Lanjutkan pembayaran.',
      'Pindai kode QRIS dengan aplikasi m-banking atau dompet digital apa pun.',
      'Periksa jumlahnya, lalu konfirmasi di aplikasi Anda.',
    ],
  },
  treasurer: {
    title: 'Yang membayar bendahara?',
    body: 'Kirim tautan pembayaran ini. Berlaku 24 jam dan hanya untuk reservasi ini.',
    linkLabel: 'Tautan pembayaran',
    what: 'tautan pembayaran',
    send: 'Kirim lewat WhatsApp',
    message: (url: string) =>
      `Tautan pembayaran reservasi kunjungan Edu Wisata Gisikdrono (berlaku 24 jam): ${url}`,
  },
  details: {
    date: 'Tanggal',
    session: 'Sesi',
    pax: 'Peserta',
    paxCount: (count: number) => `${String(count)} orang`,
    group: 'Rombongan',
    pic: 'Penanggung jawab',
    addons: 'Tambahan',
    noAddons: 'Tidak ada',
    total: 'Total',
  },
  documents: {
    title: 'Dokumen',
    quotation: 'Surat Penawaran',
    quotationValid: (date: string) => `Berlaku sampai ${date}`,
    invoice: 'Invoice',
    receipt: 'Kwitansi',
    afterPaid: 'Terbit setelah lunas',
    tickets: 'Tiket QR',
    seeTickets: 'Lihat tiket',
    pdf: 'PDF',
  },
  timeline: {
    title: 'Perjalanan reservasi',
    created: 'Reservasi dibuat',
    quoted: 'Surat penawaran terbit',
    pending: 'Menunggu pembayaran',
    pendingUntil: (deadline: string) => `Kursi ditahan sampai ${deadline}`,
    paid: 'Lunas dan tiket QR terbit',
    paidHint: 'Tiket dikirim ke WhatsApp dan email',
    visit: 'Hari kunjungan',
    certificate: 'E-sertifikat',
    certificateHint: 'Terbit setelah rombongan hadir',
    cancelled: 'Dibatalkan',
    expired: 'Kedaluwarsa',
    refunded: 'Dana dikembalikan',
    noShow: 'Tidak hadir',
    rescheduled: 'Jadwal dipindah karena cuaca',
    done: 'selesai',
    current: 'saat ini',
  },
  help: {
    title: 'Ada kendala?',
    body: 'Tanyakan kepada petugas kelurahan lewat WhatsApp.',
    chat: 'Chat WhatsApp',
    greeting: (bookingCode: string) =>
      `Halo, saya ingin bertanya tentang reservasi ${bookingCode}.`,
  },
  terms: {
    title: 'Syarat kunjungan',
    refundLine: (minDays: number, pct: number) =>
      minDays === 0
        ? `Hari kunjungan: ${String(pct)} % paket dikembalikan`
        : `H-${String(minDays)} atau lebih awal: ${String(pct)} % paket dikembalikan`,
    addons: 'Produk tambahan dikembalikan penuh bila reservasi dibatalkan.',
    weather: (max: number, hours: number) =>
      `Bila kunjungan terhalang cuaca, dalam ${String(hours)} jam setelah pemberitahuan rombongan boleh pindah jadwal paling banyak ${String(max)} kali atau meminta pengembalian dana dikurangi biaya Midtrans, juga setelah pindah. Bila tidak ada pilihan dalam ${String(hours)} jam, dana dikembalikan otomatis. Pada paket gabungan, hanya kunjungan di RW yang terhalang yang pindah.`,
  },
  cancel: {
    open: 'Batalkan reservasi',
    unpaidHint: 'Kursi dilepas dan tautan pembayaran tidak berlaku lagi.',
    paidHint: 'Tiket dicabut dan kursi dilepas. Dana dikembalikan sesuai syarat kunjungan.',
    dialogTitle: 'Batalkan reservasi ini?',
    unpaidBody:
      'Kuota sesi akan dilepas dan tautan pembayaran tidak berlaku lagi. Tindakan ini tidak bisa diurungkan.',
    paidBody: (refund: string) =>
      `Tiket akan dicabut dan kuota sesi dilepas. Dana yang dikembalikan: ${refund}. Tindakan ini tidak bisa diurungkan.`,
    paidNothing:
      'Tiket akan dicabut dan kuota sesi dilepas. Menurut syarat kunjungan, tidak ada dana yang dikembalikan. Tindakan ini tidak bisa diurungkan.',
    breakdown: (packagePart: string, pct: number, addons: string) =>
      `${String(pct)} % paket (${packagePart}) dan produk tambahan (${addons}).`,
    confirm: 'Ya, batalkan',
    keep: 'Tidak jadi',
    changed:
      'Jumlah pengembalian dana sudah berubah sejak halaman ini dibuka. Periksa angka terbaru di atas, lalu konfirmasi lagi.',
    defaultReason: 'Dibatalkan penanggung jawab lewat halaman reservasi',
  },
  refund: {
    requested: (amount: string) =>
      `Pengembalian dana ${amount} sedang diproses. Kami mengabari Anda lewat WhatsApp begitu dana dikirim.`,
    recorded: (amount: string) => `Pengembalian dana ${amount} sudah dikirim.`,
    manual:
      'Pembayaran lewat Virtual Account dikembalikan lewat transfer oleh bendahara kelurahan.',
  },
  weather: {
    title: 'Kunjungan terhalang cuaca',
    body: (until: string) =>
      `Kelurahan mengabarkan sesi Anda terhalang cuaca. Sampai ${until}, pindah jadwal atau minta pengembalian dana. Bila tidak ada pilihan sampai saat itu, dana dikembalikan otomatis dikurangi biaya Midtrans.`,
    movesLeft: (rwName: string, count: number) =>
      `Jadwal di ${rwName} bisa dipindah ${String(count)} kali lagi.`,
    noMovesLeft: (rwName: string) =>
      `Jadwal di ${rwName} sudah mencapai batas pindah karena cuaca. Pengembalian dana masih bisa diminta.`,
    pickDay: 'Pilih tanggal baru',
    pickSession: (rwName: string) => `Sesi di ${rwName}`,
    noOptions:
      'Belum ada sesi lain yang cukup untuk rombongan Anda. Hubungi kelurahan lewat WhatsApp, ya.',
    move: 'Pindah ke jadwal ini',
    moved: 'Jadwal sudah dipindah. Tiket mengikuti tanggal baru.',
    refundTitle: 'Atau minta pengembalian dana',
    refundBody: (amount: string, fee: string) =>
      `Dana yang dikembalikan ${amount}, setelah dikurangi biaya Midtrans ${fee}.`,
    refundUnavailable:
      'Pengembalian dana karena cuaca belum bisa dihitung. Hubungi kelurahan lewat WhatsApp, ya.',
    refund: 'Minta pengembalian dana',
    refundConfirmTitle: 'Batalkan dan minta pengembalian dana?',
  },
  quoted: {
    title: 'Konfirmasi & Bayar',
    body: 'Masukkan nomor WhatsApp yang dipakai saat memesan, verifikasi kodenya, lalu lanjut ke pembayaran.',
    confirm: 'Konfirmasi & Bayar',
    redirecting: 'Membuka halaman pembayaran…',
    wrongPhone:
      'Nomor ini belum terverifikasi atau bukan nomor WhatsApp pemesan. Gunakan nomor yang dipakai saat memesan, lalu verifikasi kodenya.',
  },
  paid: {
    visitTitle: 'Saat hari kunjungan',
    visit: [
      'Tunjukkan tiket QR kepada petugas di gerbang RW.',
      'Satu tiket berlaku untuk seluruh rombongan pada sesi ini.',
    ],
  },
  links: {
    certificate: 'E-sertifikat terbit setelah rombongan hadir dan dikirim lewat WhatsApp.',
    review: 'Undangan ulasan dikirim lewat WhatsApp setelah kunjungan.',
  },
  revoke: {
    open: 'Cabut semua tautan',
    title: 'Cabut semua tautan reservasi ini?',
    confirm: 'Ya, cabut',
    keep: 'Tidak jadi',
    hint: 'Semua tautan reservasi ini berhenti bekerja, termasuk di peramban ini. Tautan baru bisa diminta di Cari reservasi.',
  },
};

// The hub's error boundary is a client component, so it takes only these lines, not the whole hub copy.
export const bookingHubErrorCopy = {
  title: 'Status reservasi belum bisa dimuat',
  body: 'Koneksi atau server sedang bermasalah. Coba muat ulang sebentar lagi.',
  retry: 'Coba lagi',
  find: 'Cari reservasi',
};

export const bookingHubLoadingCopy = 'Memuat status reservasi…';
