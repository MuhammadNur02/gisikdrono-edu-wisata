import type { ScanResult } from '@/types/scanner';

// The gate scanner (Task P4.4.03, P4.4.04; docs/StyleGuide.md §6.6), imported where it is used. The result titles are
// the scan_result labels of src/config/status.ts; these are the lines under them and the next step for the officer
// (docs/PRD.md FR-SCAN-05).
export const scannerCopy = {
  title: 'Scanner Tiket',
  description: 'Pindai QR tiket rombongan, cek identitas, lalu konfirmasi jumlah pengunjung.',
  startCamera: 'Nyalakan kamera',
  stopCamera: 'Matikan kamera',
  scan: 'Scan',
  scanning: 'Arahkan kamera ke QR tiket...',
  cameraIdle: 'Kamera mati. Ketuk "Nyalakan kamera" untuk mulai.',
  torchOn: 'Nyalakan senter',
  torchOff: 'Matikan senter',
  cameraLabel: 'Tampilan kamera',
  tabs: { camera: 'Kamera', manual: 'Kode manual' },
  cameraErrors: {
    'permission-denied':
      'Izin kamera ditolak. Buka pengaturan browser, izinkan kamera untuk situs ini, lalu coba lagi.',
    'no-camera': 'Kamera tidak ditemukan di perangkat ini. Gunakan kode manual.',
    'in-use': 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu, lalu coba lagi.',
    'insecure-context': 'Kamera hanya bisa dipakai lewat alamat https.',
    inAppBrowser:
      'Browser di dalam aplikasi ini tidak mengizinkan kamera. Buka halaman ini di Chrome atau Safari.',
    other: 'Kamera tidak bisa dinyalakan. Coba lagi atau gunakan kode manual.',
  },
  notATicket: 'Bukan tiket Edu Wisata Gisikdrono.',
  checking: 'Memeriksa tiket...',
  outcomes: {
    offline: 'Tidak ada sinyal — coba lagi.',
    timeout: 'Tidak ada jawaban dari server — coba lagi.',
    rateLimited: 'Terlalu banyak pemindaian. Tunggu sebentar, lalu coba lagi.',
    signedOut: 'Sesi Anda berakhir. Masuk lagi untuk melanjutkan.',
    unavailable:
      'Layanan pemeriksaan tiket belum aktif. Gunakan daftar hadir kertas untuk sementara.',
    failed: 'Pemeriksaan gagal. Coba lagi.',
  },
  retry: 'Coba lagi',
  signInAgain: 'Masuk lagi',
  close: 'Tutup',
  confirm: 'Konfirmasi Check-in',
  override: 'Override',
  overrideReason: 'Alasan override',
  overrideHint: 'Wajib diisi. Tercatat di log audit.',
  askSuperadmin: 'Hubungi superadmin untuk override.',
  resultHints: {
    ok: 'Cek identitas PIC, lalu masukkan jumlah pengunjung yang hadir.',
    already_used: 'Tiket ini sudah dipakai check-in. Cek manual bila rombongan merasa belum masuk.',
    outside_window: 'Sesi kunjungan belum dibuka atau sudah lewat.',
    wrong_date: 'Tiket ini untuk tanggal kunjungan lain.',
    invalid_signature: 'QR ini tidak dibuat oleh sistem. Cek manual dengan kode pemesanan.',
    not_found: 'Tiket tidak ada di sistem. Cek manual dengan kode pemesanan.',
    suspended: 'Pembayaran tiket ini sedang dipersoalkan. Hubungi superadmin.',
    revoked: 'Tiket sudah dibatalkan. Hubungi superadmin.',
    wrong_rw: 'Tiket ini untuk kunjungan di RW lain. Arahkan rombongan ke RW tersebut.',
    booking_not_paid: 'Reservasi belum lunas. Minta rombongan menyelesaikan pembayaran.',
    ticket_expired: 'Masa berlaku tiket sudah habis. Hubungi superadmin.',
    forbidden: 'Akun Anda tidak berwenang memeriksa tiket ini.',
  } satisfies Record<ScanResult, string>,
  committed: (institution: string, attendees: number) =>
    `Check-in berhasil: ${institution} · ${String(attendees)} orang`,
  usedAt: (at: string, by: string | null) => (by ? `Dipakai ${at} oleh ${by}` : `Dipakai ${at}`),
  card: {
    institution: 'Instansi',
    pic: 'PIC',
    package: 'Paket',
    session: 'Sesi',
    pax: 'Jumlah dipesan',
    participants: 'Peserta terdaftar',
    addons: 'Tambahan',
    individual: 'Perorangan',
  },
  attendees: 'Jumlah hadir',
  attendeesHint: (max: number) => `Paling banyak ${String(max)} orang.`,
  unpaid: (count: number) => `Kelebihan ${String(count)} orang dicatat sebagai belum dibayar.`,
  decrease: 'Kurangi satu',
  increase: 'Tambah satu',
  manual: {
    title: 'Check-in manual',
    description:
      'Untuk QR yang tidak terbaca: kode pemesanan dan 4 digit terakhir nomor WhatsApp PIC. Hanya untuk kunjungan hari ini.',
    bookingCode: 'Kode pemesanan',
    phoneLastDigits: '4 digit terakhir nomor WhatsApp',
    submit: 'Periksa',
  },
  recent: { title: 'Pemindaian terakhir', empty: 'Belum ada pemindaian.' },
  modal: {
    title: 'Scan Tiket',
    description: 'Foto QR tiket dengan kamera ponsel, atau masukkan kode manual.',
    takePhoto: 'Foto QR tiket',
    noQrInPhoto: 'QR tidak terbaca di foto. Coba lagi lebih dekat dan tidak buram.',
    photoUnsupported:
      'Perangkat ini tidak bisa membaca QR dari foto. Buka scanner penuh atau gunakan kode manual.',
    openFullScanner: 'Buka scanner penuh',
  },
  validation: {
    attendees: 'Masukkan jumlah pengunjung yang hadir.',
    bookingCode: 'Kode pemesanan tidak dikenali. Contoh: GSK-7F3K9Q2M.',
    phoneLastDigits: 'Masukkan 4 digit angka.',
    overrideReason: 'Tulis alasan override.',
  },
  offline: {
    title: 'Tidak ada sinyal',
    description:
      'Scanner butuh koneksi internet untuk memeriksa tiket. Sambungkan ke data seluler atau Wi-Fi, lalu muat ulang halaman.',
    reload: 'Muat ulang',
    paperFallback: 'Bila sinyal tidak kembali, catat kehadiran di daftar hadir kertas.',
  },
  install: {
    title: 'Pasang scanner di layar utama',
    android:
      'Android (Chrome): buka menu ⋮, lalu pilih "Instal aplikasi" atau "Tambahkan ke layar utama".',
    ios: 'iPhone (Safari): ketuk tombol Bagikan, lalu pilih "Tambahkan ke Layar Utama".',
  },
} as const;
