import { FINANCE_LIST_LIMIT } from '@/config/finance';
import type { EnumValue } from '@/db/enums';

// /dashboard/finance/adjustments and /dashboard/finance/reconciliation (Task P4.7.03, P4.7.04; docs/Security.md
// REC-01, REC-09, REC-16). The hints of the adjustment RPCs become these messages in finance-errors.ts.

type AdjustmentType = EnumValue<'adjustment_type'>;

export const adjustmentsCopy = {
  title: 'Penyesuaian keuangan',
  description:
    'Pengembalian dana manual, pemindahan bagian bagi hasil, dan penghapusan selisih. Setiap penyesuaian diusulkan dengan bukti, disetujui superadmin lain, lalu diterapkan.',
  types: {
    manual_refund: 'Refund manual',
    reclassify_share: 'Pindah bagian bagi hasil',
    write_off: 'Hapus selisih',
    manual_mark_paid: 'Tandai lunas manual',
    pax_correction: 'Koreksi jumlah peserta',
  } satisfies Record<AdjustmentType, string>,
  propose: 'Usulkan penyesuaian',
  empty: 'Belum ada penyesuaian.',
  emptyHint: 'Usulkan penyesuaian dari kode pemesanannya.',
  columns: {
    proposedAt: 'Diusulkan',
    booking: 'Pemesanan',
    type: 'Jenis',
    amount: 'Jumlah',
    status: 'Status',
    people: 'Pengusul / penyetuju',
    action: 'Tindakan',
  },
  by: (proposer: string, approver: string | null) =>
    approver ? `${proposer} / ${approver}` : `${proposer} / –`,
  lookup: {
    code: 'Kode pemesanan',
    find: 'Cari',
    notFound: 'Pemesanan dengan kode itu tidak ditemukan.',
    summary: (code: string, total: string) => `${code} · total ${total}`,
  },
  fields: {
    type: 'Jenis penyesuaian',
    payment: 'Pembayaran',
    amount: 'Jumlah (Rp)',
    reason: 'Alasan',
    reasonHint: 'Minimal 10 karakter. Alasan dicatat di log audit.',
    line: 'Baris bagi hasil',
    fromKey: 'Dari pihak',
    toKey: 'Ke pihak',
    evidence: 'Bukti (PDF atau foto)',
    weatherLink: 'Refund cuaca untuk',
    weatherLinkHint:
      'Isi bila refund ini menyelesaikan tautan cuaca yang ditahan untuk superadmin.',
  },
  weatherLinkNone: 'Bukan refund cuaca',
  weatherLinkOption: (rw: string, closedAt: string) => `Cuaca ${rw} · jendela ditutup ${closedAt}`,
  paymentOption: (orderId: string, refundable: string) =>
    `${orderId} · bisa dikembalikan ${refundable}`,
  lineOption: (line: string, key: string, amount: string) => `${line} · ${key} · ${amount}`,
  submitPropose: 'Kirim usulan',
  proposed: 'Usulan penyesuaian dikirim. Superadmin lain perlu menyetujuinya.',
  approve: 'Setujui',
  approveTitle: 'Setujui penyesuaian',
  approveDescription:
    'Persetujuan memakai kode autentikator. Jika Anda pengusulnya dan satu-satunya superadmin aktif, penyesuaian baru bisa diterapkan 24 jam kemudian dan Lurah diberi tahu.',
  approved: 'Penyesuaian disetujui.',
  reject: 'Tolak',
  rejectTitle: 'Tolak penyesuaian',
  rejectDescription: 'Tulis alasan penolakan, minimal 10 karakter.',
  rejectReason: 'Alasan penolakan',
  rejected: 'Penyesuaian ditolak.',
  apply: 'Terapkan',
  applyTitle: 'Terapkan penyesuaian',
  applyDescription:
    'Penyesuaian dijalankan sekarang: refund dicatat, bagian dipindah, atau selisih dihapus. Tindakan ini tidak bisa dibatalkan.',
  applied: 'Penyesuaian diterapkan.',
  // Review of PR #80, M-3: a 300 s link to the file, opened in a new tab.
  evidence: {
    view: 'Lihat bukti',
    open: 'Buka bukti',
    expires: (minutes: number) =>
      `Tautan berlaku ${String(minutes)} menit dan setiap pembukaan dicatat.`,
  },
  // Review of PR #80, L-1: releasing an L6 block.
  release: {
    button: 'Lepas blokir refund',
    title: 'Lepas blokir refund Midtrans',
    description:
      'Midtrans mencatat refund penyesuaian ini dengan jumlah lain, sehingga refund berikutnya untuk pembayaran ini diblokir. Lepaskan blokir hanya setelah memeriksa dasbor Midtrans. Sesudahnya, jumlah yang dicatat Midtrans di bawah kunci penyesuaian ini dihitung sudah tercatat dan tidak bisa dicatat lagi; selisihnya dengan jumlah penyesuaian dibuka sebagai temuan rekonsiliasi, untuk diselesaikan lewat penyesuaian baru. Pengusul dan penyetuju penyesuaian ini tidak bisa melepasnya.',
    note: 'Catatan pemeriksaan',
    noteHint: 'Minimal 10 karakter. Catatan disimpan di log audit.',
    submit: 'Lepas blokir',
    done: 'Blokir dilepas. Jumlah yang dicatat Midtrans di bawah kunci ini dihitung sudah tercatat, dan selisihnya dibuka sebagai temuan di Rekonsiliasi.',
    blocked: 'Diblokir: Midtrans mencatat jumlah lain',
  },
  // Review of PR #80, L-5.
  filters: {
    status: 'Status',
    from: 'Diusulkan dari',
    to: 'Diusulkan sampai',
  },
  more: `Hanya ${String(FINANCE_LIST_LIMIT)} penyesuaian terbaru yang ditampilkan. Lebih dari ${String(FINANCE_LIST_LIMIT)}, saring tanggal atau status untuk melihat yang lebih lama.`,
  overtaken:
    'Penyesuaian tidak diterapkan dan kini berstatus ditolak: Midtrans sudah mengembalikan dana permintaan refund ini, jadi transfer bank tidak dicatat lagi. Pengunjung mungkin menerima dana dua kali; ikuti panduan selisih pembayaran untuk meminta kelebihannya kembali.',
  appliesFrom: (date: string) => `Bisa diterapkan mulai ${date}`,
  refundKeyMismatchOf: (adjustmentRef: string) =>
    `Midtrans mencatat refund penyesuaian ${adjustmentRef} (yang sudah diterapkan) dengan jumlah lain. Periksa refund di dasbor Midtrans, lalu lepaskan blokirnya di tabel penyesuaian bila angka Midtrans yang benar.`,
  errors: {
    ADJUSTMENT_TYPE_UNSUPPORTED: 'Jenis penyesuaian ini belum bisa diusulkan di sini.',
    PAYMENT_OPEN:
      'Penanggung jawab masih membuka tautan pembayaran Midtrans yang belum bisa dihentikan. Coba terapkan lagi sebentar lagi.',
    QR_KEY_UNKNOWN:
      'Kunci tanda tangan tiket belum terdaftar, jadi tiket transfer manual ini tidak bisa dibuat. Hubungi pengelola sistem.',
    ADJUSTMENT_OPEN: 'Pemesanan ini sudah punya usulan penyesuaian sejenis yang belum selesai.',
    ADJUSTMENT_STATE: 'Status penyesuaian sudah berubah. Muat ulang halaman.',
    APPROVER_INELIGIBLE:
      'Penyetuju belum memenuhi syarat: akun minimal 7 hari, autentikator terdaftar sebelum usulan dibuat, bukan undangan pengusul dalam 30 hari terakhir, dan masih superadmin aktif.',
    APPLY_TOO_EARLY: 'Penyesuaian ini belum bisa diterapkan; tunggu sampai jeda 24 jam selesai.',
    REFUND_NO_PAYMENT: 'Pembayaran ini tidak bisa dikembalikan dananya.',
    REFUND_TOO_LARGE: 'Jumlah melebihi dana yang masih bisa dikembalikan dari pembayaran ini.',
    SHARE_TOO_LARGE: 'Jumlah melebihi bagian pihak asal pada baris ini.',
    LEDGER_MISSING:
      'Pemesanan ini belum punya entri bagi hasil, jadi refund sebagian belum bisa dicatat. Selesaikan pembagiannya dulu.',
    PROOF_MISSING: 'Bukti belum tersimpan. Unggah ulang lalu coba lagi.',
    PROOF_REUSED:
      'Berkas bukti ini sudah dipakai untuk refund atau penyesuaian lain. Unggah bukti yang sesuai.',
    REFUND_KEY_MISMATCH:
      'Midtrans mencatat refund sebuah penyesuaian yang sudah diterapkan dengan jumlah lain. Periksa refund di dasbor Midtrans, lalu lepaskan blokirnya di tabel penyesuaian bila angka Midtrans yang benar.',
    REFUND_LIST_MISSING:
      'Jawaban terakhir Midtrans tidak merinci refund-nya, padahal ada refund manual yang belum terhitung, jadi refund ini belum bisa dicatat. Coba lagi setelah Midtrans memberi jawaban status yang merinci refund.',
    REFUND_PENDING_AT_MIDTRANS:
      'Pembayaran ini punya permintaan refund pembatalan yang masih diproses Midtrans, dan permintaan itulah yang menentukan. Tunggu hasilnya; transfer bank baru bisa dicatat setelah Midtrans menolak permintaan refund tersebut.',
    REFUND_REQUEST_MISMATCH:
      'Pembayaran ini punya permintaan refund terbuka, dan permintaan itulah yang menentukan: transfer bank hanya bisa dicatat sebesar jumlah permintaan refund tersebut.',
    REFUND_NOT_AT_MIDTRANS:
      'Midtrans belum mencatat refund sebesar itu untuk pembayaran ini. Refund lewat transfer bank dicatat sebagai penyesuaian Refund manual.',
    RELEASE_INELIGIBLE:
      'Pengusul atau penyetuju penyesuaian ini tidak bisa melepas blokirnya. Minta superadmin lain memeriksa dan melepasnya.',
    ALERT_NOT_NOTIFIED:
      'Peringatan selisih ini belum terkirim ke Lurah. Tunggu beberapa menit sampai terkirim, lalu coba lagi.',
    WEATHER_FEE_UNSET_MANUAL:
      'Atur biaya Midtrans; pengembalian dana cuaca berjalan otomatis. Jangan transfer manual.',
  },
} as const;

export const reconciliationCopy = {
  title: 'Rekonsiliasi',
  description:
    'Hasil pencocokan harian antara Midtrans, pemesanan, dan buku besar. Tindak lanjuti setiap temuan, lalu tutup dengan catatan.',
  runsTitle: 'Riwayat pencocokan',
  runsEmpty: 'Belum ada pencocokan yang berjalan.',
  runColumns: {
    date: 'Tanggal',
    source: 'Sumber',
    checked: 'Pembayaran diperiksa',
    issues: 'Temuan',
    chains: 'Rantai audit dan buku besar',
  },
  sources: { nightly: 'Harian', manual: 'Manual', csv_import: 'Impor CSV' } as Record<
    string,
    string
  >,
  chainOk: 'Utuh',
  chainBroken: 'Rusak',
  chainUnknown: 'Belum diperiksa',
  chainTitle: 'Rantai audit dan buku besar',
  chainDescription:
    'Periksa bahwa log audit dan buku besar tidak diubah sejak ditulis. Paling banyak 6 kali per jam.',
  chainCheck: 'Periksa rantai',
  chainResult: (audit: string, ledger: string) => `Log audit: ${audit}. Buku besar: ${ledger}.`,
  chainState: (ok: boolean, checked: number) =>
    ok ? `utuh (${String(checked)} baris)` : `rusak, mulai baris yang ditandai`,
  issuesTitle: 'Temuan terbuka',
  issuesEmpty: 'Tidak ada temuan terbuka.',
  issuesEmptyHint: 'Semua temuan pencocokan sudah ditindaklanjuti.',
  issueTypes: {
    paid_without_tickets: 'Lunas tanpa tiket',
    ticket_without_payment: 'Tiket tanpa pembayaran',
    amount_mismatch: 'Nominal tidak cocok',
    status_disagreement: 'Status berbeda dengan Midtrans',
    pending_beyond_ttl: 'Menunggu pembayaran melewati batas',
    ledger_sum_mismatch: 'Buku besar tidak cocok',
    chain_broken: 'Rantai rusak',
    payout_mismatch: 'Pembayaran bagi hasil tidak cocok',
    duplicate_settlement: 'Pembayaran ganda',
    manual_transfer_unmatched: 'Transfer manual belum dicocokkan dengan rekening koran',
  } as Record<string, string>,
  columns: {
    createdAt: 'Ditemukan',
    type: 'Jenis',
    severity: 'Tingkat',
    booking: 'Pemesanan',
    order: 'Order Midtrans',
    action: 'Tindakan',
  },
  resolve: 'Tutup temuan',
  resolveTitle: 'Tutup temuan',
  resolveDescription:
    'Pilih apakah penyebabnya sudah diperbaiki atau temuan ini cukup dicatat, lalu tulis catatan. Temuan yang ditutup tidak bisa dibuka lagi.',
  resolutions: { resolved: 'Sudah diperbaiki', ignored: 'Dicatat, tidak perlu tindakan' },
  resolution: 'Cara menutup',
  note: 'Catatan',
  noteHint: 'Minimal 5 karakter.',
  resolved: 'Temuan ditutup.',
  recheck: 'Cek status Midtrans',
  recheckTitle: 'Cek status Midtrans',
  recheckDescription:
    'Status terbaru order ini diminta dari Midtrans lalu diterapkan. Paling banyak sekali per menit untuk tiap pembayaran.',
  filters: { from: 'Ditemukan dari', to: 'Ditemukan sampai' },
  more: `Hanya ${String(FINANCE_LIST_LIMIT)} temuan terbuka terbaru yang ditampilkan. Lebih dari ${String(FINANCE_LIST_LIMIT)}, saring tanggal untuk melihat yang lebih lama.`,
  rechecked: {
    applied: 'Status terbaru dari Midtrans sudah diterapkan.',
    unchanged: 'Midtrans memberi status yang sama; tidak ada yang berubah.',
    not_found: 'Midtrans belum punya transaksi untuk order ini.',
  },
  alreadyClosed: 'Temuan ini sudah ditutup.',
} as const;
