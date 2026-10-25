// The booking documents (docs/PRD.md FR-B2B-02, FR-B2B-05; Task P3.6.02, P3.6.03), read through copy.documents in
// src/lib/copy/id.ts. The payment line is the fixed trust copy of docs/StyleGuide.md §9, reused word for word.
export const documentsCopy = {
  letterhead: {
    government: 'Pemerintah Kota Semarang',
    district: 'Kecamatan Semarang Barat',
    kelurahan: 'Kelurahan Gisikdrono',
    programme: 'Edu Center & Edu Wisata Gisikdrono',
  },
  paymentNotice:
    'Pembayaran hanya melalui sistem (QRIS/VA); kelurahan tidak pernah meminta transfer ke rekening pribadi.',
  verify: (url: string) => `Keaslian dokumen ini dapat diperiksa di ${url}`,
  number: 'Nomor',
  issuedAt: 'Tanggal',
  bookingCode: 'Kode reservasi',
  to: 'Kepada Yth.',
  subject: 'Perihal',
  visit: 'Kunjungan',
  sessions: 'Sesi',
  pax: (count: number) => `${String(count)} peserta`,
  table: {
    item: 'Uraian',
    qty: 'Jumlah',
    unitPrice: 'Harga satuan',
    lineTotal: 'Subtotal',
  },
  discount: 'Potongan',
  total: 'Total',
  signedBy: 'Hormat kami,',
  quotation: {
    title: 'Surat Penawaran',
    subject: 'Penawaran paket edu wisata',
    opening: (institution: string, packageName: string) =>
      `Dengan hormat, bersama ini kami sampaikan penawaran paket ${packageName} untuk kunjungan ${institution}, dengan rincian sebagai berikut.`,
    validity: (date: string) => `Penawaran ini berlaku sampai ${date}.`,
    confirm:
      'Untuk memastikan kuota sesi, lakukan Konfirmasi & Bayar melalui tautan reservasi sebelum masa berlaku habis. Surat penawaran tidak memegang kuota sesi.',
    status: {
      superseded: 'DIGANTI VERSI BARU',
      expired: 'KEDALUWARSA',
      void: 'DIBATALKAN',
      accepted: 'DISETUJUI',
    },
    version: (version: number) => `Versi ${String(version)}`,
  },
  invoice: {
    title: 'Invoice',
    creditNoteTitle: 'Nota Kredit',
    billTo: 'Ditagihkan kepada',
    dueDate: 'Jatuh tempo',
    paid: 'LUNAS',
    void: 'BATAL',
    howToPay: 'Cara pembayaran',
    howToPayText:
      'Buka tautan reservasi Anda, pilih Bayar, lalu selesaikan pembayaran dengan QRIS atau Virtual Account sesuai petunjuk di layar. Tagihan dianggap lunas setelah sistem menerima konfirmasi dari Midtrans.',
    paidWith: (method: string) => `Dibayar melalui ${method}`,
    orderId: 'Nomor transaksi',
    creditNoteFor: (invoiceNumber: string) => `Pengembalian atas invoice ${invoiceNumber}`,
    creditNoteAmount: 'Jumlah dikembalikan',
  },
  receipt: {
    title: 'Kwitansi',
    receivedFrom: 'Telah diterima dari',
    amount: 'Sejumlah',
    forPayment: (invoiceNumber: string) => `Untuk pembayaran invoice ${invoiceNumber}`,
    paidAt: 'Tanggal pembayaran',
  },
  // /verifikasi/[code] (docs/PRD.md FR-PUB-20): what a document says of itself, and nothing more.
  verifyPage: {
    title: 'Verifikasi dokumen',
    description:
      'Periksa keaslian surat penawaran atau sertifikat yang diterbitkan Edu Wisata Gisikdrono dengan kode verifikasinya.',
    quotation: 'Surat Penawaran',
    certificate: 'Sertifikat',
    number: 'Nomor',
    institution: 'Instansi',
    recipient: 'Penerima',
    recipientRemoved: 'Nama sudah dihapus sesuai masa simpan data',
    validUntil: 'Berlaku sampai',
    visitDate: 'Tanggal kunjungan',
    version: (version: number) => `Versi ${String(version)}`,
    genuine: 'Dokumen ini diterbitkan oleh sistem Edu Wisata Gisikdrono.',
    rateLimited: 'Terlalu banyak pemeriksaan dari jaringan Anda. Coba lagi beberapa saat lagi, ya.',
    noLongerValid: 'Dokumen ini tidak lagi berlaku; lihat statusnya di atas.',
  },
  // The e-ticket PDF (Task P3.11.05): one page per RW of the visit, no participant names.
  ticket: {
    title: 'E-Tiket Kunjungan',
    fileTitle: (bookingCode: string) => `E-Tiket ${bookingCode}`,
    location: 'Lokasi',
    showAtGate: 'Tunjukkan kode QR ini kepada petugas di pintu masuk.',
    rules: [
      'Tiket berlaku hanya pada tanggal dan sesi yang tertulis.',
      'Satu kode QR berlaku untuk seluruh rombongan pada tiket ini.',
      'Jangan bagikan kode QR ini kepada orang lain.',
      'Pembatalan atau perubahan jadwal melalui halaman reservasi atau WhatsApp kelurahan.',
    ],
    notValid:
      'Tiket ini tidak berlaku, jadi kode QR-nya tidak dicantumkan. Hubungi kelurahan lewat WhatsApp.',
  },
  methods: {
    qris: 'QRIS',
    virtual_account: 'Virtual Account',
    manual_transfer: 'transfer (dicatat petugas)',
    cash: 'tunai (dicatat petugas)',
  },
} as const;
