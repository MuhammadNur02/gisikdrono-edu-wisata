import { authCopy } from '@/lib/copy/auth';
import { bookingCopy } from '@/lib/copy/booking';
import { cmsCopy } from '@/lib/copy/cms';
import { dashboardCopy } from '@/lib/copy/dashboard';
import { documentsCopy } from '@/lib/copy/documents';
import type { ActionErrorCode } from '@/types/action-result';
import type { UploadProblem } from '@/types/upload';

// The browser says it first and api/uploads/{sign,finalize} say it again, so both read the same words.
const SVG_REFUSED = 'Format SVG tidak didukung';
const HEIC_REFUSED =
  'Foto format HEIC (iPhone) belum didukung. Simpan sebagai JPG dulu, atau ubah iPhone: Pengaturan → Kamera → Format → Paling Kompatibel.';

// What people read when something goes wrong: friendly, plain Indonesian (CLAUDE.md §4.2).
export const copy = {
  errors: {
    UNAUTHENTICATED: 'Sesi Anda sudah berakhir. Silakan masuk lagi, ya.',
    FORBIDDEN: 'Maaf, Anda tidak punya akses untuk membuka atau mengubah data ini.',
    VALIDATION: 'Ada isian yang belum pas. Cek lagi kolom yang ditandai, ya.',
    NOT_FOUND: 'Data yang Anda cari tidak ditemukan.',
    CONFLICT: 'Data ini baru saja berubah atau sudah ada. Muat ulang halaman, lalu coba lagi.',
    QUOTA_EXCEEDED: 'Kuota sesi ini sudah penuh, coba pilih jam lain ya.',
    STATE_INVALID:
      'Status pemesanan sudah berubah, jadi langkah ini tidak bisa dilanjutkan. Muat ulang halaman untuk melihat status terbaru.',
    PRICE_MISMATCH:
      'Harga paket baru saja berubah. Cek lagi ringkasan pesanan sebelum melanjutkan, ya.',
    RATE_LIMITED: 'Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi ya.',
    PAYMENT: 'Pembayaran belum bisa diproses. Coba beberapa saat lagi atau pilih metode lain.',
    INTERNAL: 'Maaf, ada kendala di sistem kami. Coba lagi sebentar lagi, ya.',
  } satisfies Record<ActionErrorCode, string>,
  validation: { freeText: 'Tulis tanpa tautan, alamat situs, email, atau nomor telepon, ya.' },
  auth: authCopy,
  booking: bookingCopy,
  dashboard: dashboardCopy,
  documents: documentsCopy,
  cms: cmsCopy,
  // Labels the base components read out to screen readers and show on their own controls.
  ui: {
    close: 'Tutup',
    loading: 'Sedang diproses',
    previousSlide: 'Slide sebelumnya',
    nextSlide: 'Slide berikutnya',
    goToSlide: (slide: number, total: number) => `Slide ${String(slide)} dari ${String(total)}`,
    commandTitle: 'Cari menu',
    commandDescription: 'Ketik nama menu atau tindakan yang Anda cari.',
    commandPlaceholder: 'Cari menu atau tindakan...',
    commandEmpty: 'Tidak ada yang cocok.',
  },
  layout: {
    skipToContent: 'Lewati ke konten',
    homeLink: 'Edu Wisata Gisikdrono, ke beranda',
    mainNav: 'Navigasi utama',
    openMenu: 'Buka menu',
    menuTitle: 'Menu',
    menuDescription: 'Semua halaman Edu Wisata Gisikdrono.',
    breadcrumb: 'Lokasi halaman',
    footerNav: 'Navigasi bawah',
    // Names no number of RWs, and promises no booking: an RW may show its profile before it takes visits.
    footerAbout: 'Kunjungan edukasi ke kampung-kampung di Kelurahan Gisikdrono.',
    footerManagedBy: 'Dikelola oleh',
    footerContactTitle: 'Kontak',
    footerEmail: 'Email',
    footerWhatsApp: 'Chat WhatsApp',
    // docs/StyleGuide.md §9.2: the fixed trust line, reused word for word wherever payment is mentioned.
    paymentTrust:
      'Pembayaran hanya melalui sistem (QRIS/VA); kelurahan tidak pernah meminta transfer ke rekening pribadi.',
    whatsAppFab: 'Chat WhatsApp kelurahan',
    whatsAppGreeting: (pageTopic: string) => `Halo, saya ingin bertanya tentang ${pageTopic}`,
  },
  pages: {
    notFound: {
      eyebrow: 'Halaman tidak ditemukan',
      title: 'Halaman ini tidak ada',
      description:
        'Alamatnya mungkin salah ketik, atau halamannya sudah dipindah. Coba mulai lagi dari salah satu halaman ini.',
      packages: 'Lihat paket wisata',
    },
    error: {
      title: 'Terjadi kesalahan',
      description:
        'Halaman ini gagal dimuat. Coba muat ulang. Kalau masih gagal, sebutkan kode di bawah saat menghubungi kami.',
      code: 'Kode',
      retry: 'Coba lagi',
      home: 'Kembali ke beranda',
    },
  },
  // Card labels shared by the home page, the RW pages and the catalogues of Task P2.4.
  catalogue: {
    bookNow: 'Pesan Sekarang',
    packageDetail: 'Detail',
    viewProduct: 'Lihat Produk',
    fromPrice: 'mulai',
    perBasis: { orang: '/orang', rombongan: '/rombongan' },
    minutes: (minutes: number) => `${String(minutes)} menit`,
    paxRange: (min: number, max: number) => `${String(min)}–${String(max)} orang`,
    combo: 'Kombinasi',
    addonEligible: 'Bisa jadi tambahan',
    featured: 'Unggulan',
    unavailable: 'Tidak Tersedia',
    rating: (rating: string, max: number) => `Rating ${rating} dari ${String(max)}`,
    ratingSummary: (rating: string, count: number) =>
      `Rating ${rating} dari ${String(count)} ulasan`,
    // Filters: the answer to a visitor's own choice may say nothing matched (docs/StyleGuide.md §6.9).
    filterAll: 'Semua',
    filterRw: 'Kampung',
    filterPackageType: 'Jenis paket',
    filterProductCategory: 'Kategori',
    filterRating: 'Rating',
    clearFilters: 'Hapus filter',
    packagesFilterEmpty: 'Belum ada paket untuk filter ini.',
    productsFilterEmpty: 'Belum ada produk untuk filter ini.',
    reviewsFilterEmpty: 'Belum ada ulasan dengan rating ini.',
    stars: (rating: number) => `${String(rating)} bintang`,
    reviewCount: (count: number) => `dari ${String(count)} ulasan`,
    availabilityTitle: 'Sesi terbuka 14 hari ke depan',
    seatsLeft: (remaining: number) => `sisa ${String(remaining)} kursi`,
    availabilityNone:
      'Tidak ada sesi terbuka dalam 14 hari ke depan. Pilih tanggal lain saat memesan.',
    availabilityFailed: 'Jadwal sesi tidak bisa dimuat. Muat ulang halaman untuk mencoba lagi.',
    highlights: 'Yang dilakukan',
    inclusions: 'Sudah termasuk',
    itinerary: 'Rencana kegiatan',
    priceTiers: 'Harga rombongan',
    tierRange: (min: number, max: number | null) =>
      max === null ? `${String(min)} orang atau lebih` : `${String(min)}–${String(max)} orang`,
    validity: (from: string | null, to: string | null) =>
      from && to
        ? `Berlaku ${from} sampai ${to}`
        : from
          ? `Berlaku mulai ${from}`
          : `Berlaku sampai ${to ?? ''}`,
    addOnHint: 'Tambahkan saat pesan paket',
    askOnWhatsApp: 'Tanya via WhatsApp',
    vendorTitle: 'Dibuat oleh',
    leadTime: (days: number) => `Dipesan paling lambat ${String(days)} hari sebelum kunjungan`,
    orderRange: (min: number, max: number | null, unit: string) =>
      max === null ? `Minimal ${String(min)} ${unit}` : `${String(min)}–${String(max)} ${unit}`,
  },
  // /galeri and the RW gallery sections (docs/StyleGuide.md §5.11).
  gallery: {
    filterLabel: 'Tampilkan',
    filterEmpty: 'Belum ada foto untuk filter ini.',
    loadMore: 'Muat lagi',
    openPhoto: (alt: string) => `Perbesar foto: ${alt}`,
    playVideo: (alt: string) => `Putar video: ${alt}`,
    // Under the play button: pressing it loads YouTube's player, so the visitor knows whose it is.
    videoSource: 'Video YouTube',
    lightbox: {
      previous: 'Foto sebelumnya',
      next: 'Foto berikutnya',
      close: 'Tutup',
      viewer: 'Penampil foto',
      carousel: 'Foto',
      slide: 'Foto',
      photos: 'Galeri foto',
      position: '{index} dari {total}',
    },
  },
  // /artikel and /artikel/[slug] (docs/PRD.md FR-PUB-16).
  article: {
    readingTime: (minutes: number) => `${String(minutes)} menit baca`,
  },
  // /e-booklet and the flipbook (docs/StyleGuide.md §5.12).
  booklet: {
    pages: (count: number) => `${String(count)} halaman`,
    download: 'Unduh PDF',
    viewer: (title: string) => `Booklet ${title}`,
    page: (page: number) => `Halaman ${String(page)}`,
    position: (from: number, to: number, total: number) =>
      from === to
        ? `${String(from)} / ${String(total)}`
        : `${String(from)}–${String(to)} / ${String(total)}`,
    positionSpoken: (from: number, to: number, total: number) =>
      from === to
        ? `Halaman ${String(from)} dari ${String(total)}`
        : `Halaman ${String(from)} dan ${String(to)} dari ${String(total)}`,
    previous: 'Halaman sebelumnya',
    next: 'Halaman berikutnya',
    fullscreen: 'Layar penuh',
    exitFullscreen: 'Keluar dari layar penuh',
    keyboardHint: 'Tekan ← dan → di papan ketik untuk membalik halaman.',
  },
  // RW page labels. An empty section has no text at all: it is left out (docs/StyleGuide.md §6.9).
  rwPage: {
    visionTitle: 'Visi',
    galleryAll: (rw: string) => `Lihat semua foto ${rw}`,
    schedulesAll: 'Lihat jadwal lengkap',
  },
  forms: {
    required: 'wajib',
    phone: { placeholder: '812-3456-7890' },
    stepper: { decrease: 'Kurangi', increase: 'Tambah' },
    datePicker: {
      placeholder: 'Pilih tanggal kunjungan',
      busyLegend: 'Hampir penuh',
    },
    session: {
      remaining: (remaining: number, capacity: number) =>
        `Sisa ${String(remaining)} dari ${String(capacity)}`,
      full: 'Penuh',
      tooSmall: 'Kuota tidak cukup untuk rombongan Anda',
    },
    participants: {
      name: 'Nama',
      group: 'Kelas/Kelompok',
      nameOf: (row: number) => `Nama peserta ${String(row)}`,
      groupOf: (row: number) => `Kelas atau kelompok peserta ${String(row)}`,
      remove: (row: number) => `Hapus peserta ${String(row)}`,
      add: 'Tambah peserta',
      count: (count: number, max: number) => `${String(count)} dari ${String(max)} peserta`,
      pasteHint: 'Bisa langsung tempel dari spreadsheet: kolom nama, lalu kelas atau kelompok.',
      duplicateRow: 'Nama ini sama dengan baris lain',
      duplicates: (count: number) =>
        `${String(count)} nama tercatat lebih dari sekali. Cek lagi, ya.`,
      truncated: 'Sebagian baris tidak ditambahkan karena melebihi jumlah peserta.',
    },
    image: {
      choose: 'Tarik foto ke sini atau pilih file',
      hint: 'JPG, PNG, atau WebP, maksimal 10 MB.',
      svg: SVG_REFUSED,
      heic: HEIC_REFUSED,
      type: 'Format file ini tidak didukung. Gunakan JPG, PNG, atau WebP.',
      size: 'Ukuran file melebihi 10 MB.',
      failed: 'Foto gagal diunggah. Coba lagi sebentar lagi, ya.',
      uploading: 'Mengunggah foto...',
      remove: 'Hapus foto',
      altLabel: 'Deskripsi foto',
      altHint: 'Jelaskan isi foto untuk pengguna pembaca layar (3–200 karakter).',
    },
    booklet: {
      choose: 'Pilih file PDF booklet',
      hint: 'PDF, maksimal 50 MB dan 100 halaman.',
      // docs/Security.md §8.4: photos inside a booklet keep their own EXIF, so the officer is asked to check.
      gpsHint:
        'Pastikan foto di booklet tidak memuat lokasi (GPS). Ekspor PDF dari Canva/Word biasanya sudah aman.',
      type: 'Booklet harus berupa file PDF.',
      uploading: 'Mengunggah PDF dan menyiapkan halamannya...',
      pages: (done: number, total: number) =>
        `Halaman ${String(done)} dari ${String(total)} sudah terunggah`,
      done: (pages: number) => `PDF dan ${String(pages)} halamannya sudah terunggah.`,
      failed: 'Booklet gagal diunggah. Coba lagi sebentar lagi, ya.',
    },
    richText: {
      toolbar: 'Format teks',
      bold: 'Tebal',
      italic: 'Miring',
      heading: (level: number) => `Judul tingkat ${String(level)}`,
      bulletList: 'Daftar berbutir',
      orderedList: 'Daftar bernomor',
      blockquote: 'Kutipan',
      link: 'Tautan',
      image: 'Sisipkan foto',
      undo: 'Urungkan',
      redo: 'Ulangi',
      editorLabel: 'Isi artikel',
      linkLabel: 'Alamat tautan',
      linkHint: 'Diawali https://, http://, atau mailto:',
      linkInvalid: 'Tautan harus diawali https://, http://, atau mailto:.',
      linkApply: 'Pasang tautan',
      linkRemove: 'Hapus tautan',
      captionLabel: 'Keterangan foto',
      captionHint: 'Tampil di bawah foto: apa atau di mana foto ini diambil.',
      insertImage: 'Sisipkan ke artikel',
      cancel: 'Batal',
    },
  },
  // Why api/uploads/sign or api/uploads/finalize refused a file (docs/Security.md §8.4).
  uploads: {
    problems: {
      svg: SVG_REFUSED,
      heic: HEIC_REFUSED,
      type: 'Format file ini tidak didukung. Gunakan foto JPG, PNG, atau WebP, atau PDF untuk booklet.',
      wrong_kind:
        'File ini tidak cocok untuk isian ini. Foto harus JPG, PNG, atau WebP; booklet harus PDF.',
      image_size: 'Ukuran foto melebihi 10 MB.',
      pdf_size: 'Ukuran PDF melebihi 50 MB.',
      late: 'Unggahan terlalu lama selesai. Pilih file lagi untuk mengunggah ulang, ya.',
      missing: 'File unggahan tidak ditemukan. Pilih file lagi, ya.',
      unreadable:
        'File tidak bisa dibaca, mungkin rusak atau terpotong. Simpan ulang file-nya, lalu unggah lagi.',
      pdf_encrypted:
        'PDF ini dikunci dengan kata sandi. Simpan ulang tanpa kata sandi, lalu unggah lagi.',
      pdf_active_content:
        'PDF ini berisi skrip, lampiran, atau aksi otomatis yang tidak diizinkan. Ekspor ulang dari aplikasi desainnya sebagai PDF biasa, lalu unggah lagi.',
      pdf_link:
        'PDF ini berisi tautan yang tidak diizinkan. Tautan di booklet hanya boleh diawali https://, mailto:, atau tel:.',
      pdf_too_many_pages:
        'Booklet maksimal 100 halaman. Pecah menjadi beberapa booklet, lalu unggah lagi satu per satu.',
      pdf_unsupported_content:
        'PDF ini memuat isian formulir, tanda tangan digital, layer tersembunyi, atau format gambar yang tidak didukung. Ekspor ulang sebagai PDF biasa dari Canva atau Word, lalu unggah lagi.',
      pdf_too_complex:
        'PDF ini terlalu berat untuk diperiksa. Ekspor ulang dari Canva atau Word, lalu unggah lagi.',
      booklet_missing: 'PDF booklet belum terunggah. Unggah PDF-nya dulu, baru halamannya.',
      already_used: 'Unggahan ini sudah diproses. Pilih file lagi untuk mengunggah ulang, ya.',
      booklet_pages_exist:
        'Halaman booklet ini sudah terunggah. Untuk menggantinya, buat booklet baru lalu unggah lagi.',
      booklet_pages_in_progress:
        'Halaman booklet ini sedang diunggah. Tunggu sampai selesai, atau coba lagi dua jam lagi.',
    } satisfies Record<UploadProblem, string>,
    bookletPagesFailed: 'Halaman booklet gagal diunggah. Coba unggah ulang booklet-nya, ya.',
  },
};
