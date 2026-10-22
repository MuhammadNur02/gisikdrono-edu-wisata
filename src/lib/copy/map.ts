// The site plan, the map and /peta-kontak (docs/StyleGuide.md §5.13, docs/PRD.md FR-PUB-03, FR-PUB-18). Its own
// module because src/lib/copy/id.ts is at the 300-line cap of CLAUDE.md §4; the same rules apply (Indonesian, one
// key per string).
export const mapCopy = {
  planTitle: 'Denah kampung',
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
  pointsTitle: 'Daftar titik aktivitas',
  gallery: 'Lihat di galeri',
  route: 'Rute',
  routeToOffice: 'Rute di Google Maps',
  geoTitle: 'Lokasi di peta',
  geoLabel: 'Peta lokasi titik aktivitas',
  geoZoomIn: 'Perbesar peta',
  geoZoomOut: 'Perkecil peta',
  // The OpenStreetMap tiles need their credit next to the map (OSM tile usage policy).
  osmCredit: 'Peta',
  osmContributors: 'kontributor OpenStreetMap',
  showGoogle: 'Tampilkan Google Maps',
  // Pressing the button loads Google's frame, so the visitor knows whose it is before it loads.
  googleHint: 'Peta dari Google dimuat setelah tombol ditekan.',
  googleFrame: 'Peta Google Maps Kelurahan Gisikdrono',
  contactTitle: 'Hubungi kami',
  contactWhatsApp: 'WhatsApp',
  contactEmail: 'Email',
  contactAddress: 'Alamat kantor',
  allRws: 'Halaman kampung',
} as const;
