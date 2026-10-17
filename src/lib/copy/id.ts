import type { ActionErrorCode } from '@/types/action-result';

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
  validation: {
    freeText: 'Tulis tanpa tautan, alamat situs, email, atau nomor telepon, ya.',
  },
  // Labels the base components read out to screen readers and show on their own controls.
  ui: {
    close: 'Tutup',
    loading: 'Sedang diproses',
    previousSlide: 'Slide sebelumnya',
    nextSlide: 'Slide berikutnya',
    commandTitle: 'Cari menu',
    commandDescription: 'Ketik nama menu atau tindakan yang Anda cari.',
    commandPlaceholder: 'Cari menu atau tindakan...',
    commandEmpty: 'Tidak ada yang cocok.',
  },
};
