import {
  linkPointPhoto,
  linkRwHero,
  seedGalleryPhoto,
  type GalleryRow,
  type MediaTarget,
} from './seed-photos';

// pnpm db:seed --official-media <folder> (and pnpm db:seed:staging-media for staging): photos from the kelurahan's own site, gisikdrono.semarangkota.go.id. The
// kelurahan holds no originals and allowed these to be used (docs/content/konten-situs-kelurahan.md, section 4;
// decision of 2026-10-22). The files are downloaded into a folder outside the repository, with a manifest beside
// them, and are never committed; only their file names, descriptions and source addresses live here.
//
// Descriptions say only what the photo shows. A photo of children never stands for an RW page or an activity
// point (section 4, "foto anak tidak dipakai sebagai gambar hero"), and parental consent for the children in
// the published photos is still to be confirmed, so those appear in the gallery only.

export interface OfficialPhoto extends Omit<GalleryRow, 'sortOrder'> {
  // The file name on the site and in the folder, without its extension.
  file: string;
  // The page of the official site the photo was taken from.
  page: string;
  showsChildren: boolean;
}

const SITE = 'https://gisikdrono.semarangkota.go.id';
const ZERO_WASTREME = `${SITE}/zero-wastreme`;
const SENI_BUDAYA = `${SITE}/seni-budaya`;
const POTENSI = `${SITE}/potensi`;
// Gallery rows of the development photos take sort order 1 to 6; these follow them.
const FIRST_SORT_ORDER = 11;

export const OFFICIAL_PHOTOS: OfficialPhoto[] = [
  {
    file: 'galeri_1781352833_628',
    id: '0de00000-0000-4000-8001-000000000001',
    rwId: 5,
    category: 'activity',
    page: ZERO_WASTREME,
    showsChildren: false,
    altText:
      'Ibu-ibu berkaus merah muda dan para tamu berdiri di belakang meja berisi botol minuman dan makanan, di depan papan Taman TOGA Sumber Saras PKK RW 05',
    caption: 'Ibu-ibu PKK RW 05 di Taman TOGA Sumber Saras',
  },
  {
    file: 'galeri_1781167605_244',
    id: '0de00000-0000-4000-8001-000000000002',
    rwId: 5,
    category: 'activity',
    page: ZERO_WASTREME,
    showsChildren: false,
    altText:
      'Kolam ikan berbingkai hijau dengan pancuran kecil, dikelilingi tanaman sayur dan pot-pot hijau',
    caption: 'Kolam ikan di antara tanaman kampung',
  },
  {
    file: 'galeri_1781167894_327',
    id: '0de00000-0000-4000-8001-000000000003',
    rwId: 5,
    category: 'activity',
    page: ZERO_WASTREME,
    showsChildren: false,
    altText:
      'Tamu berseragam dan ibu-ibu berkerudung biru berdiri di tepi kolam ikan berbingkai hijau, seorang memegang wadah hijau',
    caption: 'Melihat kolam ikan bersama ibu-ibu PKK',
  },
  {
    file: 'galeri_1781167894_502',
    id: '0de00000-0000-4000-8001-000000000004',
    rwId: 5,
    category: 'umkm',
    page: ZERO_WASTREME,
    showsChildren: false,
    altText:
      'Ibu-ibu PKK dan tamu memperhatikan tas warna-warni yang dibuat dari kemasan plastik bekas, tergantung di dinding kayu',
    caption: 'Tas dari kemasan plastik bekas buatan PKK',
  },
  {
    file: 'galeri_1787050840_168',
    id: '0de00000-0000-4000-8001-000000000005',
    rwId: 5,
    category: 'umkm',
    page: ZERO_WASTREME,
    showsChildren: false,
    altText:
      'Meja bertaplak bunga berisi botol-botol minuman, rimpang, daun kering, dan kue dalam kemasan plastik',
    caption: 'Sajian minuman dan hasil kebun untuk tamu',
  },
  {
    file: 'galeri_1781167605_929',
    id: '0de00000-0000-4000-8001-000000000006',
    rwId: 5,
    category: 'activity',
    page: ZERO_WASTREME,
    showsChildren: false,
    altText:
      'Seorang perempuan berbaju merah berbicara dengan mikrofon di depan layar bertuliskan Kampung Hebat, Kampung Pilah Sampah dan Pro Lingkungan RW 05',
    caption: 'Pemaparan Kampung Pilah Sampah dan Pro Lingkungan RW 05',
  },
  {
    file: 'galeri_1781247857_902',
    id: '0de00000-0000-4000-8001-000000000011',
    rwId: 13,
    category: 'activity',
    page: POTENSI,
    showsChildren: false,
    altText:
      'Dua pria menabuh gong dan gamelan di depan dinding bertuliskan Kampung Seni Budaya Gisikdrono yang dihiasi wayang kulit',
    caption: 'Pojok gamelan dan wayang Kampung Seni Budaya',
  },
  {
    file: 'galeri_1781247857_264',
    id: '0de00000-0000-4000-8001-000000000012',
    rwId: 13,
    category: 'activity',
    page: SENI_BUDAYA,
    showsChildren: false,
    altText:
      'Seorang pria berbaju batik dan berkalung bunga memegang wayang kulit di depan deretan wayang yang ditancapkan berjajar',
    caption: 'Wayang kulit di kampung seni',
  },
  {
    file: 'galeri_1781247833_423',
    id: '0de00000-0000-4000-8001-000000000013',
    rwId: 13,
    category: 'activity',
    page: SENI_BUDAYA,
    showsChildren: true,
    altText:
      'Empat penari muda berbaju hitam, berselendang merah, dan berkain batik menari di panggung berlatar lukisan alam',
    caption: 'Pentas tari tradisional di panggung kampung',
  },
  {
    file: 'galeri_1781849168_349',
    id: '0de00000-0000-4000-8001-000000000014',
    rwId: 13,
    category: 'activity',
    page: POTENSI,
    showsChildren: true,
    altText:
      'Empat penari perempuan berkostum merah kuning membawa kuda lumping berparade di jalan, di bawah spanduk Group Kuda Lumping Kartika Sari',
    caption: 'Kelompok Seni Kartika Sari berparade di jalan kampung',
  },
  {
    file: 'galeri_1781247873_519',
    id: '0de00000-0000-4000-8001-000000000015',
    rwId: 13,
    category: 'activity',
    page: POTENSI,
    showsChildren: false,
    altText:
      'Sekelompok pria berbalur cat putih dan cokelat, sebagian bertopeng, berpose di sekitar sepeda motor di jalan kampung berhias umbul-umbul',
    caption: 'Para penampil berkostum dan bertopeng',
  },
  {
    file: 'galeri_1781247902_365',
    id: '0de00000-0000-4000-8001-000000000016',
    rwId: 13,
    category: 'event',
    page: SENI_BUDAYA,
    showsChildren: false,
    altText:
      'Seorang pria bertelanjang dada dan berkain batik membawa nampan di tengah jalan, dikelilingi warga berpakaian adat dan penonton',
    caption: 'Pertunjukan seni di jalan kampung',
  },
  {
    file: 'galeri_1781247902_610',
    id: '0de00000-0000-4000-8001-000000000017',
    rwId: 13,
    category: 'event',
    page: SENI_BUDAYA,
    showsChildren: false,
    altText:
      'Para pria berbalur cat merah membawa batang dan daun pisang dalam pertunjukan di jalan kampung',
    caption: 'Pertunjukan dengan daun pisang',
  },
  {
    file: 'galeri_1781247873_602',
    id: '0de00000-0000-4000-8001-000000000018',
    rwId: 13,
    category: 'activity',
    page: SENI_BUDAYA,
    showsChildren: false,
    altText:
      'Jalan kampung berhias umbul-umbul merah putih, dengan mural bergambar wajah di dinding rumah dan warga berjalan di jalan',
    caption: 'Mural di sepanjang jalan kampung',
  },
  {
    file: 'galeri_1781247857_102',
    id: '0de00000-0000-4000-8001-000000000019',
    rwId: 13,
    category: 'event',
    page: SENI_BUDAYA,
    showsChildren: false,
    altText:
      'Warga berpakaian adat dan tokoh masyarakat berdiri berjajar memegang kartu bergambar lambang sila-sila Pancasila',
    caption: 'Kartu lambang sila-sila Pancasila',
  },
  {
    file: 'galeri_1781849168_160',
    id: '0de00000-0000-4000-8001-000000000020',
    rwId: 13,
    category: 'activity',
    page: POTENSI,
    showsChildren: true,
    altText:
      'Enam penari anak berkostum merah kuning dengan kuda kepang hitam putih berbaris di panggung',
    caption: 'Penari anak dengan kuda kepang',
  },
  {
    file: 'galeri_1781753877_131',
    id: '0de00000-0000-4000-8001-000000000021',
    rwId: 8,
    category: 'activity',
    page: POTENSI,
    showsChildren: true,
    altText:
      'Petugas, ibu-ibu PKK, dan anak-anak duduk di lantai sambil merentangkan tangan di ruang berpapan Komunitas Semar Cakep',
    caption: 'Kegiatan bersama di ruang Komunitas Semar Cakep',
  },
  {
    file: 'galeri_1781753821_731',
    id: '0de00000-0000-4000-8001-000000000022',
    rwId: 8,
    category: 'event',
    page: POTENSI,
    showsChildren: true,
    altText:
      'Petugas dan ibu-ibu PKK di ruangan berhias gambar, di bawah spanduk Milad ke-7 Rumah Difabel Semar Cakep, dengan anak-anak duduk di lantai',
    caption: 'Milad Rumah Difabel Semar Cakep',
  },
  {
    file: 'galeri_1781753821_372',
    id: '0de00000-0000-4000-8001-000000000023',
    rwId: 8,
    category: 'activity',
    page: POTENSI,
    showsChildren: true,
    altText:
      'Petugas berseragam cokelat, ibu-ibu PKK berseragam biru, dan warga berfoto di ruangan putih dengan rak produk dan manekin berbaju batik',
    caption: 'Foto bersama di ruangan dengan rak produk',
  },
];

// The photo each RW page shows, and the photo of each activity point of seed-dev.sql that has one. RW 08 has
// none yet: every photo of its programme shows children.
export const RW_HERO_PHOTO_IDS: Record<number, string> = {
  5: '0de00000-0000-4000-8001-000000000001',
  13: '0de00000-0000-4000-8001-000000000011',
};
export const POINT_PHOTO_IDS: Record<string, string> = {
  'taman-toga-sumber-saras': '0de00000-0000-4000-8001-000000000001',
  'kreasi-daur-ulang-pkk': '0de00000-0000-4000-8001-000000000004',
  'mural-dan-spot-foto': '0de00000-0000-4000-8001-000000000018',
};

export function officialPhoto(photoId: string): OfficialPhoto {
  const photo = OFFICIAL_PHOTOS.find((candidate) => candidate.id === photoId);
  if (!photo) throw new Error(`no official photo ${photoId}`);
  return photo;
}

// Runs after the development photos, so an RW page or a point that already shows one of those keeps it.
export async function seedOfficialMedia(target: MediaTarget, folder: string): Promise<number> {
  for (const [index, photo] of OFFICIAL_PHOTOS.entries()) {
    await seedGalleryPhoto(target, folder, photo.file, {
      ...photo,
      sortOrder: FIRST_SORT_ORDER + index,
    });
  }
  for (const [rwId, photoId] of Object.entries(RW_HERO_PHOTO_IDS)) {
    await linkRwHero(target, Number(rwId), photoId);
  }
  for (const [slug, photoId] of Object.entries(POINT_PHOTO_IDS)) {
    await linkPointPhoto(target, folder, slug, officialPhoto(photoId));
  }
  return OFFICIAL_PHOTOS.length;
}
