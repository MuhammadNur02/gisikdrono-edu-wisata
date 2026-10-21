// The booking wizard (docs/PRD.md FR-BOOK-01…05), read through copy.booking in src/lib/copy/id.ts.
export const bookingCopy = {
  validation: {
    sessions: 'Pilih satu sesi untuk setiap RW yang dikunjungi, ya.',
    visitDate: 'Pilih tanggal kunjungan yang benar.',
    pax: (max: number) => `Jumlah peserta antara 1 dan ${String(max)} orang.`,
    picName: 'Tulis nama penanggung jawab rombongan.',
    institutionName: 'Tulis nama sekolah, kampus, kantor, atau komunitas Anda.',
    // Decision of 2026-10-21 (docs/PRD.md §13.1 A13): a group from abroad is registered by an officer.
    phone:
      'Gunakan nomor WhatsApp Indonesia, misalnya 0812-3456-7890. Rombongan dari luar negeri bisa menghubungi kelurahan agar didaftarkan petugas.',
    tooLong: (max: number) => `Paling panjang ${String(max)} karakter.`,
    addonLines: (max: number) => `Paling banyak ${String(max)} jenis pesanan tambahan.`,
    addonQuantity: (max: number) => `Jumlah pesanan antara 1 dan ${String(max)}.`,
    addonRepeated: 'Produk ini sudah ada di daftar pesanan. Ubah jumlahnya saja, ya.',
    participantName: 'Nama peserta 2–120 karakter.',
    participants: (max: number) => `Paling banyak ${String(max)} peserta dalam satu daftar.`,
    participantsOverPax:
      'Daftar peserta lebih banyak dari jumlah peserta. Tambah jumlah peserta atau hapus beberapa nama.',
    guardianConsent: 'Centang persetujuan orang tua atau wali untuk daftar peserta ini, ya.',
  },
};
