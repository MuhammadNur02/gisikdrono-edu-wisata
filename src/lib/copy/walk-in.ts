// The officer's booking at the counter (Task P4.3.10; docs/PRD.md §13.1 A9, A13): the form on /dashboard/bookings and
// the cash step after it. Indonesian, as every surface staff read (CLAUDE.md §4 no. 14).
export const walkInCopy = {
  open: 'Pemesanan di loket',
  title: 'Pemesanan di loket',
  description:
    'Untuk rombongan yang datang langsung atau dari luar negeri. Harga dan kuota dihitung sistem seperti pemesanan web.',
  package: 'Paket',
  packagePlaceholder: 'Pilih paket',
  noPackages: 'Belum ada paket tayang yang bisa Anda pesankan.',
  session: (rw: string) => `Sesi ${rw}`,
  sessionPlaceholder: 'Pilih sesi',
  noSessions: 'Tidak ada sesi terbuka yang bisa dipesan untuk RW ini.',
  sessionOption: (date: string, time: string, remaining: number) =>
    `${date}, ${time} · sisa ${String(remaining)} kursi`,
  pax: 'Jumlah peserta',
  bookerType: 'Jenis pemesan',
  institutionName: 'Nama lembaga',
  picName: 'Nama penanggung jawab',
  picPhone: 'Nomor telepon penanggung jawab',
  picPhoneHint: 'Nomor Indonesia (0812-…) atau nomor luar negeri dengan kode negara (+44 …).',
  picEmail: 'Email penanggung jawab',
  notes: 'Catatan',
  phoneConfirmed: 'Nomor sudah dicek dengan rombongan',
  phoneConfirmedHint:
    'Tiket dan pengingat dikirim lewat WhatsApp hanya ke nomor yang sudah Anda cek. Tanpa centang, rombongan menerima kabar lewat email saja.',
  cashOnTheSpot: 'Bayar tunai sekarang',
  cashOnTheSpotHint:
    'Catat uang tunai begitu pemesanan dibuat. Tanpa centang, penanggung jawab menerima tautan pembayaran; uang tunai masih bisa dicatat dari halaman pemesanan sampai pukul 23.59 WIB pada hari kunjungan.',
  phoneNotMobile:
    'Nomor ini bukan nomor seluler Indonesia, jadi WhatsApp mungkin tidak sampai. Pastikan email penanggung jawab benar.',
  consentAttested:
    'Penanggung jawab sudah membaca Pemberitahuan Privasi dan menyetujui data rombongan dicatat.',
  total: 'Total',
  quoteLoading: 'Menghitung harga…',
  quoteProblem: 'Jumlah peserta di luar batas paket ini.',
  submit: 'Buat pemesanan',
  created: (code: string) => `Pemesanan ${code} dibuat.`,
  cashTitle: (code: string) => `Terima tunai untuk ${code}`,
  cashDescription: (total: string) =>
    `Terima ${total} dari rombongan, lalu konfirmasi dengan kode authenticator. Tiket dikirim setelah tercatat.`,
  cashReference: 'Nomor kuitansi (opsional)',
  cashSubmit: 'Catat pembayaran tunai',
  cashRecorded: 'Pembayaran tunai tercatat. Tiket sedang dikirim.',
  cashLater: 'Bayar nanti (kirim tautan)',
  cashClose: 'Tutup',
  receiveCash: 'Terima tunai',
  linkSent: 'Tautan pembayaran dikirim ke penanggung jawab.',
  validation: {
    phone:
      'Tulis nomor Indonesia, misalnya 0812-3456-7890, atau nomor luar negeri dengan kode negara, misalnya +44 7700 900123.',
    consentAttested: 'Centang dulu bahwa penanggung jawab sudah menyetujui Pemberitahuan Privasi.',
    reference: 'Nomor kuitansi paling panjang 100 karakter.',
  },
  errors: {
    stateInvalid:
      'Sesi ini tidak bisa dipesan sekarang: sudah selesai, penuh, ditutup, atau waktu pembayarannya terlalu sedikit. Pilih sesi lain.',
    cashRefused:
      'Uang tunai tidak bisa dicatat sekarang: pemesanan sudah dibayar, sedang ditinjau, punya pembayaran lain yang terbuka, atau sudah lewat pukul 23.59 WIB hari kunjungan.',
    priceChanged: 'Harga paket berubah. Periksa lagi totalnya, lalu kirim ulang.',
  },
} as const;
