// The booking wizard /pesan/[packageSlug] (docs/PRD.md FR-BOOK-01…05, docs/StyleGuide.md §5.14), read through
// copy.booking.wizard in src/lib/copy/id.ts.
export const bookingWizardCopy = {
  title: (packageName: string) => `Pesan ${packageName}`,
  steps: {
    jadwal: 'Jadwal',
    data: 'Data Rombongan',
    tambahan: 'Tambahan',
    ringkasan: 'Ringkasan',
  },
  stepOf: (number: number, total: number, label: string) =>
    `Langkah ${String(number)}/${String(total)} · ${label}`,
  stepsLabel: 'Langkah pemesanan',
  stepDone: 'selesai',
  stepCurrent: 'langkah ini',
  stepNeedsFix: 'perlu diperbaiki',
  back: 'Kembali',
  next: 'Lanjut',
  closedTitle: 'Pemesanan sedang ditutup',
  closed:
    'Pemesanan online sedang ditutup sementara. Coba lagi nanti, atau hubungi kelurahan lewat WhatsApp.',
  unavailableChoice:
    'Pilihan Anda sudah tidak tersedia lagi: sesinya, paketnya, atau pesanan tambahannya berubah. Periksa lagi pilihan Anda, ya.',
  quoteForInstitutions:
    'Surat penawaran disediakan untuk sekolah, kampus, instansi, dan perusahaan. Untuk kunjungan pribadi, langsung pilih Konfirmasi & Bayar.',
  schedule: {
    title: 'Pilih tanggal dan sesi',
    paxLabel: 'Jumlah peserta',
    paxHint: (min: number, max: number) => `Paket ini untuk ${String(min)}–${String(max)} orang.`,
    dateLabel: 'Tanggal kunjungan',
    sessionLabel: (rwLabel: string) => `Sesi di ${rwLabel}`,
    pickDateFirst: 'Pilih tanggal dulu, lalu sesinya.',
    noSessions: 'Belum ada sesi yang bisa dipesan pada tanggal ini. Pilih tanggal lain, ya.',
    noDates:
      'Belum ada tanggal yang bisa dipesan untuk paket ini. Coba lagi nanti, atau hubungi kelurahan.',
    refreshed: 'Sisa kuota diperbarui otomatis.',
  },
  booker: {
    title: 'Data penanggung jawab rombongan',
    bookerTypeLabel: 'Jenis rombongan',
    bookerTypes: {
      individual: 'Pribadi atau keluarga',
      school: 'Sekolah',
      university: 'Kampus',
      government: 'Instansi pemerintah',
      company: 'Perusahaan',
      community: 'Komunitas',
      other: 'Lainnya',
    },
    institutionLabel: 'Nama sekolah, kampus, kantor, atau komunitas',
    picNameLabel: 'Nama penanggung jawab',
    picEmailLabel: 'Email penanggung jawab',
    picEmailHint: 'Bukti pemesanan dan tautan reservasi juga dikirim ke email ini.',
    picEmailFromProof: 'Email ini sudah diverifikasi dengan kode.',
    notesLabel: 'Catatan untuk pengelola (tidak wajib)',
    participantsTitle: 'Daftar peserta (tidak wajib)',
    participantsHint:
      'Nama dipakai untuk sertifikat dan daftar hadir, lalu dihapus 90 hari setelah kunjungan. Cukup nama dan kelas atau kelompok.',
    guardianConsent:
      'Saya menyatakan telah memperoleh persetujuan orang tua/wali untuk mencantumkan nama peserta',
    verifyTitle: 'Verifikasi nomor WhatsApp',
    verifyHint:
      'Kami kirim kode 6 angka lewat WhatsApp. Kuota sesi baru dipegang setelah nomor terverifikasi.',
    verifyFirst: 'Verifikasi nomor WhatsApp dulu sebelum lanjut, ya.',
  },
  addons: {
    title: 'Pesanan tambahan (tidak wajib)',
    description: 'Camilan dan oleh-oleh dari UMKM setempat, disiapkan untuk hari kunjungan Anda.',
    empty: 'Paket ini belum punya pesanan tambahan.',
    vendor: (vendorName: string) => `Dari ${vendorName}`,
    price: (price: string, unitLabel: string) => `${price} / ${unitLabel}`,
    leadTime: (days: number) => `Pesan paling lambat ${String(days)} hari sebelum kunjungan.`,
    quantityLabel: (productName: string) => `Jumlah ${productName}`,
    quantityRange: (min: number, max: number | null) =>
      max === null ? `Paling sedikit ${String(min)}.` : `Antara ${String(min)} dan ${String(max)}.`,
    add: 'Tambah',
    remove: (productName: string) => `Hapus ${productName}`,
  },
  quote: {
    title: 'Ringkasan biaya',
    perPax: (price: string, quantity: number) => `${price} × ${String(quantity)} orang`,
    flatGroup: 'Harga per rombongan',
    addonLine: (price: string, quantity: number, unitLabel: string) =>
      `${price} × ${String(quantity)} ${unitLabel}`,
    total: 'Total',
    totalShort: (total: string) => `Total ${total}`,
    loading: 'Menghitung biaya…',
    paxOutOfRange: (min: number, max: number) =>
      `Paket ini untuk ${String(min)}–${String(max)} orang. Ubah jumlah peserta di langkah Jadwal, ya.`,
    addonUnavailable:
      'Salah satu pesanan tambahan sudah tidak dijual. Hapus dari daftar, lalu lanjutkan.',
    addonQuantity:
      'Jumlah salah satu pesanan tambahan di luar batas penjualnya. Ubah jumlahnya, ya.',
    failed: 'Biaya belum bisa dihitung. Coba lagi sebentar lagi, ya.',
  },
  summary: {
    title: 'Ringkasan pesanan',
    visit: 'Kunjungan',
    group: 'Rombongan',
    pax: (pax: number) => `${String(pax)} orang`,
    contact: 'Kontak',
    edit: 'Ubah',
    privacy: 'Saya telah membaca',
    privacyLink: 'Pemberitahuan Privasi',
    pay: 'Konfirmasi & Bayar',
    payHint:
      'Kuota sesi dipegang untuk Anda sampai batas waktu pembayaran, lalu kami arahkan ke halaman pembayaran.',
    quote: 'Minta Surat Penawaran',
    quoteHint:
      'Untuk bendahara yang membayar lewat persetujuan lembaga. Surat penawaran tidak memegang kuota sesi.',
    reverifyTitle: 'Verifikasi ulang nomor WhatsApp',
    reverify:
      'Verifikasi nomor sudah lebih dari 8 menit yang lalu. Minta kode baru untuk nomor yang sama sebelum mengirim pesanan, ya.',
    priceChanged:
      'Harga baru saja berubah, jadi ringkasan di atas sudah kami hitung ulang. Periksa totalnya, lalu kirim lagi.',
    payToConfirm:
      'Sesi ini sedang penuh oleh pesanan yang belum dibayar. Pilih sesi lain, atau coba lagi beberapa saat lagi.',
    resent:
      'Anda sudah punya pesanan yang belum dibayar untuk sesi ini. Tautannya sudah kami kirim ulang ke WhatsApp atau email Anda.',
    otherSession: 'Pilih sesi lain',
    redirecting: 'Pesanan tercatat. Membuka halaman berikutnya…',
  },
};
