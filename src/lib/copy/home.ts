import { countWord, countWordAtStart } from '@/lib/utils/number-words';

// The words of the home page (DESIGN-SPEC §3.1), verbatim from the approved design. Its own module because
// src/lib/copy/id.ts is at the 300-line cap of CLAUDE.md §4; the same rules apply (Indonesian, one key per string).
// Server components only: the client islands of the page take theirs from src/lib/copy/ui.ts.
export const homeCopy = {
  intro: {
    eyebrow: 'Selamat datang',
    title: 'Belajar langsung dari warga yang merawat kampungnya',
    lead: 'Di Gisikdrono, sampah dipilah lalu ditabung, kebun TOGA diolah menjadi minuman herbal, dan tradisi Jawa dirawat lewat tari, gamelan, wayang, serta dolanan anak. Semuanya digerakkan warga sendiri, dan pintu kampung terbuka bagi rombongan yang ingin belajar.',
    body: 'Sekolah, kampus, instansi, perusahaan, maupun keluarga dapat memesan sesi kunjungan berjadwal, membayar lewat QRIS atau Virtual Account, lalu menerima tiket QR di WhatsApp dan email. Produk UMKM warga dipesan terpisah lewat Koperasi Merah Putih.',
    secondaryCta: 'Lihat Paket',
  },
  kampung: {
    eyebrow: (count: number) => `Pilih kampung · ${countWord(count)} kampung`,
    title: (count: number) =>
      `${countWordAtStart(count)} kampung, ${countWord(count)} cara belajar`,
    description:
      'Setiap RW membuka kampungnya dengan caranya sendiri. Pilih yang paling cocok untuk rombonganmu, atau gabungkan dua kampung dalam satu hari.',
    compare: 'Bandingkan semua paket',
    points: (count: number) => `${String(count)} titik aktivitas`,
    profileOnly: 'Profil kampung',
    explore: (name: string) => `Jelajahi ${name}`,
    meet: (label: string) => `Kenali ${label}`,
  },
  packages: {
    eyebrow: 'Paket pilihan',
    title: 'Paket untuk rombongan yang ingin belajar',
    description:
      'Durasi, isi kegiatan, dan harga per orang jelas sejak awal. Total akhir dihitung sistem saat kamu memesan.',
    all: 'Semua paket wisata',
    trust: [
      {
        title: 'Tanpa membuat akun',
        body: 'Cukup nomor WhatsApp yang diverifikasi kode OTP.',
      },
      {
        title: 'QRIS atau Virtual Account',
        body: 'Pembayaran lewat Midtrans, tidak ke rekening pribadi.',
      },
      {
        title: 'Surat penawaran resmi',
        body: 'Sekolah, kampus, instansi, dan perusahaan bisa memintanya.',
      },
    ],
  },
  why: {
    eyebrow: 'Kenapa Gisikdrono',
    title: 'Belajar dari pelakunya, bukan dari slide',
    description:
      'Yang dilihat peserta adalah kebiasaan warga sehari-hari: dipraktikkan, ditanyakan, lalu dibawa pulang.',
    figuresTitle: 'Gisikdrono dalam angka',
    figuresNote: 'Dihitung dari data kampung di situs ini',
    kampung: (labels: string) => `kampung edukasi: ${labels}`,
    kampungShort: 'kampung edukasi',
    points: 'titik aktivitas yang bisa disinggahi rombongan',
    pointsShort: 'titik aktivitas',
    dances: (names: string) => `tari tradisional: ${names}`,
    dancesShort: 'tari tradisional',
    games: (names: string) => `dolanan anak: ${names}`,
    gamesShort: 'dolanan anak',
  },
  band: {
    eyebrow: 'Nguri-nguri budaya',
    statement: 'Tradisi Jawa dirawat dalam kegiatan sehari-hari, bukan hanya saat ada tamu.',
  },
  gallery: {
    eyebrow: 'Galeri',
    title: 'Sudut-sudut kampung',
    description:
      'Foto dari kegiatan warga RW 05 dan RW 13, diambil dari situs resmi Kelurahan Gisikdrono.',
    open: 'Buka galeri',
    pause: 'Jeda',
    rowLabel: 'Foto kegiatan kampung',
  },
  reviews: {
    eyebrow: 'Ulasan rombongan',
    title: 'Kata mereka yang sudah berkunjung',
    description: 'Ulasan ditulis setelah kunjungan dan ditinjau pengelola sebelum tayang.',
    rowLabel: 'Ulasan rombongan',
  },
  products: {
    eyebrow: 'Produk UMKM',
    title: 'Oleh-oleh dari tangan warga',
    description:
      'Pesan lewat WhatsApp Koperasi Merah Putih, lalu ambil dan bayar di koperasi. Tidak ada keranjang belanja.',
    all: 'Semua produk UMKM',
    panelTitle: 'Pesan lewat Koperasi Merah Putih',
    panelSteps: [
      'Buka halaman produk yang kamu mau',
      'Tekan Pesan via WhatsApp, lalu kirim pesannya ke Koperasi Merah Putih',
      'Ambil dan bayar pesananmu di Koperasi Merah Putih',
    ],
    panelShort:
      'Pesan lewat WhatsApp Koperasi Merah Putih dari halaman produk, lalu ambil dan bayar di koperasi.',
  },
  articles: {
    eyebrow: 'Artikel',
    title: 'Kabar dari kampung',
    description: 'Cerita kegiatan warga dan panduan berkunjung, ditulis pengelola edu wisata.',
    all: 'Semua artikel',
  },
  map: {
    eyebrow: 'Peta & kontak',
    title: 'Datang ke Gisikdrono',
    description:
      'Tiga kampung edukasi dalam satu kelurahan di Semarang Barat. Titik kumpul tercantum di tiket.',
    address: 'Alamat',
    sessions: 'Sesi kunjungan',
    whatsAppTitle: 'Tanya jadwal atau rombongan besar?',
    whatsAppBody: 'Chat pengelola edu wisata lewat WhatsApp. Pesan pembuka sudah kami siapkan.',
    directions: 'Petunjuk arah',
    booklets: 'Unduh e-booklet & proposal',
    mapLabel: 'Peta letak kampung edukasi di Kelurahan Gisikdrono',
    openMap: 'Buka peta & kontak',
  },
  cta: {
    eyebrow: 'Siap berkunjung?',
    title: 'Bawa rombonganmu belajar ke Gisikdrono',
    description:
      'Pilih paket dan sesi, bayar online, lalu tiket QR langsung terkirim ke WhatsApp dan email.',
    secondary: 'Lihat Paket',
  },
} as const;
