import type { StatementProblem } from '@/lib/midtrans/statement-csv';

// The Midtrans statement import (Task P4.7.05), imported where it is used.
const problems: Readonly<Record<StatementProblem, string>> = {
  unreadable: 'Berkas tidak bisa dibaca sebagai CSV: ada tanda kutip yang tidak ditutup.',
  columns:
    'Kolom Order ID, Transaction Status (atau Status) dan Gross Amount (atau Amount) tidak ditemukan.',
  empty: 'Berkas tidak berisi satu pun transaksi.',
  too_many_rows:
    'Berkas berisi lebih dari 5.000 transaksi. Ekspor ulang per periode yang lebih pendek.',
  rows: 'Ada baris dengan Order ID, status atau nominal yang tidak terbaca (nominal harus rupiah utuh).',
  unknown_status:
    'Ada baris dengan status yang tidak dikenal. Status yang diterima: settlement, capture, pending, deny, failure, cancel, expire, refund, partial refund, chargeback, partial chargeback.',
  duplicates: 'Ada Order ID yang muncul lebih dari sekali.',
  too_large:
    'Isi laporan terlalu besar untuk dikirim sekaligus (lebih dari 450 KB setelah dibaca). Ekspor ulang per periode yang lebih pendek.',
};

export const statementCopy = {
  title: 'Impor laporan transaksi Midtrans',
  description:
    'Unggah CSV dari menu Transactions di dashboard Midtrans. Setiap Order ID dibandingkan dengan pembayaran yang tercatat; selisih nominal, status, atau Order ID yang tidak dikenal dicatat sebagai temuan rekonsiliasi. Tidak ada data pembayaran yang diubah.',
  file: 'Berkas CSV',
  fileHint: 'Format .csv, dipisah koma atau titik koma.',
  fileTooLarge: 'Berkas lebih dari 5 MB. Ekspor ulang per periode yang lebih pendek.',
  fileRequired: 'Pilih berkas CSV laporan Midtrans.',
  ready: (count: number) => `${String(count)} transaksi siap dibandingkan.`,
  submit: 'Bandingkan dengan pembayaran',
  invalid: 'Isi laporan tidak sesuai format yang diterima. Periksa berkas lalu coba lagi.',
  rateLimited:
    'Laporan Midtrans paling banyak diimpor 5 kali per jam. Coba lagi nanti; temuan impor sebelumnya tetap tercatat.',
  problems,
  records: (records: readonly number[], more: number) =>
    `Baris ${records.join(', ')}${more > 0 ? ` dan ${String(more)} lainnya` : ''}.`,
  done: (rows: number, issues: number, alreadyOpen: number) => {
    const found =
      issues === 0 && alreadyOpen === 0
        ? `${String(rows)} transaksi diperiksa, semuanya sesuai.`
        : `${String(rows)} transaksi diperiksa, ${String(issues)} temuan baru dicatat.`;
    return alreadyOpen > 0
      ? `${found} ${String(alreadyOpen)} selisih lain sudah tercatat sebagai temuan yang masih terbuka.`
      : found;
  },
  alreadyImported: (rows: number, issues: number) =>
    `Laporan ini sudah diimpor sebelumnya: ${String(rows)} transaksi, ${String(issues)} temuan. Tidak ada yang dicatat ulang.`,
} as const;
