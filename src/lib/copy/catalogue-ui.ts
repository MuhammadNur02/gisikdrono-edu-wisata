// The words the public catalogue islands show (DESIGN-SPEC §3.4–§3.8, §3.14): the filter bar, the sort, the search, the
// result count, the empty and error states, the share button and the gallery. Kept apart from the full copy
// (src/lib/copy/id.ts) so the islands ship these few strings instead of the whole site's copy (first-load budget,
// docs/StyleGuide.md §10.1).
export const catalogueUiCopy = {
  filterAll: 'Semua',
  filterButton: 'Filter',
  filterSheetTitle: 'Filter dan urutan',
  filterSheetDescription: 'Pilih jenis rombongan dan urutan daftar.',
  filterShowResults: (count: number, noun: string) => `Tampilkan ${String(count)} ${noun}`,
  activeFilters: (count: number) => `${String(count)} filter aktif`,
  removeFilter: (label: string) => `Hapus filter ${label}`,
  sortLabel: 'Urutkan',
  count: (count: number, noun: string) => `${String(count)} ${noun}`,
  clearAll: 'Hapus semua filter',
  share: 'Bagikan',
  copyLink: 'Salin tautan',
  linkCopied: 'Tautan disalin',
  sections: (count: number) => `${String(count)} bagian`,
};

// The states of a list that could not load (DESIGN-SPEC §3.14): the error boundary is a client component.
export const catalogueStateCopy = {
  errorTitle: (noun: string) => `${noun} belum bisa dimuat`,
  errorDescription:
    'Periksa koneksi internetmu, lalu coba lagi. Kalau masih gagal, kabari pengelola lewat WhatsApp; data pesananmu tidak hilang.',
  retry: 'Coba lagi',
  reportOnWhatsApp: 'Kabari lewat WhatsApp',
  loading: (noun: string) => `Memuat ${noun}…`,
  whatsAppGreeting: (topic: string) =>
    `Halo, halaman ${topic} di situs edu wisata tidak bisa dimuat.`,
};

// The gallery tiles and the lightbox (DESIGN-SPEC §3.7).
export const galleryUiCopy = {
  openPhoto: (alt: string) => `Perbesar foto: ${alt}`,
  playVideo: (alt: string) => `Putar video: ${alt}`,
  videoSource: 'Video YouTube',
  swipeHint: 'Geser untuk foto lain',
  lightbox: {
    previous: 'Foto sebelumnya',
    next: 'Foto berikutnya',
    close: 'Tutup',
    viewer: 'Penampil foto',
    carousel: 'Foto',
    slide: 'Foto',
    photos: 'Galeri foto',
    thumbnails: 'Pratinjau foto',
    position: '{index} dari {total}',
  },
  morePhotos: (count: number) => `Lihat ${String(count)} foto`,
  photoPosition: (index: number, total: number) => `${String(index)} / ${String(total)}`,
};

// The package page's availability panel (DESIGN-SPEC §3.5).
export const availabilityCopy = {
  title: 'Ketersediaan 14 hari',
  live: 'Diperbarui tiap 15 detik',
  previous: 'Tanggal sebelumnya',
  next: 'Tanggal berikutnya',
  days: 'Tanggal kunjungan',
  sessionsOf: (date: string) => `Sesi pada ${date}`,
  seatsShort: (remaining: number) => `Sisa ${String(remaining)}`,
  seatsOf: (remaining: number, capacity: number | null) =>
    capacity === null
      ? `Sisa ${String(remaining)} kursi`
      : `Sisa ${String(remaining)} dari ${String(capacity)}`,
  full: 'Penuh',
  session: 'Sesi',
  none: 'Tidak ada sesi terbuka dalam 14 hari ke depan. Tanyakan jadwal lain lewat WhatsApp.',
  failed: 'Ketersediaan belum bisa dimuat.',
  retry: 'Coba lagi',
};
