// The words of the public catalogue and content pages (DESIGN-SPEC §3.4–§3.8, §3.14), given verbatim by the design.
// Server components read them here; the client islands read src/lib/copy/catalogue-ui.ts.

export const packagesPageCopy = {
  title: 'Pilih paket kunjunganmu',
  lead: 'Setiap paket punya durasi, isi kegiatan, dan harga per orang yang jelas. Pilih kampungnya, lalu sesuaikan dengan jenis rombonganmu.',
  summaryLabel: 'Ringkasan paket',
  summaryPackages: 'paket',
  summaryKampung: 'kampung',
  summaryFromPrice: 'harga mulai / orang',
  filterRw: 'Kampung',
  filterRwAll: 'Semua kampung',
  filterType: 'Jenis rombongan',
  filterTypeAll: 'Semua jenis',
  noun: 'paket',
  sortCheapest: 'Harga terendah',
  sortDearest: 'Harga tertinggi',
  sortShortest: 'Durasi terpendek',
  institutionTitle: 'Sekolah, kampus, atau instansi?',
  institutionBody:
    'Di langkah Ringkasan, minta Surat Penawaran resmi untuk diajukan ke bendahara. Kuota baru dikunci saat kamu mengonfirmasi dan membayar.',
  institutionCta: 'Baca cara memesan',
  stepsEyebrow: 'Cara memesan',
  stepsTitle: 'Empat langkah, tanpa membuat akun',
  steps: [
    { title: 'Pilih jadwal', body: 'Tanggal dan sesi dengan sisa kursi yang terlihat langsung.' },
    {
      title: 'Isi data & verifikasi',
      body: 'Data penanggung jawab rombongan, lalu kode OTP lewat WhatsApp.',
    },
    { title: 'Tambahan (opsional)', body: 'Pesan produk UMKM untuk diambil saat kunjungan.' },
    {
      title: 'Bayar & terima tiket',
      body: 'QRIS atau Virtual Account. Tiket QR dikirim ke WhatsApp dan email.',
    },
  ],
  emptyFilteredTitle: 'Belum ada paket untuk pilihan ini',
  emptyFilteredBody: 'Hapus salah satu filter, atau tanyakan paket khusus lewat WhatsApp.',
  // `{rw}` and `{type}` are the chosen options' names (src/lib/utils/catalogue-browse.ts).
  emptyChoice: '{rw} belum punya paket khusus {type}.',
  emptyAsk: 'Tanya paket khusus',
  emptyAllTitle: 'Paket kunjungan sedang disiapkan',
  emptyAllBody:
    'Pengelola sedang menyiapkan paket untuk rombongan. Tanyakan jadwal dan paket khusus lewat WhatsApp.',
  whatsAppTopic: 'paket kunjungan edukasi',
};

export const packageDetailCopy = {
  share: 'Bagikan',
  downloadProposal: 'Unduh proposal',
  about: 'Tentang paket',
  highlights: 'Yang dilakukan',
  included: 'Yang termasuk',
  includedLabel: 'Termasuk',
  itinerary: (minutes: number | null) =>
    minutes === null ? 'Alur kegiatan' : `Alur kegiatan · ${String(minutes)} menit`,
  itineraryNote: 'Urutan di lapangan mengikuti arahan warga.',
  prices: { orang: 'Harga per orang', rombongan: 'Harga per rombongan' },
  pricesNote: 'Total dihitung sistem dari jumlah peserta dan produk tambahan.',
  priceColumns: {
    who: 'Jenis peserta',
    minimum: 'Peserta',
    orang: 'Harga / orang',
    rombongan: 'Harga / rombongan',
  },
  paxFrom: (min: number) => `Mulai ${String(min)} orang`,
  faqTitle: 'Pertanyaan umum',
  faq: [
    {
      question: 'Apakah perlu membuat akun?',
      answer:
        'Tidak. Cukup nomor WhatsApp penanggung jawab rombongan yang diverifikasi dengan kode OTP.',
    },
    {
      question: 'Bagaimana cara membayar?',
      answer:
        'Setelah kamu mengonfirmasi di langkah Ringkasan, pembayaran dilakukan lewat QRIS atau Virtual Account di halaman Midtrans. Kelurahan tidak pernah meminta transfer ke rekening pribadi.',
    },
    {
      question: 'Bisakah meminta surat penawaran untuk sekolah atau instansi?',
      answer:
        'Bisa. Sekolah, kampus, instansi, dan perusahaan dapat meminta Surat Penawaran resmi di langkah Ringkasan untuk diajukan ke bendahara. Kuota baru dikunci saat kamu mengonfirmasi dan membayar.',
    },
    {
      question: 'Bagaimana jika peserta melebihi kuota satu sesi?',
      answer:
        'Sesi yang sisa kursinya kurang dari jumlah peserta tidak bisa dipilih. Pilih sesi lain, atau tanyakan jadwal khusus untuk rombongan besar lewat WhatsApp.',
    },
  ],
  bookNow: 'Pesan Sekarang',
  requestQuotation: 'Minta surat penawaran',
  panelNote:
    'Belum ada pembayaran sampai kamu mengonfirmasi di langkah Ringkasan. Bayar hanya lewat QRIS atau Virtual Account.',
  galleryLabel: 'Foto paket',
  otherEyebrow: 'Paket lain',
  otherTitle: 'Mungkin juga cocok',
};

export const productsPageCopy = {
  title: 'Produk UMKM warga',
  lead: 'Oleh-oleh dari bank sampah, kebun, dan sanggar kampung. Pesan sebagai tambahan saat memesan kunjungan, lalu ambil pada hari kunjungan.',
  noCartTitle: 'Tanpa keranjang belanja',
  noCartBody: 'Produk dipesan bersama kunjungan, di langkah Tambahan.',
  filterRw: 'Kampung',
  filterCategory: 'Kategori',
  noun: 'produk',
  searchLabel: 'Cari produk',
  searchPlaceholder: 'Cari produk',
  addonTitle: 'Pesan sebagai tambahan',
  addonSteps: [
    'Pilih paket dan sesi kunjungan',
    'Di langkah Tambahan, pilih produk dan jumlahnya',
    'Ambil pesananmu saat hari kunjungan',
  ],
  vendorsEyebrow: 'Pelaku UMKM',
  vendorsTitle: 'Dibuat oleh tetangga di kampung',
  vendorsLead: 'Setiap produk tercatat atas nama kelompok warga di RW-nya.',
  vendorProducts: (count: number) => `${String(count)} produk`,
  emptyFilteredTitle: 'Belum ada produk untuk pilihan ini',
  emptyFilteredBody: 'Hapus salah satu filter atau ubah kata pencarian.',
  emptyAllTitle: 'Produk warga sedang didata',
  emptyAllBody:
    'Pengelola sedang mendata produk UMKM warga. Tanyakan oleh-oleh untuk rombonganmu lewat WhatsApp.',
  emptyAsk: 'Tanya lewat WhatsApp',
  whatsAppTopic: 'produk UMKM warga',
};

export const productDetailCopy = {
  orderTitle: 'Cara memesan',
  orderAsAddon:
    'Produk ini dipesan sebagai tambahan saat memesan kunjungan, di langkah Tambahan, lalu diambil pada hari kunjungan.',
  orderAsk:
    'Produk ini belum bisa dipesan sebagai tambahan. Tanyakan ketersediaannya lewat WhatsApp.',
  otherEyebrow: 'Produk lain',
  otherTitle: 'Dari kampung yang sama',
};

export const galleryPageCopy = {
  title: 'Galeri kampung',
  lead: 'Foto kegiatan warga Ecowastreme dan Kampung Budaya & Seni, diambil dari situs resmi Kelurahan Gisikdrono.',
  count: (count: number, hasMore: boolean) =>
    hasMore ? `${String(count)}+ foto` : `${String(count)} foto`,
  showing: (count: number) => `Menampilkan ${String(count)} foto`,
  loadMore: 'Muat lebih banyak',
  emptyFilteredTitle: 'Belum ada foto untuk pilihan ini',
  emptyFilteredBody: 'Pilih kampung atau kategori lain, atau lihat semua foto.',
  emptyClear: 'Lihat semua foto',
  emptyAllTitle: 'Foto kampung sedang dikumpulkan',
  emptyAllBody: 'Dokumentasi kegiatan warga akan tampil di sini.',
};

export const articlesPageCopy = {
  title: 'Kabar dari kampung',
  lead: 'Cerita kegiatan warga, panduan berkunjung, dan pengumuman dari pengelola edu wisata.',
  searchLabel: 'Cari artikel',
  searchPlaceholder: 'Cari artikel, misalnya bank sampah',
  filterCategory: 'Kategori artikel',
  latest: 'Terbaru',
  read: 'Baca artikel',
  others: 'Artikel lainnya',
  allShown: 'Semua artikel sudah ditampilkan.',
  noun: 'artikel',
  guideLabel: 'Panduan',
  guideSteps: ['Paket', 'Sesi', 'Data & OTP', 'Bayar', 'Tiket QR'],
  emptyFilteredTitle: 'Belum ada artikel yang cocok',
  emptyFilteredBody: 'Coba kata lain, atau tampilkan semua kategori.',
  emptyAllTitle: 'Kabar kampung segera hadir',
  emptyAllBody: 'Cerita kegiatan warga dan panduan berkunjung akan tampil di sini.',
};

export const articleDetailCopy = {
  author: 'Edu Wisata Gisikdrono',
  toc: 'Di artikel ini',
  rwCalloutEyebrow: 'Kampung di artikel ini',
  viewPackage: 'Lihat paket',
  viewRw: (name: string) => `Kenali ${name}`,
  readAlso: 'Baca juga',
};

export const reviewsPageCopy = {
  title: 'Kata mereka yang sudah berkunjung',
  lead: 'Ulasan ditulis setelah kunjungan dan ditinjau pengelola sebelum tayang.',
  emptyTitle: 'Belum ada ulasan yang tayang',
  emptyBody:
    'Rombongan menerima undangan menulis ulasan setelah kunjungan. Ulasan pertama akan tampil di sini setelah ditinjau pengelola.',
};

export const bookletsPageCopy = {
  title: 'E-booklet & proposal',
  lead: 'E-booklet, proposal kunjungan, dan daftar harga Edu Wisata Gisikdrono. Baca di halaman ini atau unduh PDF-nya.',
  emptyTitle: 'Booklet sedang disiapkan',
  emptyBody:
    'Pengelola sedang menyiapkan e-booklet dan proposal kunjungan. Tanyakan lewat WhatsApp bila perlu sekarang.',
  emptyAsk: 'Minta lewat WhatsApp',
  read: 'Baca booklet',
  whatsAppTopic: 'e-booklet dan proposal kunjungan',
};

export const reviewsListCopy = {
  filterRating: 'Rating',
  noun: 'ulasan',
  emptyFilteredTitle: 'Belum ada ulasan dengan rating ini',
  emptyFilteredBody: 'Pilih rating lain, atau lihat semua ulasan.',
  askLabel: 'Tanya lewat WhatsApp',
  whatsAppTopic: 'ulasan kunjungan',
};
