// /dashboard/users and the profile's contact fields (Task P4.8.02, P4.8.03), imported where they are used.
export const staffCopy = {
  title: 'Pengguna',
  description:
    'Undang petugas, ubah peran, dan nonaktifkan akun. Setiap perubahan meminta kode autentikator yang baru.',
  onlySuper: 'Halaman ini hanya untuk Superadmin Kelurahan.',
  noun: 'pengguna',
  searchPlaceholder: 'Cari nama atau email…',
  empty: 'Belum ada pengguna.',
  emptyHint: 'Undang petugas pertama dengan tombol Undang petugas.',
  you: 'Anda',
  validation: {
    rwRequired: 'Pilih RW untuk admin RW.',
    rwNotAllowed: 'Superadmin Kelurahan tidak terikat pada satu RW.',
  },
  facets: { status: 'Status', rw: 'RW' },
  statuses: { active: 'Aktif', inactive: 'Nonaktif' },
  roles: { superadmin: 'Superadmin Kelurahan', admin_rw: 'Admin RW', none: 'Belum ada peran' },
  columns: {
    name: 'Nama',
    role: 'Peran',
    status: 'Status',
    mfa: 'Autentikator',
    lastSignIn: 'Terakhir masuk',
  },
  mfa: { enrolled: 'Terpasang', missing: 'Belum terpasang' },
  pending: {
    promotion: (after: string) => `Menunggu jadi superadmin, bisa diterapkan setelah ${after}`,
    mfaReset: 'Ada permintaan reset MFA',
  },
  never: 'Belum pernah',
  actions: {
    changeRole: 'Ubah peran',
    deactivate: 'Nonaktifkan',
    reactivate: 'Aktifkan lagi',
    cancelPromotion: 'Batalkan jadi superadmin',
    auditTrail: 'Lihat catatan aktivitas',
  },
  stepUp: {
    hint: 'Tulis kode yang sedang tampil di aplikasi autentikator Anda untuk mengonfirmasi.',
  },
  ownRow: 'Anda tidak bisa mengubah peran atau status akun Anda sendiri.',
  notFresh:
    'Konfirmasi dengan kode autentikator sudah lewat 5 menit atau tidak cocok. Tulis kode yang baru, lalu coba lagi.',
  notFound: 'Akun ini tidak ditemukan. Muat ulang halaman.',
  stateInvalid:
    'Perubahan ini belum bisa diterapkan. Superadmin aktif terakhir tidak bisa diturunkan, dan permintaan jadi superadmin baru bisa diterapkan 24 jam setelah diminta.',
  role: {
    title: (name: string) => `Ubah peran ${name}`,
    description:
      'Petugas akan keluar dari semua perangkat dan masuk lagi dengan peran barunya. Menjadikan superadmin menunggu 24 jam dan memberi tahu kepala kelurahan.',
    field: 'Peran baru',
    rw: 'RW',
    rwPlaceholder: 'Pilih RW',
    submit: 'Ubah peran',
    noFactor: 'Akun ini belum punya autentikator. Pasang ulang lewat kode pemulihan (menyusul).',
    applied: 'Peran sudah diubah.',
    requested: (after: string) =>
      `Permintaan tercatat. Ulangi langkah ini setelah ${after} untuk menerapkannya.`,
  },
  status: {
    deactivateTitle: (name: string) => `Nonaktifkan ${name}`,
    deactivateDescription:
      'Peran dicabut, semua sesi diakhiri, dan autentikator dihapus. Untuk kembali, akun diaktifkan lagi lalu diberi peran.',
    reactivateTitle: (name: string) => `Aktifkan lagi ${name}`,
    reactivateDescription:
      'Akun bisa masuk lagi, tetapi belum punya peran. Beri peran lewat Ubah peran setelahnya.',
    reason: 'Alasan',
    reasonHint: 'Tercatat di catatan aktivitas. Jangan tulis data pribadi.',
    deactivated: 'Akun sudah dinonaktifkan.',
    reactivated: 'Akun sudah aktif lagi.',
    banFailed:
      'Status di dasbor sudah berubah, tetapi blokir masuk di sistem autentikasi belum. Ulangi langkah ini.',
  },
  promotion: {
    title: (name: string) => `Batalkan ${name} jadi superadmin`,
    description: 'Permintaan dihapus dan kepala kelurahan diberi tahu.',
    submit: 'Batalkan permintaan',
    cancelled: 'Permintaan superadmin dibatalkan.',
  },
  invite: {
    open: 'Undang petugas',
    title: 'Undang petugas',
    description:
      'Undangan berlaku 72 jam. Kode undangan tampil sekali saja; sampaikan langsung atau lewat telepon, jangan lewat email atau chat.',
    email: 'Email petugas',
    role: 'Peran',
    rw: 'RW',
    rwPlaceholder: 'Pilih RW',
    submit: 'Buat undangan',
    exists: 'Email ini sudah punya akun atau undangan yang masih berlaku.',
    codeTitle: 'Kode undangan',
    codeWarning:
      'Catat atau sampaikan kode ini sekarang. Setelah jendela ini ditutup, kode tidak bisa dilihat lagi.',
    codeLabel: 'Kode undangan, 20 karakter',
    copy: 'Salin kode',
    copied: 'Kode disalin.',
    expiresAt: (at: string) => `Berlaku sampai ${at}.`,
    superadminWait: (after: string) =>
      `Undangan superadmin baru bisa diterima setelah ${after}. Kepala kelurahan sudah diberi tahu.`,
    done: 'Selesai',
    emailSent:
      'Email undangan sudah dikirim. Tautannya berlaku 10 menit; petugas membukanya, lalu menulis kode di atas.',
    emailFailed: 'Email undangan gagal dikirim. Cabut undangan ini, lalu buat undangan baru.',
  },
  invites: {
    title: 'Undangan terbuka',
    empty: 'Tidak ada undangan yang masih berlaku.',
    email: 'Email',
    role: 'Peran',
    expires: 'Berlaku sampai',
    revoke: 'Cabut',
    revokeTitle: (email: string) => `Cabut undangan untuk ${email}`,
    revokeDescription:
      'Kode undangan tidak bisa dipakai lagi. Undangan yang dicabut tidak bisa dipulihkan; buat undangan baru bila perlu.',
    revoked: 'Undangan dicabut.',
  },
  profile: {
    phone: 'Nomor WhatsApp',
    phoneHint: 'Dipakai Superadmin Kelurahan untuk menghubungi Anda. Boleh dikosongkan.',
    phoneInvalid: 'Tulis nomor Indonesia, misalnya 0812 3456 7890.',
    security: 'Keamanan akun',
    securityHint:
      'Mengganti aplikasi autentikator dilakukan bersama Superadmin Kelurahan, yang memberi kode pemasangan ulang secara langsung.',
  },
} as const;
