// The content lists of the dashboard on the DataTable (Task P4.3.03, docs/StyleGuide.md §6.4), imported directly by
// their pages and tables rather than through the copy barrel, like the catalog's (admin first-load budget).

export const contentListsCopy = {
  facets: { status: 'Status', rw: 'RW', category: 'Kategori', kind: 'Jenis', type: 'Jenis' },
  columns: {
    title: 'Judul',
    name: 'Nama',
    owner: 'Milik',
    category: 'Kategori',
    kind: 'Jenis',
    status: 'Status',
    updatedAt: 'Diubah',
    startsAt: 'Mulai',
    venue: 'Tempat',
    photo: 'Foto',
    pages: 'Halaman',
    downloads: 'Unduhan',
    sortOrder: 'Urutan',
    window: 'Waktu tampil',
    path: 'Alamat',
    actions: 'Aksi',
  },
  actions: {
    edit: 'Ubah',
    view: 'Lihat di situs',
    archive: 'Arsipkan',
    archiveTitle: (name: string) => `Arsipkan "${name}"?`,
    archiveConsequence:
      'Konten ini langsung hilang dari situs, tetapi tetap tersimpan di sini. Ubah lalu simpan untuk menayangkannya lagi.',
    archived: 'Konten diarsipkan.',
    remove: 'Hapus permanen',
    removeTitle: (name: string) => `Hapus "${name}" untuk selamanya?`,
    removeConsequence:
      'Konten dan file-filenya terhapus dari penyimpanan dan tidak bisa dikembalikan.',
    removed: 'Konten dihapus.',
  },
  search: {
    articles: 'Cari judul artikel…',
    galleries: 'Cari keterangan foto…',
    booklets: 'Cari judul booklet…',
    schedules: 'Cari nama acara…',
    points: 'Cari nama tempat…',
    banners: 'Cari judul banner…',
    pages: 'Cari nama RW…',
  },
  nouns: {
    articles: 'artikel',
    galleries: 'item galeri',
    booklets: 'booklet',
    schedules: 'jadwal',
    points: 'titik aktivitas',
    banners: 'banner',
    pages: 'halaman RW',
  },
  articleArchiveOnlySuper:
    'Artikel yang sudah tayang hanya bisa diarsipkan superadmin. Ajukan perubahannya untuk ditinjau, ya.',
  pages: {
    edit: (name: string) => `Ubah halaman ${name}`,
    tagline: 'Tagline',
    noTagline: 'Belum ada tagline',
  },
  banners: {
    preview: 'Pratinjau',
    previewTitle: (title: string) => `Pratinjau "${title}"`,
    previewNote: 'Begini kira-kira slide ini tampil di beranda. Ukuran sebenarnya ikut layar.',
    moveUp: 'Naikkan',
    moveDown: 'Turunkan',
    moved: 'Urutan banner diperbarui.',
    deactivate: 'Nonaktifkan',
    deactivateTitle: (title: string) => `Nonaktifkan "${title}"?`,
    deactivateConsequence:
      'Banner ini langsung hilang dari beranda, tetapi tetap tersimpan di sini. Ubah lalu centang "Tampilkan banner" untuk menayangkannya lagi.',
    deactivated: 'Banner dinonaktifkan.',
    product: (name: string) => `Produk: ${name}`,
    phases: {
      live: 'Tayang',
      scheduled: 'Terjadwal',
      ended: 'Berakhir',
      inactive: 'Nonaktif',
    },
  },
} as const;
