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
  },
  idleLock: {
    title: 'Dasbor terkunci',
    description:
      'Tidak ada aktivitas selama 10 menit, jadi layar dikunci. Tulis kode autentikator Anda untuk melanjutkan.',
    unlock: 'Lanjutkan',
  },
  home: {
    title: 'Dasbor',
    signedInAs: (role: string) => `Anda masuk sebagai ${role}.`,
  },
  // docs/StyleGuide.md §6.3, Task P4.2.03.
  overview: {
    kpiLabel: 'Ringkasan angka',
    trendTitle: 'Dibanding hari yang sama bulan lalu',
    trendNew: 'Baru',
    trendFlat: 'Tetap',
    unavailable: 'Belum tersedia',
    superadmin: {
      revenue: 'Pendapatan bulan ini',
      revenueHint: 'Bersih dari buku besar bagi hasil.',
      paidBookings: 'Reservasi lunas',
      paidBookingsHint: 'Dibayar bulan ini.',
      checkedIn: 'Pengunjung check-in',
      checkedInHint: 'Orang yang masuk bulan ini.',
      rating: 'Rating rata-rata',
      ratingHint: (count: number) =>
        count === 0 ? 'Belum ada ulasan terbit.' : `Dari ${String(count)} ulasan terbit.`,
    },
    rw: {
      quota: 'Kuota hari ini terpakai',
      quotaHint: (reserved: number, capacity: number) =>
        capacity === 0
          ? 'Tidak ada sesi hari ini.'
          : `${String(reserved)} dari ${String(capacity)} kursi.`,
      upcoming: 'Reservasi mendatang',
      upcomingHint: 'Lunas, 30 hari ke depan.',
      checkInsToday: 'Check-in hari ini',
      checkInsTodayHint: 'Diperbarui tiap 15 detik.',
      productsSold: 'Produk terjual',
      productsSoldHint: 'Menunggu ringkasan statistik kunjungan.',
    },
    revenueChart: {
      title: 'Pendapatan 30 hari terakhir',
      description: 'Jumlah bersih per hari dari buku besar bagi hasil.',
      empty: 'Belum ada pendapatan tercatat',
      emptyDescription: 'Angka muncul setelah pembayaran pertama lunas dan dibagi di buku besar.',
      series: 'Pendapatan',
    },
    checkinsChart: {
      title: 'Check-in 30 hari terakhir',
      description: 'Jumlah orang yang masuk per hari.',
      empty: 'Belum ada check-in',
      emptyDescription: 'Angka muncul setelah tiket pertama dipindai di gerbang.',
      series: 'Pengunjung',
    },
    // A text version of each chart for screen readers.
    chartSummary: (title: string, total: string) => `${title}: total ${total}.`,
    security: {
      title: 'Peringatan keamanan terbuka',
      none: 'Tidak ada peringatan terbuka.',
      more: (count: number) => `dan ${String(count)} lainnya`,
      occurrences: (count: number) => `${String(count)}×`,
      viewAll: 'Lihat semua peringatan',
      piiReveals: 'Kontak dibuka hari ini',
      piiRevealsHint: 'Setiap pembukaan kontak tercatat atas nama staf.',
    },
    sessions: {
      title: 'Sesi hari ini',
      none: 'Tidak ada sesi hari ini',
      noneDescription: 'Sesi dibuat di halaman Sesi Kunjungan.',
      seats: (reserved: number, capacity: number) =>
        `${String(reserved)}/${String(capacity)} kursi`,
      checkedIn: (count: number) => `${String(count)} check-in`,
      manage: 'Kelola sesi',
    },
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
