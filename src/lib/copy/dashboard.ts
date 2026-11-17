// The dashboard shell (Task P2.8.03, final in P4.1.01) and the DataTable family (P4.3.01), read through copy.dashboard
// in src/lib/copy/id.ts.
export const dashboardCopy = {
  navLabel: 'Menu dasbor',
  openMenu: 'Buka menu dasbor',
  toggleSidebar: 'Buka atau tutup bilah sisi',
  menuDescription: 'Semua halaman dasbor yang bisa Anda buka.',
  homeLink: 'Edu Wisata Gisikdrono, ke dasbor',
  brandName: 'Gisikdrono',
  brandScope: (scope: string) => `Dasbor ${scope}`,
  kelurahan: 'Kelurahan',
  roles: {
    superadmin: 'Superadmin Kelurahan',
    adminRw: (rw: string) => `Admin ${rw}`,
    adminKopdes: 'Admin Kopdes',
  },
  rwSwitcher: {
    label: 'Tampilkan data',
    all: 'Semua',
  },
  topbar: {
    scanTicket: 'Scan tiket',
    search: 'Cari reservasi',
    searchPlaceholder: 'Cari kode GSK-…, institusi, atau tiket',
    breadcrumb: 'Lokasi halaman',
    // Path segments that are not a menu item: /new, /edit.
    segments: { new: 'Baru', edit: 'Ubah' },
  },
  userMenu: {
    profile: 'Profil',
  },
  commandMenu: {
    open: 'Cari menu',
    jump: 'Lompat ke menu…',
    shortcut: 'Ctrl K',
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
  },
  // docs/StyleGuide.md §6.3, Task P4.2.03.
  overview: {
    kpiLabel: 'Ringkasan angka',
    trendTitle: 'Dibanding hari yang sama bulan lalu',
    trendNew: 'Baru',
    trendFlat: 'Tetap',
    unavailable: 'Belum tersedia',
    unavailableHint: 'Belum bisa dihitung; coba muat ulang halaman.',
    chartUnavailable: {
      title: 'Belum tersedia',
      description: 'Datanya gagal dimuat; coba muat ulang halaman.',
    },
    superadmin: {
      revenue: 'Pendapatan bulan ini',
      revenueHint: 'Bersih dari buku besar bagi hasil.',
      paidBookings: 'Reservasi lunas',
      paidBookingsHint: 'Lunas, berkunjung bulan ini s.d. hari ini.',
      checkedIn: 'Pengunjung check-in',
      checkedInHint: 'Orang yang masuk, kunjungan bulan ini.',
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
    },
    revenueChart: {
      empty: 'Belum ada pendapatan tercatat',
      emptyDescription: 'Angka muncul setelah pembayaran pertama lunas dan dibagi di buku besar.',
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
    greetings: {
      morning: 'Selamat pagi',
      midday: 'Selamat siang',
      afternoon: 'Selamat sore',
      evening: 'Selamat malam',
    },
    headline: (greeting: string, count: number | null) => {
      if (count === null) return `${greeting}.`;
      return count === 0
        ? `${greeting}. Tidak ada yang perlu Anda tangani sekarang.`
        : `${greeting}. Ada ${String(count)} hal yang perlu Anda tangani hari ini.`;
    },
    dateLine: (date: string, time: string) => `${date} · ${time} WIB`,
    exportLink: 'Ekspor',
    today: {
      title: 'Kunjungan hari ini',
      summary: (
        sessions: number,
        rws: number,
        reserved: number,
        capacity: number,
        present: number,
      ) =>
        `${String(sessions)} sesi di ${String(rws)} RW · ${String(reserved)} dari ${String(capacity)} kursi terisi · ${String(present)} sudah hadir`,
      openAttendance: 'Buka kehadiran',
      now: (time: string) => `Sekarang ${time}`,
    },
    actions: {
      title: 'Perlu tindakan',
      description: 'Diurutkan dari yang paling mendesak.',
      none: 'Tidak ada yang menunggu. Semua beres.',
      bookingReview: (count: number, code: string | null) =>
        count === 1 && code !== null
          ? `${code} perlu ditinjau`
          : `${String(count)} reservasi perlu ditinjau`,
      bookingReviewDetail: 'Buka reservasi dan pilih jalan keluarnya.',
      securityAlerts: (count: number) => `${String(count)} peringatan keamanan terbuka`,
      securityAlertsDetail: (title: string | null) => (title === null ? '' : `Terakhir: ${title}`),
      pendingReviews: (count: number) => `${String(count)} ulasan menunggu moderasi`,
      pendingReviewsDetail: 'Terbitkan atau tolak sebelum tampil di situs.',
      piiReveals: (count: number) =>
        `Kontak pemesan dibuka hari ini: ${String(count)}. Setiap pembukaan tercatat atas nama staf.`,
    },
    cumulative: {
      title: 'Pendapatan kumulatif · 30 hari terakhir',
      hint: 'Bersih dari buku besar bagi hasil.',
      series: 'Kumulatif',
    },
    occupancy: {
      title: 'Okupansi 7 hari ke depan',
      description: 'Kursi terjual ÷ kapasitas, termasuk yang menunggu bayar.',
      note: 'Garis tepi: semua sesi hari itu penuh. Tanda —: belum ada sesi.',
      rwColumn: 'RW',
      noSession: 'belum ada sesi',
      full: 'penuh',
    },
    sessions: {
      none: 'Tidak ada sesi hari ini',
      noneDescription: 'Sesi dibuat di halaman Sesi Kunjungan.',
      seats: (reserved: number, capacity: number) =>
        `${String(reserved)}/${String(capacity)} kursi`,
      checkedIn: (count: number) => `${String(count)} check-in`,
    },
  },
  // docs/Security.md §7.5: the footer of every export sheet, and the export request's field messages (Task P4.6).
  exports: {
    watermark: (staffName: string, exportedAt: string) =>
      `Diekspor oleh ${staffName} ${exportedAt} - Dokumen rahasia Kelurahan Gisikdrono`,
    validation: {
      purposeTooShort: 'Tulis tujuan ekspor minimal 10 karakter.',
      purposeTooLong: 'Tujuan ekspor paling banyak 200 karakter.',
      periodOrder: 'Tanggal akhir tidak boleh sebelum tanggal awal.',
      periodTooLong: 'Periode ekspor paling lama 12 bulan.',
      csvOnly: 'Log audit hanya bisa diekspor sebagai CSV.',
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
