import type { EnumValue } from '@/db/enums';

// /dashboard/finance and /dashboard/finance/revenue-share (Task P4.7.01, P4.7.02; docs/PRD.md FR-ADMIN-18..20).
// Hints the finance RPCs raise are turned into these messages by finance-errors.ts (FINANCE_REFUSAL_HINTS).

type Beneficiary = EnumValue<'revenue_beneficiary'>;
type RuleScope = EnumValue<'revenue_rule_scope'>;

export const financeCopy = {
  onlySuper: 'Halaman keuangan hanya untuk Superadmin Kelurahan.',
  period: {
    from: 'Dari tanggal',
    to: 'Sampai tanggal',
    invalid: 'Periode tidak valid. Pilih tanggal awal sebelum tanggal akhir, paling lama 12 bulan.',
  },
  recap: {
    title: 'Rekap keuangan',
    description:
      'Pembayaran yang lunas, dana yang dikembalikan, dan bagian setiap pihak, dibaca langsung dari buku besar.',
    gross: 'Pembayaran lunas',
    grossHint: (count: number) => `${String(count)} pembayaran dalam periode`,
    refunds: 'Dana dikembalikan',
    refundsHint: 'Refund yang sudah dicatat',
    net: 'Bersih',
    netHint: 'Lunas dikurangi refund',
    methods: 'Metode pembayaran',
    methodsHint: (qris: number, va: number) =>
      `QRIS ${String(qris)} · Virtual Account ${String(va)}`,
    chartTitle: 'Pendapatan bersih per hari',
    chartDescription: 'Pembayaran lunas dikurangi refund, per hari Semarang.',
    chartSeries: 'Bersih',
    chartSummary: (days: number) => `Grafik pendapatan bersih selama ${String(days)} hari.`,
    chartEmpty: {
      title: 'Belum ada pembayaran',
      description: 'Tidak ada pembayaran lunas dalam periode ini.',
    },
    invariantOk: (bookings: number) =>
      `Buku besar cocok: ${String(bookings)} pemesanan yang lunas dalam periode ini tercatat utuh.`,
    invariantBroken: (mismatched: number) =>
      `${String(mismatched)} pemesanan belum cocok dengan buku besar. Periksa di Rekonsiliasi atau Penyesuaian.`,
    invariantLines: {
      label: 'Rincian kecocokan buku besar',
      weatherRefundFees: 'Biaya Midtrans refund cuaca',
      expected: 'Seharusnya di buku besar',
      expectedHint: 'Lunas dikurangi refund dan biaya Midtrans refund cuaca',
      ledger: 'Tercatat di buku besar',
    },
    partiesTitle: 'Saldo per pihak',
    partiesDescription:
      'Yang menjadi hak setiap pihak, yang sudah dibayarkan, dan sisanya. Bagian periode dihitung dari buku besar.',
    columns: {
      party: 'Pihak',
      period: 'Bagian periode',
      accrued: 'Total hak',
      paidOut: 'Sudah dibayar',
      outstanding: 'Belum dibayar',
    },
    partiesEmpty: 'Belum ada entri buku besar.',
  },
  rwRecap: {
    description:
      'Bagian kas RW Anda dan UMKM di RW Anda, dibaca langsung dari buku besar. Halaman ini hanya untuk dilihat.',
    net: 'Bagian bersih periode ini',
    netHint: 'Kas RW dan UMKM, setelah koreksi',
    settled: 'Dibukukan',
    settledHint: 'Bagian dari pembayaran lunas',
    reversed: 'Dikoreksi',
    reversedHint: 'Pengurangan karena refund',
    outstanding: 'Belum dibayar',
    outstandingHint: 'Sisa hak yang belum disalurkan, seluruh waktu',
    chartDescription: 'Bagian bersih kas RW dan UMKM per hari Semarang.',
  },
  parties: {
    kelurahan: 'Kelurahan Gisikdrono',
    rw: (rw: string) => `Kas ${rw}`,
    vendor: (name: string) => `UMKM ${name}`,
    unknown: 'Pihak tidak dikenal',
  },
  beneficiaries: {
    kelurahan: 'Kelurahan',
    rw_treasury: 'Kas RW',
    umkm_vendor: 'UMKM',
  } satisfies Record<Beneficiary, string>,
  rules: {
    title: 'Bagi hasil',
    description:
      'Aturan pembagian pendapatan per paket dan produk. Aturan tidak diubah: setiap perubahan menjadi versi baru yang berlaku mulai tanggal yang dipilih, dan versi lama ditutup sehari sebelumnya.',
    scopes: {
      package_default: 'Bawaan paket',
      addon_default: 'Bawaan produk tambahan',
      package: 'Paket tertentu',
      product: 'Produk tertentu',
    } satisfies Record<RuleScope, string>,
    combo: 'Paket kombinasi',
    allRws: 'Semua RW',
    inForce: 'Berlaku',
    upcoming: 'Akan berlaku',
    closed: 'Ditutup',
    from: (date: string) => `Mulai ${date}`,
    until: (date: string) => `sampai ${date}`,
    listTitle: 'Aturan dan riwayat versi',
    empty: 'Belum ada aturan bagi hasil.',
    newVersion: 'Versi baru',
    dialogTitle: 'Versi baru aturan bagi hasil',
    dialogDescription:
      'Isi bagian setiap pihak sampai berjumlah 100 %. Versi baru paling cepat berlaku hari ini, atau besok jika sudah ada versi yang berlaku.',
    fields: {
      scope: 'Berlaku untuk',
      rw: 'RW',
      package: 'Paket',
      product: 'Produk',
      name: 'Nama aturan',
      effectiveFrom: 'Berlaku mulai',
      lines: 'Pembagian',
      beneficiary: 'Pihak',
      vendor: 'UMKM',
      pct: 'Bagian (%)',
    },
    placeholders: {
      choose: 'Pilih',
      ownRws: 'RW dari tiap kunjungan',
    },
    addLine: 'Tambah pihak',
    removeLine: 'Hapus baris',
    total: (pct: string) => `Jumlah: ${pct} %`,
    totalMustBe: 'Jumlah semua bagian harus tepat 100 %.',
    submit: 'Simpan versi baru',
    saved: 'Versi baru aturan bagi hasil disimpan.',
    errors: {
      RULE_LINES_INVALID:
        'Bagian setiap pihak harus di atas 0 dan paling banyak 100 dengan dua desimal, berjumlah 100 %, dan sesuai pihaknya.',
      RULE_START_INVALID:
        'Tanggal mulai tidak bisa sebelum hari ini, dan untuk aturan yang sedang berlaku paling cepat besok.',
      RULE_OVERLAP: 'Sudah ada versi aturan ini yang mulai pada tanggal itu atau sesudahnya.',
      RULE_TARGET_INVALID: 'Pilih paket atau produk yang berlaku untuk aturan ini.',
    },
  },
  payouts: {
    title: 'Pembayaran bagi hasil',
    description:
      'Catat transfer bagi hasil ke kelurahan, kas RW, atau UMKM. Entri buku besar dalam periode ditandai lunas dengan bukti transfer.',
    record: 'Catat pembayaran',
    dialogTitle: 'Catat pembayaran bagi hasil',
    dialogDescription:
      'Pastikan rekening penerima pembayaran Midtrans di dasbor Midtrans sama dengan rekening yang diharapkan sebelum mencatat.',
    empty: 'Belum ada pembayaran bagi hasil yang dicatat.',
    fields: {
      party: 'Penerima',
      from: 'Entri dari tanggal',
      to: 'Entri sampai tanggal',
      reference: 'Nomor referensi transfer',
      accountDigits: '4 digit terakhir rekening payout di dasbor Midtrans',
      transferredAmount: 'Jumlah yang ditransfer (Rp)',
      transferredAmountHint: 'Ketik jumlah dari bukti transfer; harus sama dengan jumlah di atas.',
      proof: 'Bukti transfer (PDF atau foto)',
    },
    columns: {
      party: 'Penerima',
      period: 'Periode',
      amount: 'Jumlah',
      reference: 'Referensi',
      paidAt: 'Dicatat',
      proof: 'Bukti',
    },
    // Review of PR #80, M-2: the figure the database counts for the period, which the transfer must equal.
    preview: {
      loading: 'Menghitung bagian periode dari buku besar…',
      choose: 'Pilih penerima untuk melihat jumlah yang harus ditransfer.',
      total: (amount: string, entries: number) =>
        `Jumlah yang harus ditransfer: ${amount} (${String(entries)} entri buku besar). Catat setelah transfer sebesar ini.`,
      nothing: 'Tidak ada entri yang belum dibayar dalam periode ini.',
      invalid:
        'Pilih periode yang sudah lewat (tanggal akhir paling lambat kemarin), tanggal awal sebelum tanggal akhir.',
      negativePending: (day: string) =>
        `Ada saldo minus sejak ${day} yang belum dibayar; mulai periode dari tanggal itu. Jangan transfer dulu.`,
    },
    submit: 'Catat pembayaran',
    saved: (amount: string) =>
      `Pembayaran ${amount} dicatat dan entri buku besarnya ditandai lunas.`,
    errors: {
      PAYOUT_EMPTY: 'Tidak ada entri yang belum dibayar untuk penerima ini dalam periode tersebut.',
      PAYOUT_NEGATIVE_PENDING:
        'Penerima ini masih punya entri negatif yang belum dibayar sebelum tanggal awal periode. Mulai periode dari tanggal entri tertua yang belum dibayar agar entri itu ikut diperhitungkan.',
      FUTURE_DAY:
        'Pembayaran hanya untuk hari yang sudah lewat; tanggal akhir paling lambat kemarin, karena buku besar hari ini masih bisa bertambah.',
      PAYOUT_TOTAL_MISMATCH:
        'Total bagian periode ini menurut buku besar tidak sama dengan jumlah yang Anda transfer. Periksa pratinjau, lalu catat pembayaran sebesar yang benar-benar ditransfer.',
      TRANSFER_MISMATCH:
        'Jumlah yang Anda ketik tidak sama dengan jumlah yang harus ditransfer untuk periode ini. Periksa bukti transfer; jangan catat pembayaran yang jumlahnya berbeda.',
      ACCOUNT_MISMATCH:
        'Rekening payout di dasbor Midtrans tidak sama dengan rekening yang diharapkan. Jangan lanjutkan; periksa akun Midtrans bersama Lurah.',
      ACCOUNT_UNSET:
        'Rekening payout yang diharapkan belum diisi di Pengaturan, jadi pembayaran belum bisa dicatat.',
    },
  },
  account: {
    expected: (masked: string) =>
      `Rekening payout Midtrans yang diharapkan: ${masked}. Cocokkan dengan dasbor Midtrans sebelum mencatat pembayaran.`,
    unset:
      'Rekening payout Midtrans yang diharapkan belum diisi. Isi di Pengaturan sebelum mencatat pembayaran (PAY-16).',
  },
  upload: {
    choose: 'Pilih berkas',
    uploading: 'Mengunggah…',
    uploaded: (name: string) => `Terunggah: ${name}`,
    required: 'Unggah bukti terlebih dahulu.',
  },
} as const;
