import type { RwId } from '@/config/rw';
import { countWordAtStart } from '@/lib/utils/number-words';

// The words of the RW pages (DESIGN-SPEC §3.3 and the RW 13 & RW 08 variants). Its own module because
// src/lib/copy/id.ts is at the 300-line cap of CLAUDE.md §4; the same rules apply (Indonesian, one key per string).
// What an RW says about itself (name, tagline, profile, points) comes from rw_units and activity_points; only the
// section headings live here.
export const rwPageCopy = {
  breadcrumbParent: 'Kampung Wisata',
  book: 'Pesan Kunjungan',
  seePackages: (label: string) => `Lihat paket ${label}`,
  seeMap: 'Lihat peta',
  navLabel: 'Bagian halaman',
  navFrom: (price: string) => `Mulai ${price} / orang`,
  navBook: 'Pesan',
  nav: {
    profil: 'Profil',
    jadwal: 'Jadwal',
    'titik-aktivitas': 'Titik aktivitas',
    paket: 'Paket',
    produk: 'Produk',
    galeri: 'Galeri',
  },
  profile: {
    eyebrow: 'Profil · Visi & filosofi',
    fallbackTitle: (name: string) => `Mengenal ${name}`,
    drivenBy: 'Digerakkan oleh',
  },
  facts: {
    points: 'Titik aktivitas',
    pointsValue: (count: number) => `${String(count)} titik`,
    duration: 'Durasi paket',
    durationValue: (minutes: number) => `${String(minutes)} menit`,
    sessions: 'Sesi',
    capacity: 'Kapasitas per sesi',
    capacityValue: (seats: number) => `${String(seats)} orang`,
  },
  schedule: {
    eyebrow: 'Jadwal pertunjukan',
    title: 'Pentas dan workshop terdekat',
    description:
      'Waktu dalam WIB. Pentas terbuka bisa ditonton; workshop mengikuti paket kunjungan.',
    all: 'Semua jadwal',
    relatedPackage: 'Pesan paket terkait',
    emptyTitle: 'Jadwal pentas belum diumumkan',
    emptyBody: (dances: string) =>
      `${dances} dipentaskan warga. Tanyakan waktunya lewat WhatsApp atau pantau Artikel.`,
  },
  points: {
    eyebrow: (count: number) => `Titik aktivitas · ${String(count)} titik`,
    title: (count: number) =>
      count === 1
        ? 'Titik yang disinggahi rombongan'
        : `${countWordAtStart(count)} titik yang disinggahi rombongan`,
    description: 'Setiap titik dikelola warga. Lokasinya juga ditandai di peta kampung.',
    onMap: (name: string) => `Lihat ${name} di peta`,
  },
  packages: {
    eyebrow: (label: string) => `Paket ${label}`,
    title: (shortName: string) => `Paket yang singgah di ${shortName}`,
    description: 'Harga per orang. Totalnya dihitung sistem saat memesan.',
    helpTitle: 'Rombongan besar atau butuh jadwal khusus?',
    helpBody:
      'Sekolah, kampus, instansi, dan perusahaan bisa meminta surat penawaran resmi dari langkah Ringkasan, tanpa langsung mengunci kuota.',
    howToBook: 'Baca cara memesan',
  },
  products: {
    eyebrow: (heading: string, label: string) => `${heading} ${label}`,
    fallbackTitle: 'Buatan tangan warga kampung',
    description:
      'Dipesan lewat WhatsApp Koperasi Merah Putih, lalu diambil dan dibayar di koperasi.',
    all: (label: string) => `Semua produk ${label}`,
  },
  gallery: {
    eyebrow: (label: string) => `Galeri ${label}`,
    title: 'Dokumentasi kegiatan',
    description: (shortName: string) => `Foto kegiatan warga ${shortName}.`,
    open: (label: string) => `Buka galeri ${label}`,
    more: 'foto lainnya',
  },
  cta: {
    fallbackTitle: (shortName: string) => `Ajak rombonganmu belajar di ${shortName}`,
    seePackages: 'Lihat paket',
  },
} as const;

export type RwSectionKey = keyof typeof rwPageCopy.nav;

// What the design writes for one RW in particular (DESIGN-SPEC §3.3, RW 05): its profile heading, who runs it, the
// products heading and the closing call. Every other RW takes the general wording above.
interface RwPageVoice {
  profileTitle: string;
  drivenBy: readonly string[];
  productsTitle: string;
  ctaTitle: string;
}

const RW05: RwId = 5;

export const RW_PAGE_VOICE: Partial<Record<RwId, RwPageVoice>> = {
  [RW05]: {
    profileTitle: 'Dari sampah yang tercampur menjadi kampung belajar',
    drivenBy: ['Ibu-ibu PKK', 'Pengurus RT/RW', 'Kader wilayah'],
    productsTitle: 'Dari bank sampah dan kebun warga',
    ctaTitle: 'Ajak rombonganmu belajar zero waste dari sumbernya',
  },
};
