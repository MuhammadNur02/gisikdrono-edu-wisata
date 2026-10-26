import type { DsrOutcome, DsrRequestType, DsrStatus } from '@/types/dsr';

// Data-subject requests (Task P4.10.03): the superadmin's queue on /dashboard/bookings/[id] and the guest's page
// /reservasi/<code>/privasi. Indonesian, as every surface the guest or staff reads (CLAUDE.md §4 no. 14).

const REQUEST_TYPES: Record<DsrRequestType, string> = {
  access: 'Akses data',
  rectification: 'Perbaikan data',
  erasure: 'Penghapusan data',
  restriction: 'Pembatasan pemrosesan',
  withdraw_consent: 'Penarikan persetujuan',
};

const STATUSES: Record<DsrStatus, string> = {
  received: 'Diterima',
  in_progress: 'Diproses',
  completed: 'Selesai',
  rejected: 'Ditolak',
};

const OUTCOMES: Record<DsrOutcome, string> = {
  exported: 'Data dikirim',
  participants_deleted: 'Daftar peserta dihapus',
  anonymised: 'Data pemesan dianonimkan',
  rectified: 'Data diperbaiki',
  rejected_identity: 'Ditolak: identitas tidak dikonfirmasi',
  rejected_other: 'Ditolak',
};

// The basis on which the invoices and their files stay after an erasure, stated to the guest (PRD §13.1, 2026-10-26).
const FINANCIAL_RETENTION =
  'Faktur, kuitansi, nota kredit, dan surat penawaran tetap disimpan selama 10 tahun karena kewajiban pencatatan keuangan.';

export const dsrCopy = {
  requestTypes: REQUEST_TYPES,
  statuses: STATUSES,
  outcomes: OUTCOMES,
  financialRetention: FINANCIAL_RETENTION,
  staff: {
    title: 'Permintaan data',
    description:
      'Permintaan data pribadi atas pemesanan ini. Tamu mengonfirmasi lewat nomor WhatsApp terverifikasi; batas tanggapan 3 × 24 jam dan penyelesaian 14 hari sejak konfirmasi.',
    empty: 'Belum ada permintaan data untuk pemesanan ini.',
    open: 'Catat permintaan',
    openTitle: 'Catat permintaan data',
    openDescription:
      'Untuk permintaan yang masuk lewat email atau telepon. Tamu menerima tautan di WhatsApp terverifikasi dan harus mengonfirmasi dengan kode sebelum permintaan dihitung.',
    requestType: 'Jenis permintaan',
    reason: 'Isi permintaan',
    reasonHint: 'Apa yang diminta tamu dan lewat mana permintaan masuk. 10–2.000 karakter.',
    submitOpen: 'Catat dan kirim konfirmasi',
    opened: 'Permintaan dicatat. Tamu diminta mengonfirmasi lewat WhatsApp.',
    openedNotNotified:
      'Permintaan dicatat, tetapi pesan WhatsApp belum bisa dikirim. Minta tamu membuka tautan pemesanannya.',
    awaitingIdentity: 'Menunggu konfirmasi tamu',
    createdAt: (at: string) => `Dicatat ${at}`,
    confirmedAt: (at: string) => `Dikonfirmasi tamu ${at}`,
    guestMessage: 'Isi permintaan',
    steps: 'Langkah',
    acknowledgeBy: (at: string) => `Tanggapi paling lambat ${at}`,
    fulfilBy: (at: string) => `Selesaikan paling lambat ${at}`,
    handledAt: (at: string) => `Ditangani ${at}`,
    acknowledge: 'Tanggapi',
    acknowledged: 'Permintaan ditanggapi.',
    export: 'Kirim data ke tamu',
    exportDescription:
      'Data pemesanan disusun sebagai JSON dan PDF, lalu dikirim ke tamu sebagai tautan di WhatsApp terverifikasi. Anda tidak mengunduh atau meneruskannya.',
    deleteParticipants: 'Hapus daftar peserta',
    deleteParticipantsDescription:
      'Nama peserta dan sertifikat peserta pemesanan ini dihapus. Langkah ini tidak bisa dibatalkan.',
    anonymise: 'Anonimkan pemesanan',
    anonymiseDescription: `Kontak, catatan, peserta, dan sertifikat yang memuat nama dihapus, dan semua tautan tamu dicabut. ${FINANCIAL_RETENTION} Langkah ini tidak bisa dibatalkan.`,
    close: 'Tutup permintaan',
    closeDescription:
      'Untuk perbaikan data yang sudah dikerjakan lewat pengeditan biasa, atau untuk menolak permintaan.',
    outcome: 'Hasil',
    note: 'Catatan penyelesaian',
    noteHint: 'Dasar hukum dan apa yang dilakukan. Tamu membaca catatan ini. 10–2.000 karakter.',
    done: 'Permintaan diselesaikan.',
    doneNotNotified: 'Permintaan diselesaikan, tetapi pesan ke tamu belum bisa dikirim.',
    stateInvalid: 'Permintaan ini tidak sedang pada langkah itu. Muat ulang halaman.',
    noVerifiedPhone:
      'Pemesanan ini tidak punya nomor WhatsApp terverifikasi, jadi tamu tidak bisa mengonfirmasi permintaan.',
  },
  guest: {
    title: 'Permintaan data pribadi',
    description:
      'Permintaan terkait data pribadi pemesanan ini, yang dicatat Kelurahan Gisikdrono atas nama Anda.',
    empty: 'Tidak ada permintaan data untuk pemesanan ini.',
    confirmTitle: 'Konfirmasi permintaan',
    confirmDescription:
      'Kami kirim kode 6 angka ke nomor WhatsApp pemesanan ini. Permintaan baru diproses setelah Anda memasukkan kode itu.',
    sendCode: 'Kirim kode',
    codeSent: 'Kode sudah dikirim ke WhatsApp. Masukkan kodenya di bawah.',
    code: 'Kode dari WhatsApp',
    confirm: 'Konfirmasi',
    confirmed: 'Terima kasih. Permintaan Anda sudah dikonfirmasi dan akan diproses.',
    wrongCode: 'Kode tidak cocok. Periksa lagi pesan WhatsApp Anda.',
    lockedCode: 'Terlalu banyak kode salah. Minta kode baru.',
    expiredCode: 'Kode sudah tidak berlaku. Minta kode baru.',
    limited: 'Kode belum bisa dikirim sekarang. Coba lagi beberapa menit lagi.',
    captchaFailed: 'Pemeriksaan keamanan belum berhasil. Coba lagi, ya.',
    unavailable: 'WhatsApp sedang tidak tersedia. Hubungi kelurahan untuk melanjutkan.',
    needsManage: 'Untuk mengonfirmasi, buka tautan terbaru yang dikirim ke WhatsApp pemesanan ini.',
    fulfilBy: (at: string) => `Diselesaikan paling lambat ${at}`,
    download: 'Unduh data Anda',
    downloadJson: 'Unduh JSON',
    downloadPdf: 'Unduh PDF',
    downloadFailed: 'Berkas belum bisa diunduh. Coba lagi sebentar lagi.',
  },
  validation: {
    reason: 'Tulis isi permintaan, 10–2.000 karakter.',
    note: 'Tulis catatan penyelesaian, 10–2.000 karakter.',
  },
  export: {
    title: 'Data pribadi Anda',
    subtitle: (code: string) => `Pemesanan ${code}`,
    generatedAt: (at: string) => `Disusun ${at}`,
    booker: 'Pemesan',
    visit: 'Kunjungan',
    participants: 'Peserta',
    payments: 'Pembayaran',
    documents: 'Dokumen keuangan',
    none: 'Tidak ada',
    footer:
      'Disusun oleh Kelurahan Gisikdrono atas permintaan akses data pribadi (UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi).',
  },
} as const;
