// The words the booking redesign added (DESIGN-SPEC §2.10, §3.10, §3.12, §3.13): the wizard's header, step links,
// summary and calendar, the pay page's methods and copy buttons, and the ticket's stub and notes. Kept out of
// copy.booking in src/lib/copy/id.ts, which every client island of the dashboard ships, and imported only by the
// booking components (first-load budget, docs/StyleGuide.md §10.1).
export const bookingLayoutCopy = {
  wizard: {
    header: {
      title: 'Pesan kunjungan',
      help: 'Butuh bantuan?',
      helpLabel: 'Butuh bantuan? Chat WhatsApp kelurahan',
      greeting: (packageName: string) =>
        `Halo, saya butuh bantuan memesan kunjungan ${packageName} di Gisikdrono.`,
      exit: 'Tutup pemesanan dan kembali ke halaman paket',
      back: 'Kembali ke halaman paket',
    },
    backTo: (stepLabel: string) => `Kembali ke ${stepLabel.toLowerCase()}`,
    backToPackage: 'Kembali ke paket',
    nextTo: (stepLabel: string) => `Lanjut ke ${stepLabel.toLowerCase()}`,
    // The order as it stands, beside the steps (Wizard Summary).
    aside: {
      label: 'Ringkasan pemesanan',
      date: 'Tanggal',
      session: 'Sesi',
      pax: 'Peserta',
      addons: 'Tambahan',
      notChosen: 'Belum dipilih',
      noAddons: 'Belum ada',
      addonCount: (count: number) => `${String(count)} produk`,
      estimate: 'Perkiraan total',
      estimateLater: 'Dihitung di langkah Tambahan',
      note: 'Total pasti dihitung sistem di langkah Ringkasan.',
      total: 'Total',
      totalNote: 'Dihitung oleh sistem. Sudah termasuk produk tambahan.',
      trust:
        'Kuota sesi belum dipegang sampai Anda menekan Konfirmasi & Bayar di langkah Ringkasan.',
    },
    schedule: {
      description:
        'Sesi yang sisa kuotanya kurang dari jumlah peserta tidak bisa dipilih. Sisa kuota diperbarui otomatis.',
      sessionsOn: (date: string) => `Sesi pada ${date}`,
      legend: { open: 'Tersedia', busy: 'Hampir penuh', full: 'Penuh', closed: 'Tutup' },
      daySeats: (seats: number) => `${String(seats)} kursi`,
    },
    booker: {
      description:
        'Kami hanya menyimpan kontak penanggung jawab rombongan, untuk mengirim kode verifikasi, tiket, dan kabar reservasi.',
      identityTitle: 'Identitas rombongan',
    },
    summary: {
      description:
        'Pastikan semuanya benar. Kuota sesi baru dipegang setelah Anda menekan Konfirmasi & Bayar.',
      visitDate: 'Tanggal',
      paxLabel: 'Peserta',
      products: 'Produk',
      picName: 'Nama',
      phone: 'WhatsApp',
      email: 'Email',
      priceNote:
        'Dihitung oleh sistem dari harga yang berlaku hari ini. Jika harga berubah sebelum Anda membayar, ringkasan ini diperbarui.',
      payWith: 'Bayar dengan',
      // The methods Snap offers (CLAUDE.md §7.2 enabled_payments), named as a visitor knows them.
      payMethods: ['QRIS', 'VA BCA', 'VA BNI', 'VA BRI', 'VA Permata', 'VA CIMB', 'VA lainnya'],
    },
  },
  payment: {
    bookingOf: (bookingCode: string) => `Reservasi ${bookingCode}`,
    // The visitor picks one on Midtrans' page.
    methods: {
      title: 'Metode yang tersedia',
      qris: 'QRIS',
      qrisHint: 'Pindai dengan aplikasi m-banking atau dompet digital apa pun.',
      virtualAccount: 'Virtual Account',
      virtualAccountHint: 'Bayar dari ATM, m-banking, atau internet banking.',
      banks: ['BCA', 'BNI', 'BRI', 'Permata', 'CIMB', 'Bank lain'],
      secure:
        'Anda memilih metode di halaman pembayaran Midtrans yang aman. Kami tidak menyimpan data akun bank Anda.',
    },
    amountDue: 'Jumlah yang harus dibayar',
    copy: 'Salin',
    copied: 'Disalin',
    copyFailed: 'Gagal menyalin. Salin manual, ya.',
  },
  ticket: {
    stub: 'Tiket rombongan',
    gate: 'Gerbang',
    showQr: 'Tunjukkan QR ini kepada petugas',
    ready: 'Pembayaran diterima. Tiket rombongan Anda siap.',
    readySent: 'Tiket juga sudah dikirim ke WhatsApp dan email penanggung jawab.',
    paid: 'Lunas',
    dayOf: {
      title: 'Saat hari kunjungan',
      items: [
        'Tunjukkan tiket QR kepada petugas di gerbang RW.',
        'Satu tiket berlaku untuk seluruh rombongan pada sesi ini.',
      ],
    },
  },
};
