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
  duplicates: 'Ada Order ID yang muncul lebih dari sekali.',
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
  problems,
  records: (records: readonly number[], more: number) =>
    `Baris ${records.join(', ')}${more > 0 ? ` dan ${String(more)} lainnya` : ''}.`,
  done: (rows: number, issues: number) =>
    issues === 0
      ? `${String(rows)} transaksi diperiksa, semuanya sesuai.`
      : `${String(rows)} transaksi diperiksa, ${String(issues)} temuan dicatat.`,
} as const;
