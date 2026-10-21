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
  // The WhatsApp code of the booking form (Task P3.2.03) and its email fallback while WhatsApp is limited.
  otp: {
    phoneLabel: 'Nomor WhatsApp penanggung jawab',
    phoneHint: 'Kode verifikasi 6 angka dikirim lewat WhatsApp ke nomor ini.',
    emailLabel: 'Email penanggung jawab',
    send: 'Kirim kode',
    sendEmail: 'Kirim kode ke email',
    resend: 'Kirim ulang kode',
    resendIn: (seconds: number) => `Kirim ulang dalam ${String(seconds)} detik`,
    codeLabel: 'Kode verifikasi',
    codeFormat: 'Kode terdiri dari 6 angka.',
    verify: 'Verifikasi',
    changeContact: 'Ganti nomor',
    sentWhatsapp: 'Kode sudah dikirim ke WhatsApp Anda dan berlaku 5 menit.',
    sentEmail: 'Kode sudah dikirim ke email Anda dan berlaku 5 menit. Periksa juga folder spam.',
    verifiedWhatsapp: 'Nomor WhatsApp sudah terverifikasi.',
    verifiedEmail: 'Email sudah terverifikasi. Kabar reservasi akan kami kirim lewat email.',
    degradedTitle: 'Verifikasi lewat email dulu, ya',
    degraded:
      'Pengiriman kode WhatsApp sedang dibatasi. Kami kirim kode ke email Anda sebagai gantinya; selesaikan juga pemeriksaan keamanan di bawah.',
    unavailable:
      'Kode lewat email hanya dipakai saat WhatsApp sedang dibatasi. Minta kode lewat WhatsApp, ya.',
    cooldown: (seconds: number) => `Tunggu ${String(seconds)} detik sebelum meminta kode baru.`,
    limited:
      'Kode untuk nomor atau email ini sudah terlalu sering diminta hari ini. Coba lagi besok, atau hubungi kelurahan.',
    wrongCode: (attemptsLeft: number) =>
      `Kodenya belum cocok. Sisa ${String(attemptsLeft)} kali percobaan.`,
    locked: 'Kode ini sudah salah lima kali sehingga tidak berlaku lagi. Minta kode baru, ya.',
    expired: 'Kode sudah kedaluwarsa. Minta kode baru, ya.',
    invalid: 'Kode ini sudah tidak berlaku. Minta kode baru, ya.',
    captchaFailed: 'Pemeriksaan keamanan belum berhasil. Coba lagi, ya.',
  },
  // /reservasi/cari (docs/PRD.md FR-BOOK-16): the answer is the same whether or not anything matched.
  lookup: {
    title: 'Cari reservasi',
    description:
      'Masukkan kode reservasi dan nomor WhatsApp atau email yang dipakai saat memesan. Tautan reservasi akan kami kirim ulang ke kontak itu.',
    codeLabel: 'Kode reservasi',
    codeHint: 'Contoh: GSK-7F3K9Q2M',
    contactLabel: 'Nomor WhatsApp atau email',
    submit: 'Kirim ulang tautan',
    sentTitle: 'Permintaan sudah kami terima',
    sent: 'Jika kode dan kontaknya cocok dengan reservasi kami, tautan sudah dikirim ulang ke WhatsApp atau email yang terdaftar. Belum ada dalam beberapa menit? Periksa folder spam atau hubungi kelurahan.',
    again: 'Cari reservasi lain',
    invalidCode: 'Kode reservasi diawali GSK- lalu 8 huruf atau angka.',
    invalidContact: 'Tulis nomor WhatsApp atau email yang dipakai saat memesan.',
  },
};
