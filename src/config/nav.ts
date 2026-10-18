import { RW_PROGRAMMES, type RwId } from '@/config/rw';

// Public navigation (docs/PRD.md §5.1). The dashboard groups of docs/StyleGuide.md §6.2 join this file in P2.8.

export interface PublicNavItem {
  label: string;
  href: string;
  // Set on the RW pages, which carry the RW eyebrow in that RW's accent (docs/StyleGuide.md §2.7).
  rwId?: RwId;
}

export interface PublicNavGroup {
  title: string;
  items: readonly PublicNavItem[];
}

export const HOME_NAV_ITEM = { label: 'Beranda', href: '/' } as const satisfies PublicNavItem;

// Every booking starts from a package, so the booking button opens the package catalogue.
export const BOOKING_CTA = {
  label: 'Pesan Kunjungan',
  // Below md the header button has room for one word next to the wordmark and the menu.
  shortLabel: 'Pesan',
  href: '/paket-wisata',
} as const satisfies PublicNavItem & { shortLabel: string };

const rwItem = (rwId: RwId): PublicNavItem => ({
  label: RW_PROGRAMMES[rwId].name,
  href: RW_PROGRAMMES[rwId].path,
  rwId,
});

// The header keeps to what a first visit looks for; everything else is in the menu and the footer.
export const HEADER_NAV_ITEMS: readonly PublicNavItem[] = [
  rwItem(5),
  rwItem(8),
  { label: 'Paket wisata', href: '/paket-wisata' },
  { label: 'Produk UMKM', href: '/produk' },
  { label: 'Galeri', href: '/galeri' },
  { label: 'Peta & kontak', href: '/peta-kontak' },
];

// The mobile menu and the footer list every public page in these groups.
export const SITE_NAV_GROUPS: readonly PublicNavGroup[] = [
  {
    title: 'Edu wisata',
    items: [
      rwItem(5),
      rwItem(8),
      { label: 'Jadwal pertunjukan RW 08', href: '/rw-08-kampung-seni-budaya/jadwal' },
    ],
  },
  {
    title: 'Kunjungan',
    items: [
      { label: 'Paket wisata', href: '/paket-wisata' },
      { label: 'Produk UMKM', href: '/produk' },
      { label: 'Cari reservasi', href: '/reservasi/cari' },
    ],
  },
  {
    title: 'Informasi',
    items: [
      { label: 'Galeri', href: '/galeri' },
      { label: 'E-booklet', href: '/e-booklet' },
      { label: 'Artikel', href: '/artikel' },
      { label: 'Ulasan', href: '/ulasan' },
      { label: 'Peta & kontak', href: '/peta-kontak' },
    ],
  },
];

export const LEGAL_NAV_ITEMS: readonly PublicNavItem[] = [
  { label: 'Kebijakan privasi', href: '/privasi' },
  // `Permintaan data pribadi` (/privasi/permintaan) returns with its form in P3.12.03 (decision of 2026-10-18,
  // go-live check #23); until then /privasi explains the request by email.
];
