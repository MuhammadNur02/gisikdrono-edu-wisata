// The site plan, the map and /peta-kontak (docs/StyleGuide.md §5.13, docs/PRD.md FR-PUB-03, FR-PUB-18). Its own
// module because src/lib/copy/id.ts is at the 300-line cap of CLAUDE.md §4; the same rules apply (Indonesian, one
// key per string).
export const mapCopy = {
  // Spoken for the plan as a whole; each hotspot carries its own name.
  planLabel: 'Denah titik aktivitas Kelurahan Gisikdrono',
  // Under the plan until the kelurahan's own drawing replaces the schematic (open decision D2).
  planProvisional: 'Denah skematis: letak dan ukuran belum mengikuti gambar kelurahan.',
  zoomIn: 'Perbesar denah',
  zoomOut: 'Perkecil denah',
  resetView: 'Kembalikan tampilan denah',
  hotspot: (name: string, rw: string) => `${name}, ${rw}`,
  // Shown in place of the plan while activity_points has no published row (docs/StyleGuide.md §8.5).
  planEmptyTitle: 'Titik aktivitas belum ditambahkan',
  planEmptyDescription:
    'Denah titik aktivitas akan tampil di sini setelah pengelola kampung menambahkan titik aktivitasnya.',
  gallery: 'Lihat di galeri',
  route: 'Rute',
  // The route link of a point in the list, named for a screen reader.
  routeTo: (name: string) => `Rute ke ${name}`,
  routeToOffice: 'Rute di Google Maps',
  // The RW area map of /peta-kontak, drawn from the kelurahan's "Peta RW Wilayah Gisikdrono 2024".
  areaLabel: 'Peta wilayah RW Kelurahan Gisikdrono',
  areaListEdu: 'Kampung eduwisata',
  areaListOther: 'RW lainnya',
  areaRwPage: (name: string) => `Buka halaman ${name}`,
  areaRouteTo: (label: string) => `Rute ke ${label} di Google Maps`,
  areaNoPoints: 'Titik aktivitas RW ini belum ditambahkan.',
  areaNotEdu: 'Wilayah ini belum memiliki program kunjungan edukasi di situs ini.',
  legendLabel: 'Keterangan peta',
  // The credit the kelurahan's map needs wherever its boundaries are drawn (scripts/convert-rw-kml.ts).
  areaSource: 'Batas RW: Peta RW Wilayah Gisikdrono 2024, Kelurahan Gisikdrono',
  // Under the map while a drawn point still holds its estimated position (src/lib/utils/map-estimates.ts), and the
  // badge on each such point (docs/content/konten-situs-kelurahan.md, section 8).
  pointsEstimated: 'Letak titik bertanda perkiraan belum pasti dan menunggu konfirmasi kelurahan.',
  estimateBadge: 'perkiraan',
  centreEstimated: 'Tujuan rute adalah titik perkiraan di dalam wilayah RW.',
  geoZoomIn: 'Perbesar peta',
  geoZoomOut: 'Perkecil peta',
  geoReset: 'Tampilkan seluruh kelurahan',
  // The OpenStreetMap tiles need their credit next to the map (OSM tile usage policy).
  osmContributors: 'kontributor OpenStreetMap',
  googleEyebrow: 'Lokasi',
  googleTitle: 'Lokasi di Google Maps',
  showGoogle: 'Tampilkan Google Maps',
  // Pressing the button loads Google's frame, so the visitor knows whose it is before it loads.
  googleHint: 'Peta dari Google dimuat setelah tombol ditekan.',
  googleFrame: 'Peta Google Maps Kelurahan Gisikdrono',
  // The redesigned /peta-kontak (DESIGN-SPEC §3.9).
  pageLead:
    'Tiga kampung edukasi di Kelurahan Gisikdrono, Semarang Barat. Lihat titik aktivitas, rute, dan cara menghubungi pengelola.',
  viewLabel: 'Tampilan peta',
  viewAreas: 'Peta wilayah',
  viewPlan: 'Denah aktivitas',
  rwPage: (label: string) => `Halaman ${label}`,
  legendPoints: (label: string, count: number) => `${label} · ${String(count)} titik`,
  pointsListEyebrow: 'Daftar titik aktivitas',
  pointsListTitle: 'Semua titik, tanpa harus membuka peta',
  pointsListDescription: 'Posisi di peta masih perkiraan dan menunggu konfirmasi kelurahan.',
  locate: (name: string) => `Tunjukkan ${name} di peta`,
  addressTitle: 'Alamat & arah',
  artsStreet: (shortName: string, street: string, label: string) =>
    `${shortName}: ${street}, ${label}`,
  meetingPoint: 'Titik kumpul rombongan tercantum di tiket QR.',
  openGoogle: 'Buka di Google Maps',
  chatTitle: 'Chat pengelola edu wisata',
  chatBody:
    'Tanya jadwal, rombongan besar, atau kebutuhan khusus peserta. Pesan pembuka sudah disiapkan:',
  sessionsTitle: 'Sesi kunjungan',
  sessionDays: 'Hari',
  sessionCapacity: 'Kapasitas',
  sessionCapacityValue: (seats: number) => `${String(seats)} orang per sesi`,
  sessionsNote: 'Sesi tutup pada hari libur yang diumumkan pengelola.',
} as const;
