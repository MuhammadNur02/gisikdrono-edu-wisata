// The superadmin's bank accounts of UMKM vendors and RW treasuries (Task P4.3.06), imported directly by the vendor
// sheet and the settings page (admin first-load budget).

export const bankAccountsCopy = {
  title: 'Rekening bank',
  vendorHint:
    'Rekening pembayaran bagi hasil UMKM ini. Hanya superadmin yang melihat dan mengubahnya.',
  rwTitle: 'Rekening kas RW',
  rwDescription:
    'Rekening tujuan bagi hasil tiap RW. Nomor rekening tampil tersamar; membukanya dicatat dengan alasan Anda.',
  rwEmpty: 'Belum ada RW terdaftar.',
  bankName: 'Nama bank',
  accountNumber: 'Nomor rekening',
  accountHolder: 'Nama pemilik rekening',
  notSet: 'Belum diisi',
  loading: 'Memuat rekening…',
  unavailable: 'Belum tersedia',
  unavailableHint: 'Rekening ini gagal dimuat. Muat ulang halaman untuk mencoba lagi.',
  reveal: 'Tampilkan nomor',
  hide: 'Sembunyikan nomor',
  revealReason: 'Alasan membuka nomor rekening',
  revealHint:
    'Tiga sampai 300 karakter. Setiap pembukaan tercatat di log audit, dengan batas 20 kali per hari.',
  revealSubmit: 'Tampilkan',
  revealedNote: 'Nomor ini tampil 5 menit, lalu disembunyikan lagi.',
  edit: 'Ubah rekening',
  editTitle: (owner: string) => `Ubah rekening ${owner}`,
  editHint:
    'Perubahan rekening kas RW dikirim sebagai peringatan keamanan ke superadmin. Periksa nomornya dua kali.',
  save: 'Simpan rekening',
  saved: 'Rekening tersimpan.',
  cancel: 'Batal',
  validation: {
    bankName: 'Tulis nama bank, 2 sampai 60 karakter.',
    accountNumber: 'Nomor rekening berisi 5 sampai 20 angka, tanpa spasi atau tanda baca.',
    accountHolder: 'Tulis nama pemilik rekening, 2 sampai 120 karakter.',
    reason: 'Tulis alasan, 3 sampai 300 karakter.',
  },
  rateLimited: 'Batas harian membuka nomor rekening (20 kali) sudah tercapai. Coba lagi besok.',
} as const;
