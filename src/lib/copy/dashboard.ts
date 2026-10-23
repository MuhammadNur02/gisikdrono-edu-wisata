// The dashboard shell (Task P2.8.03, final in P4.1.01) and the DataTable family (P4.3.01), read through copy.dashboard
// in src/lib/copy/id.ts.
export const dashboardCopy = {
  navLabel: 'Menu dasbor',
  openMenu: 'Buka menu dasbor',
  toggleSidebar: 'Buka atau tutup bilah sisi',
  menuDescription: 'Semua halaman dasbor yang bisa Anda buka.',
  homeLink: 'Edu Wisata Gisikdrono, ke dasbor',
  kelurahan: 'Kelurahan',
  roles: {
    superadmin: 'Superadmin Kelurahan',
    adminRw: (rw: string) => `Admin ${rw}`,
  },
  rwSwitcher: {
    label: 'Tampilkan data',
    all: 'Semua',
  },
  topbar: {
    scanTicket: 'Scan Tiket',
    breadcrumb: 'Lokasi halaman',
    // Path segments that are not a menu item: /new, /edit.
    segments: { new: 'Baru', edit: 'Ubah' },
  },
  userMenu: {
    label: 'Menu akun',
    profile: 'Profil',
    theme: 'Tampilan',
    themes: { light: 'Terang', dark: 'Gelap', system: 'Ikuti sistem' },
  },
  commandMenu: {
    open: 'Cari menu',
    shortcut: 'Ctrl+K',
    quickActions: 'Tindakan cepat',
    openScanner: 'Buka scanner',
    todaySessions: 'Sesi hari ini',
    findBooking: (code: string) => `Cari reservasi ${code}`,
  },
  quickScanner: {
    scan: 'Scan',
    manualCode: 'Kode pemesanan',
    fullScanner: 'Buka scanner penuh',
  },
  idleLock: {
    title: 'Dasbor terkunci',
    description:
      'Tidak ada aktivitas selama 10 menit, jadi layar dikunci. Tulis kode autentikator Anda untuk melanjutkan.',
    unlock: 'Lanjutkan',
  },
  // A critical action asks for a code from the last five minutes (docs/Security.md AUTH-11).
  stepUp: {
    title: 'Konfirmasi dengan kode autentikator',
    description: 'Langkah ini butuh kode autentikator yang baru, demi keamanan.',
    submit: 'Konfirmasi',
    verified: 'Kode diterima. Silakan lanjutkan.',
  },
  home: {
    title: 'Dasbor',
    signedInAs: (role: string) => `Anda masuk sebagai ${role}.`,
    profileTitle: 'Profil Anda',
    profileDescription: 'Periksa nama yang tampil di dasbor dan pada catatan aktivitas.',
    profileLink: 'Buka profil',
  },
  profile: {
    title: 'Profil',
    description: 'Nama ini tampil di dasbor dan pada catatan aktivitas Anda.',
    fullName: 'Nama lengkap',
    email: 'Email',
    emailHint: 'Email dipakai untuk masuk dan hanya bisa diganti oleh Superadmin Kelurahan.',
    role: 'Peran',
    save: 'Simpan profil',
    saved: 'Profil tersimpan.',
  },
  error: {
    back: 'Kembali ke dasbor',
  },
  // docs/StyleGuide.md §6.4.
  table: {
    search: 'Cari',
    searchPlaceholder: 'Cari…',
    reset: 'Hapus filter',
    columns: 'Kolom',
    columnsLabel: 'Tampilkan kolom',
    filter: (name: string) => `Saring ${name}`,
    selectedCount: (count: number) => `${String(count)} dipilih`,
    clearFilter: 'Hapus',
    noOptions: 'Tidak ada pilihan.',
    rowActions: 'Aksi baris',
    selectAll: 'Pilih semua baris di halaman ini',
    selectRow: 'Pilih baris',
    bulkSelected: (count: number) => `${String(count)} baris dipilih`,
    clearSelection: 'Batalkan pilihan',
    showing: (from: number, to: number, total: number) =>
      `Menampilkan ${String(from)}–${String(to)} dari ${String(total)}`,
    perPage: 'Baris per halaman',
    firstPage: 'Halaman pertama',
    previousPage: 'Halaman sebelumnya',
    nextPage: 'Halaman berikutnya',
    lastPage: 'Halaman terakhir',
    page: (page: number, total: number) => `Halaman ${String(page)} dari ${String(total)}`,
    sortAscending: 'Urutkan naik',
    sortDescending: 'Urutkan turun',
    sortNone: 'Hapus urutan',
    sortedAscending: 'diurutkan naik',
    sortedDescending: 'diurutkan turun',
    filterEmpty: 'Tidak ada hasil untuk pencarian atau filter ini.',
    filterEmptyHint: 'Ubah kata kunci atau hapus filternya.',
    caption: (noun: string, total: number) => `Daftar ${noun}, ${String(total)} baris`,
  },
} as const;
