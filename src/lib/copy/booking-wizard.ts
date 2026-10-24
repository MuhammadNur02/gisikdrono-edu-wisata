// The booking wizard /pesan/[packageSlug] (docs/PRD.md FR-BOOK-01…05, docs/StyleGuide.md §5.14), read through
// copy.booking.wizard in src/lib/copy/id.ts.
export const bookingWizardCopy = {
  title: (packageName: string) => `Pesan ${packageName}`,
  // The wizard's own header (DESIGN-SPEC §2.7): no site navigation, a way to help and a way out.
  header: {
    title: 'Pesan kunjungan',
    help: 'Butuh bantuan?',
    helpLabel: 'Butuh bantuan? Chat WhatsApp kelurahan',
    greeting: (packageName: string) =>
      `Halo, saya butuh bantuan memesan kunjungan ${packageName} di Gisikdrono.`,
    exit: 'Tutup pemesanan dan kembali ke halaman paket',
    back: 'Kembali ke halaman paket',
  },
  steps: {
    jadwal: 'Jadwal',
    data: 'Data',
    tambahan: 'Tambahan',
    ringkasan: 'Ringkasan',
  },
  stepOf: (number: number, total: number) => `Langkah ${String(number)} dari ${String(total)}`,
  stepsLabel: 'Langkah pemesanan',
  stepDone: 'selesai',
  stepCurrent: 'langkah ini',
  stepNeedsFix: 'perlu diperbaiki',
  back: 'Kembali',
  backTo: (stepLabel: string) => `Kembali ke ${stepLabel.toLowerCase()}`,
  backToPackage: 'Kembali ke paket',
  next: 'Lanjut',
  nextTo: (stepLabel: string) => `Lanjut ke ${stepLabel.toLowerCase()}`,
  // The order as it stands, beside the steps (DESIGN-SPEC §2.10 Wizard Summary).
  aside: {
    label: 'Ringkasan pemesanan',
    date: 'Tanggal',
    session: 'Sesi',
    pax: 'Peserta',
    addons: 'Tambahan',
    notChosen: 'Belum dipilih',
    noAddons: 'Belum ada',
    addonCount: (count: number) => `${String(count)} produk`,
    estimate: 'Perkiraan total',
    estimateLater: 'Dihitung di langkah Tambahan',
    note: 'Total pasti dihitung sistem di langkah Ringkasan.',
    trust: 'Kuota sesi belum dipegang sampai Anda menekan Konfirmasi & Bayar di langkah Ringkasan.',
  },
  closedTitle: 'Pemesanan sedang ditutup',
  closed:
    'Pemesanan online sedang ditutup sementara. Coba lagi nanti, atau hubungi kelurahan lewat WhatsApp.',
  unavailableChoice:
    'Pilihan Anda sudah tidak tersedia lagi: sesinya, paketnya, atau pesanan tambahannya berubah. Periksa lagi pilihan Anda, ya.',
  quoteNeedsWhatsApp:
    'Surat penawaran membutuhkan nomor WhatsApp yang sudah terverifikasi. Untuk sekarang, Anda bisa langsung Konfirmasi & Bayar, atau hubungi kelurahan, ya.',
  quoteForInstitutions:
    'Surat penawaran disediakan untuk sekolah, kampus, instansi, dan perusahaan. Untuk kunjungan pribadi, langsung pilih Konfirmasi & Bayar.',
  schedule: {
    title: 'Pilih tanggal dan sesi',
    description:
      'Sesi yang sisa kuotanya kurang dari jumlah peserta tidak bisa dipilih. Sisa kuota diperbarui otomatis.',
    paxLabel: 'Jumlah peserta',
    paxHint: (min: number, max: number) => `Paket ini untuk ${String(min)}–${String(max)} orang.`,
    dateLabel: 'Tanggal kunjungan',
    sessionLabel: (rwLabel: string) => `Sesi di ${rwLabel}`,
    sessionsOn: (date: string) => `Sesi pada ${date}`,
    legend: {
      open: 'Tersedia',
      busy: 'Hampir penuh',
      full: 'Penuh',
      closed: 'Tutup',
    },
    daySeats: (seats: number) => `${String(seats)} kursi`,
    pickDateFirst: 'Pilih tanggal dulu, lalu sesinya.',
    noSessions: 'Belum ada sesi yang bisa dipesan pada tanggal ini. Pilih tanggal lain, ya.',
    noDates:
      'Belum ada tanggal yang bisa dipesan untuk paket ini. Coba lagi nanti, atau hubungi kelurahan.',
    refreshed: 'Sisa kuota diperbarui otomatis.',
    stale: 'Sisa kuota belum bisa diperbarui, jadi angkanya mungkin sudah berubah.',
  },
  booker: {
    title: 'Data penanggung jawab rombongan',
    description:
      'Kami hanya menyimpan kontak penanggung jawab rombongan, untuk mengirim kode verifikasi, tiket, dan kabar reservasi.',
    identityTitle: 'Identitas rombongan',
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
    title: 'Rincian biaya',
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
    description:
      'Pastikan semuanya benar. Kuota sesi baru dipegang setelah Anda menekan Konfirmasi & Bayar.',
    visit: 'Jadwal',
    group: 'Rombongan',
    pax: (pax: number) => `${String(pax)} orang`,
    contact: 'Penanggung jawab',
    visitDate: 'Tanggal',
    paxLabel: 'Peserta',
    picName: 'Nama',
    phone: 'WhatsApp',
    email: 'Email',
    priceNote:
      'Dihitung oleh sistem dari harga yang berlaku hari ini. Jika harga berubah sebelum Anda membayar, ringkasan ini diperbarui.',
    payWith: 'Bayar dengan',
    // The methods Snap offers (CLAUDE.md §7.2 enabled_payments), named as a visitor knows them.
    payMethods: ['QRIS', 'VA BCA', 'VA BNI', 'VA BRI', 'VA Permata', 'VA CIMB', 'VA lainnya'],
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
    reverifyAsked:
      'Kontak ini perlu diverifikasi ulang sebelum pesanan dikirim, misalnya karena kodenya sudah kedaluwarsa atau kontak lain baru diverifikasi di tab lain. Minta kode baru, ya.',
    priceChanged:
      'Harga baru saja berubah, jadi ringkasan di atas sudah kami hitung ulang. Periksa totalnya, lalu kirim lagi.',
    payToConfirm:
      'Sesi ini sedang penuh oleh pesanan yang belum dibayar. Pilih sesi lain, atau coba lagi beberapa saat lagi.',
    resent:
      'Anda sudah punya pesanan yang belum dibayar untuk sesi ini. Tautannya sudah kami kirim ulang ke WhatsApp atau email Anda.',
    resentTitle: 'Pesanan Anda sudah ada',
    resentLookup: 'Tautannya belum sampai? Minta kirim ulang di Cari Reservasi.',
    otherSession: 'Pilih sesi lain',
    redirecting: 'Pesanan tercatat. Membuka halaman berikutnya…',
  },
};
