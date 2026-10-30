import type { EditableSettingName } from '@/config/site-settings';

// /dashboard/settings (Task P4.9.01), imported directly by its page and form rather than through the copy barrel
// (admin first-load budget).

export const settingsCopy = {
  title: 'Pengaturan',
  description:
    'Aturan pemesanan, kanal pesan, check-in, data, kontak publik, dan tanda tangan dokumen. Setiap penyimpanan meminta kode autentikator.',
  onlySuper: 'Hanya superadmin yang mengubah pengaturan situs.',
  save: 'Simpan pengaturan',
  saved: (count: number) =>
    count === 0 ? 'Tidak ada yang berubah.' : `${String(count)} pengaturan tersimpan.`,
  placeholder: 'Masih contoh',
  placeholderHint:
    'Isian bertanda "Masih contoh" belum diganti dengan data kelurahan. Situs tidak bisa diluncurkan sebelum semuanya diisi.',
  bookingEnabled: {
    label: 'Pemesanan daring dibuka',
    open: 'Dibuka',
    closed: 'Ditutup',
    note: 'Dibuka otomatis setelah halaman kelola pesanan siap',
  },
  stepUp: {
    title: 'Konfirmasi dengan kode autentikator',
    description: 'Masukkan 6 digit kode dari aplikasi autentikator untuk menyimpan pengaturan ini.',
    confirm: 'Konfirmasi dan simpan',
  },
  rateLimitProfiles: { normal: 'Normal', strict: 'Ketat (saat ada serangan)' },
  invalid: {
    number: 'Isi angka bulat.',
    leadBeforeAdvance:
      'Jarak minimal pemesanan harus lebih pendek dari jarak maksimal pemesanan ke depan.',
    range: (min: number, max: number) => `Isi angka ${String(min)} sampai ${String(max)}.`,
    payoutAccount:
      'Tulis nama bank lalu empat bintang dan 4 digit terakhir, misalnya BCA ****1234.',
  },
  groups: {
    booking: 'Pemesanan',
    channels: 'Kanal pesan dan pembatasan',
    checkin: 'Check-in',
    finance: 'Harga dan data pribadi',
    contact: 'Kontak publik dan privasi',
    documents: 'Dokumen dan SEO',
  },
  fields: {
    whatsappEnabled: { label: 'Kirim pesan WhatsApp' },
    emailEnabled: { label: 'Kirim email' },
    maintenanceMode: {
      label: 'Mode pemeliharaan',
      description: 'Situs menampilkan pemberitahuan pemeliharaan dan pemesanan ditutup.',
    },
    rateLimitProfile: { label: 'Profil pembatasan permintaan' },
    graceBeforeMinutes: { label: 'Tiket boleh dipindai sebelum sesi (menit)' },
    graceAfterMinutes: { label: 'Tiket masih boleh dipindai setelah sesi (menit)' },
    holdMinutesIndividual: { label: 'Kuota ditahan untuk pemesan perorangan (menit)' },
    holdHoursInstitution: { label: 'Kuota ditahan untuk pemesan lembaga (jam)' },
    quotationValidDays: { label: 'Masa berlaku surat penawaran (hari)' },
    minLeadHours: { label: 'Paling lambat memesan sebelum kunjungan (jam)' },
    maxAdvanceDays: { label: 'Paling jauh memesan ke depan (hari)' },
    maxPax: { label: 'Jumlah peserta paling banyak per pemesanan' },
    minPricePerPax: {
      label: 'Harga paling rendah per peserta',
      description: 'Paket yang harganya di bawah angka ini tidak bisa disimpan.',
    },
    piiRetentionMonths: {
      label: 'Lama data kontak pemesan disimpan (bulan)',
      description: 'Setelah itu nama, nomor, dan email pemesan dianonimkan otomatis.',
    },
    expectedPayoutAccountMasked: {
      label: 'Rekening pencairan Midtrans yang diharapkan',
      description: 'Hanya nama bank dan 4 digit terakhir, misalnya BCA ****1234.',
    },
    contactWhatsappNumber: { label: 'Nomor WhatsApp kontak publik' },
    contactEmail: { label: 'Email kontak publik' },
    kelurahanAddress: { label: 'Alamat kantor kelurahan' },
    kopdesWhatsappNumber: {
      label: 'Nomor WhatsApp Koperasi Merah Putih',
      description: 'Pesanan produk UMKM dari halaman produk masuk ke nomor ini. Format +62.',
    },
    kopdesAddress: {
      label: 'Alamat Koperasi Merah Putih',
      description: 'Tempat pengunjung mengambil dan membayar produk UMKM.',
    },
    dpoName: { label: 'Nama Pejabat Pelindungan Data' },
    dpoEmail: { label: 'Email Pejabat Pelindungan Data' },
    signatoryName: { label: 'Nama penanda tangan dokumen' },
    signatoryTitle: { label: 'Jabatan penanda tangan dokumen' },
    certificateTemplateVersion: { label: 'Versi tata letak sertifikat' },
    seoDefaultDescription: { label: 'Deskripsi bawaan untuk mesin pencari' },
  } satisfies Record<EditableSettingName, { label: string; description?: string }>,
} as const;
