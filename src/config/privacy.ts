// The privacy notice of /privasi (docs/Security.md §7.1–§7.3 and §7.6, docs/PRD.md assumption A7, Task P2.4.12).
// Every line restates a rule those documents already set; nothing here is a new promise. When they change,
// this file changes with them.

export interface PrivacyDataRow {
  data: string;
  subject: string;
  purpose: string;
  basis: string;
  retention: string;
}

// docs/Security.md §7.1, in the words a visitor uses.
export const PRIVACY_DATA_INVENTORY: readonly PrivacyDataRow[] = [
  {
    data: 'Nama, nomor WhatsApp, dan email penanggung jawab rombongan',
    subject: 'Pemesan',
    purpose: 'Pemesanan, tiket, dan faktur',
    basis: 'Pelaksanaan perjanjian',
    retention:
      'Dianonimkan 24 bulan setelah kunjungan; pemesanan yang tidak dibayar dianonimkan setelah 7 hari',
  },
  {
    data: 'Nama lembaga dan kotanya (tanpa alamat jalan)',
    subject: 'Lembaga',
    purpose: 'Faktur dan surat penawaran',
    basis: 'Pelaksanaan perjanjian',
    retention: '10 tahun bersama catatan keuangan',
  },
  {
    data: 'Nama dan kelas peserta (tidak wajib)',
    subject: 'Peserta, banyak di antaranya anak-anak',
    purpose: 'Sertifikat dan daftar hadir',
    basis: 'Persetujuan orang tua atau wali melalui lembaga',
    retention: 'Dihapus 90 hari setelah kunjungan, termasuk sertifikat peserta',
  },
  {
    data: 'Kode verifikasi (OTP), disimpan dalam bentuk acak',
    subject: 'Pemesan',
    purpose: 'Memastikan nomor WhatsApp milik pemesan',
    basis: 'Pelaksanaan perjanjian',
    retention: '24 jam',
  },
  {
    data: 'Data pembayaran: nomor pesanan, jumlah, nomor virtual account atau penerbit QRIS',
    subject: 'Pemesan',
    purpose: 'Pembayaran dan rekonsiliasi',
    basis: 'Pelaksanaan perjanjian dan kewajiban hukum',
    retention: 'Catatan pembayaran 10 tahun; catatan pemberitahuan pembayaran 24 bulan',
  },
  {
    data: 'Catatan persetujuan (versi teks, waktu, dan alamat IP dalam bentuk acak)',
    subject: 'Pemesan',
    purpose: 'Bukti persetujuan',
    basis: 'Kewajiban hukum',
    retention: 'Selama data pemesanan disimpan',
  },
  {
    data: 'Isi ulasan dan nama tampilan',
    subject: 'Pengunjung',
    purpose: 'Ulasan publik',
    basis: 'Persetujuan',
    retention: 'Sampai ditarik',
  },
  {
    data: 'Alamat IP dan jenis perangkat',
    subject: 'Semua pengguna',
    purpose: 'Keamanan',
    basis: 'Kepentingan yang sah',
    retention: '24 bulan; catatan percobaan masuk petugas 24 jam',
  },
  {
    data: 'Identitas akun petugas kelurahan dan RW',
    subject: 'Petugas',
    purpose: 'Administrasi',
    basis: 'Hubungan kerja',
    retention: '24 bulan setelah akun dinonaktifkan',
  },
];

// docs/Security.md §7.2.
export const PRIVACY_NOT_COLLECTED: readonly string[] = [
  'NIK atau foto KTP',
  'Tanggal lahir',
  'Alamat rumah',
  'Foto peserta',
  'Nomor telepon atau email peserta',
  'Jenis kelamin, agama, atau data kesehatan',
];

export interface PrivacyProcessor {
  name: string;
  role: string;
  location: string;
}

// docs/Security.md §7.6 "Processors and location".
export const PRIVACY_PROCESSORS: readonly PrivacyProcessor[] = [
  { name: 'Supabase', role: 'Basis data dan penyimpanan berkas', location: 'Singapura' },
  { name: 'Vercel', role: 'Server situs', location: 'Singapura' },
  { name: 'Midtrans', role: 'Pembayaran QRIS dan virtual account', location: 'Indonesia' },
  {
    name: 'Meta (WhatsApp)',
    role: 'Pengiriman pesan: nomor dan isi templat',
    location: 'Luar Indonesia',
  },
  {
    name: 'Resend',
    role: 'Pengiriman email, hanya tautan tanpa lampiran',
    location: 'Amerika Serikat',
  },
  { name: 'Cloudflare Turnstile', role: 'Pencegahan bot: alamat IP', location: 'Luar Indonesia' },
];

// docs/Security.md §7.6 "Data-subject rights": 3 working days to acknowledge, 14 days to fulfil.
export const DSR_ACKNOWLEDGE_WORKING_DAYS = 3;
export const DSR_FULFIL_DAYS = 14;
// docs/Security.md §7.8: daily backups kept 7 days.
export const BACKUP_RETENTION_DAYS = 7;
// docs/Security.md §7.6 "Breach notification": 3 × 24 hours.
export const BREACH_NOTICE_HOURS = 72;
