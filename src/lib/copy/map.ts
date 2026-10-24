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
  // The route link of a point in the list, named for a screen reader.
  routeTo: (name: string) => `Rute ke ${name}`,
  routeToOffice: 'Rute di Google Maps',
  // The RW area map of /peta-kontak, drawn from the kelurahan's "Peta RW Wilayah Gisikdrono 2024".
  areaTitle: 'Peta wilayah RW',
  areaDescription:
    'Tiga belas RW Kelurahan Gisikdrono. Kampung eduwisata diberi warna; pilih wilayah di peta atau di daftar untuk melihat program dan titik aktivitasnya.',
  areaLabel: 'Peta wilayah RW Kelurahan Gisikdrono',
  areaListEdu: 'Kampung eduwisata',
  areaListOther: 'RW lainnya',
  areaRwPage: (name: string) => `Buka halaman ${name}`,
  areaRouteTo: (label: string) => `Rute ke ${label} di Google Maps`,
  areaPoints: 'Titik aktivitas',
  areaNoPoints: 'Titik aktivitas RW ini belum ditambahkan.',
  areaNotEdu: 'Wilayah ini belum memiliki program kunjungan edukasi di situs ini.',
  legendLabel: 'Keterangan peta',
  legendOtherRw: 'RW lain',
  legendBoundary: 'Batas kelurahan',
  legendOffice: 'Kantor kelurahan',
  legendPoint: 'Titik aktivitas',
  // The credit the kelurahan's map needs wherever its boundaries are drawn (scripts/convert-rw-kml.ts).
  areaSource: 'Batas RW: Peta RW Wilayah Gisikdrono 2024, Kelurahan Gisikdrono',
  // Under the map while the points carry estimated positions (docs/content/konten-situs-kelurahan.md, section 8).
  pointsEstimated: 'Letak titik aktivitas masih perkiraan dan menunggu konfirmasi kelurahan.',
  geoZoomIn: 'Perbesar peta',
  geoZoomOut: 'Perkecil peta',
  geoReset: 'Tampilkan seluruh kelurahan',
  // The OpenStreetMap tiles need their credit next to the map (OSM tile usage policy).
  osmCredit: 'Peta',
  osmContributors: 'kontributor OpenStreetMap',
  googleTitle: 'Lokasi di Google Maps',
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
