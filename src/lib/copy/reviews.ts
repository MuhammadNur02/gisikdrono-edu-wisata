import { REVIEW_LIMITS } from '@/config/reviews';

const limit = (value: number) => String(value);

// /dashboard/reviews (Task P4.3.07) and the visitor's review page /reservasi/[bookingCode]/ulasan (Task P4.11.02),
// imported where they are used.
export const reviewsCopy = {
  moderation: {
    title: 'Moderasi Ulasan',
    description:
      'Ulasan pengunjung tampil di /ulasan setelah disetujui. Nama yang tampil hanya nama depan atau "Pengunjung".',
    readOnlyNotice:
      'Anda melihat ulasan untuk RW Anda. Persetujuan dan penolakan dilakukan oleh Superadmin Kelurahan.',
    empty: 'Belum ada ulasan.',
    emptyHint: 'Ulasan masuk setelah rombongan selesai berkunjung dan mengisi formulir ulasan.',
    noun: 'ulasan',
    // What v_public_reviews calls an anonymous author (0004_functions.sql, public_reviewer_name).
    anonymousName: 'Pengunjung',
    search: 'Cari isi ulasan...',
    facets: { status: 'Status', rating: 'Rating', rw: 'RW' },
    ratingOption: (rating: number) => `${String(rating)} bintang`,
    columns: {
      rating: 'Rating',
      review: 'Ulasan',
      reviewer: 'Pengulas',
      rws: 'RW',
      status: 'Status',
      featured: 'Unggulan',
      createdAt: 'Masuk',
      actions: 'Aksi',
    },
    untitled: 'Tanpa judul',
    featured: 'Unggulan',
    open: 'Buka ulasan',
    moderate: 'Moderasi',
    dialogTitle: 'Ulasan pengunjung',
    dialogDescription: 'Isi ulasan seperti yang dikirim pengunjung.',
    moderatedAt: (at: string) => `Dimoderasi ${at}`,
    status: 'Status',
    isFeatured: 'Tampilkan di beranda',
    isFeaturedHint: 'Hanya untuk ulasan yang tayang. Beranda menampilkan paling banyak tiga.',
    moderationNote: 'Catatan moderasi',
    moderationNoteHint: 'Hanya terlihat oleh petugas, misalnya alasan penolakan.',
    save: 'Simpan moderasi',
    saved: 'Moderasi ulasan disimpan.',
    validation: {
      featuredNeedsPublished: 'Hanya ulasan yang tayang yang bisa ditampilkan di beranda.',
      noteTooLong: `Catatan paling panjang ${limit(REVIEW_LIMITS.moderationNote)} karakter.`,
    },
  },
  form: {
    title: 'Beri ulasan',
    description:
      'Ceritakan pengalaman rombongan Anda. Ulasan tampil di situs setelah diperiksa petugas kelurahan.',
    rating: 'Rating kunjungan',
    ratingOption: (rating: number, max: number) => `${String(rating)} dari ${String(max)} bintang`,
    titleField: 'Judul (opsional)',
    body: 'Ulasan',
    bodyHint: `Minimal ${limit(REVIEW_LIMITS.bodyMin)} karakter. Tulis tanpa tautan, email, atau nomor telepon.`,
    bodyCounter: (length: number) => `${String(length)}/${limit(REVIEW_LIMITS.bodyMax)}`,
    reviewerName: 'Nama Anda',
    reviewerNameHint: 'Hanya nama depan yang tampil di situs.',
    showName: 'Tampilkan nama saya',
    showNameHint: 'Jika tidak dicentang, ulasan tampil atas nama "Pengunjung".',
    submit: 'Kirim ulasan',
    validation: {
      rating: 'Pilih rating 1 sampai 5 bintang.',
      titleTooLong: `Judul paling panjang ${limit(REVIEW_LIMITS.title)} karakter.`,
      bodyTooShort: `Ulasan minimal ${limit(REVIEW_LIMITS.bodyMin)} karakter.`,
      bodyTooLong: `Ulasan paling panjang ${limit(REVIEW_LIMITS.bodyMax)} karakter.`,
      nameTooShort: `Nama minimal ${limit(REVIEW_LIMITS.reviewerNameMin)} karakter.`,
      nameTooLong: `Nama paling panjang ${limit(REVIEW_LIMITS.reviewerNameMax)} karakter.`,
    },
  },
  thanks: {
    title: 'Terima kasih atas ulasan Anda',
    description:
      'Ulasan Anda sudah kami terima dan akan tampil di halaman Ulasan setelah diperiksa petugas kelurahan.',
    backHome: 'Kembali ke beranda',
    seeReviews: 'Lihat ulasan pengunjung',
  },
} as const;
