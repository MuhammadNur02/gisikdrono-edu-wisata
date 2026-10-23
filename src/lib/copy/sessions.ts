// /dashboard/sessions (Task P4.3.04, docs/PRD.md FR-ADMIN-03), read through copy.sessions in src/lib/copy/id.ts.
export const sessionsCopy = {
  title: 'Sesi Kunjungan',
  description: (rwLabel: string) =>
    `Jadwal sesi ${rwLabel} yang bisa dipesan pengunjung, beserta kuota dan isinya.`,
  chooseRw: 'Pilih salah satu RW di pengalih RW dulu untuk melihat jadwal sesinya.',
  previousMonth: 'Bulan sebelumnya',
  nextMonth: 'Bulan berikutnya',
  today: 'Hari ini',
  calendarLabel: 'Kalender sesi kunjungan',
  weekdays: ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'],
  weekdayNames: ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'],
  sessionCount: (count: number) => `${String(count)} sesi`,
  noSessions: 'Belum ada sesi',
  openDay: (date: string) => `Buka sesi tanggal ${date}`,
  // What a day button says to a screen reader beyond its date: each session, its seats and its status.
  sessionSummary: (label: string, reserved: number, capacity: number, status: string) =>
    `${label}: ${String(reserved)} dari ${String(capacity)} kursi terisi, ${status}.`,
  // The derived occupancy chip (docs/StyleGuide.md §6.5): not an enum.
  occupancy: {
    label: (reserved: number, capacity: number) =>
      `${String(reserved)} dari ${String(capacity)} kursi terisi`,
    nearlyFull: 'Hampir Penuh',
    full: 'Penuh',
  },
  checkedIn: (count: number) => `${String(count)} check-in`,
  empty: 'Belum ada sesi bulan ini.',
  emptyHint: 'Buat sesi dari pola mingguan, atau tambahkan satu sesi lewat tanggal di kalender.',
  editor: {
    title: (date: string) => `Sesi ${date}`,
    description: 'Ubah kuota dan status tiap sesi, atau tambahkan sesi baru untuk hari ini.',
    add: 'Tambah sesi',
    addTitle: 'Sesi baru',
    label: 'Nama sesi',
    labelPlaceholder: 'Sesi Pagi',
    startTime: 'Mulai',
    endTime: 'Selesai',
    capacity: 'Kuota',
    status: 'Status',
    notes: 'Catatan (opsional)',
    notesHint: 'Hanya tampil di dasbor, misalnya ada acara kelurahan.',
    lockedHint: 'Tidak dapat diubah karena sudah ada reservasi.',
    capacityHint: (reserved: number) =>
      `Kuota tidak bisa di bawah ${String(reserved)} kursi yang sudah dipesan.`,
    save: 'Simpan sesi',
    remove: 'Hapus sesi',
    removeTitle: (label: string) => `Hapus sesi "${label}"?`,
    removeConsequence:
      'Sesi ini hilang dari kalender pemesanan. Sesi yang sudah dipesan tidak bisa dihapus.',
    saved: 'Sesi tersimpan.',
    created: 'Sesi baru ditambahkan.',
    removed: 'Sesi dihapus.',
    cancelHold: 'Batalkan hold',
    cancelHoldHint:
      'Pembatalan hold yang belum dibayar menyusul bersama modul reservasi (cancel_booking).',
  },
  templates: {
    open: 'Pola mingguan',
    title: 'Pola mingguan',
    description:
      'Sesi yang berulang setiap minggu. "Buat sesi" mengisi kalender dari pola yang aktif.',
    add: 'Tambah pola',
    addTitle: 'Pola baru',
    weekday: 'Hari',
    label: 'Nama sesi',
    startTime: 'Mulai',
    endTime: 'Selesai',
    capacity: 'Kuota',
    isActive: 'Aktif',
    inactive: 'Nonaktif',
    save: 'Simpan pola',
    remove: 'Hapus pola',
    removeTitle: (label: string) => `Hapus pola "${label}"?`,
    removeConsequence: 'Sesi yang sudah dibuat dari pola ini tetap ada; hanya polanya yang hilang.',
    empty: 'Belum ada pola mingguan.',
    emptyHint: 'Tambahkan pola pertama, misalnya Sabtu 08.00–10.00 dengan kuota 40.',
    saved: 'Pola tersimpan.',
    removed: 'Pola dihapus.',
  },
  generate: {
    open: 'Buat sesi',
    title: 'Buat sesi dari pola mingguan',
    description: (month: string, templates: number) =>
      `Kalender ${month} diisi dari ${String(templates)} pola aktif. Sesi yang sudah ada tidak diubah, dan hari yang sudah lewat dilewati.`,
    noTemplates: 'Belum ada pola aktif. Tambahkan pola mingguan dulu.',
    confirm: 'Buat sesi',
    done: (count: number) =>
      count === 0
        ? 'Tidak ada sesi baru: bulan ini sudah terisi.'
        : `${String(count)} sesi baru dibuat.`,
  },
  validation: {
    time: 'Tulis jam dengan format JJ:MM, misalnya 08:00.',
    endAfterStart: 'Jam selesai harus setelah jam mulai.',
    date: 'Isi tanggal yang benar.',
    capacity: (min: number, max: number) => `Kuota antara ${String(min)} dan ${String(max)} orang.`,
    month: 'Bulan tidak dikenali.',
  },
  errors: {
    // visit_sessions_guard (0004) refuses these while the session holds bookings.
    hasBookings:
      'Sesi ini sudah dipesan, jadi tanggal, jam, dan statusnya tidak bisa diubah, dan kuota tidak bisa di bawah yang sudah dipesan.',
    duplicateTime: 'Sudah ada sesi pada tanggal dan jam mulai ini.',
    duplicateTemplate: 'Sudah ada pola pada hari dan jam mulai ini.',
    generateRange: 'Sesi hanya bisa dibuat untuk paling lama satu tahun ke depan.',
  },
} as const;
