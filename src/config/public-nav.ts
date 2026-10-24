import { isPathUnder, rwSchedulePath } from '@/lib/utils/paths';
import type { RwEyebrowData, RwUnitProfile, RwUnitSummary } from '@/types/rw-unit';

// Public navigation (docs/PRD.md §5.1). Apart from the dashboard groups of src/config/nav.ts, so the header's client
// islands never carry the dashboard's icons (first-load budget, docs/StyleGuide.md §10.1).

export interface PublicNavItem {
  label: string;
  href: string;
  // Set on the RW pages, which carry the RW eyebrow in that RW's accent (docs/StyleGuide.md §2.7).
  rw?: RwEyebrowData;
  // For a link to a section of another page: the pages on which it still marks the current section.
  currentOn?: readonly string[];
  // A short line under an RW's name in the menu drawer: its theme (rw_units.theme_label).
  description?: string;
}

export interface PublicNavGroup {
  title: string;
  items: readonly PublicNavItem[];
}

export interface PublicNav {
  headerItems: readonly PublicNavItem[];
  groups: readonly PublicNavGroup[];
}

export const HOME_NAV_ITEM = { label: 'Beranda', href: '/' } as const satisfies PublicNavItem;

// The home page's section that presents every RW, the one place the desktop header sends a visitor to choose a
// kampung (decision of 2026-10-22, docs/StyleGuide.md §10.2).
export const HOME_RW_SECTION_ID = 'kampung';

// Every booking starts from a package, so the booking button opens the package catalogue.
export const BOOKING_CTA = {
  label: 'Pesan Kunjungan',
  // Below md the header button has room for one word next to the wordmark and the menu.
  shortLabel: 'Pesan',
  href: '/paket-wisata',
} as const satisfies PublicNavItem & { shortLabel: string };

// The units of the public layout are full profiles; a summary (a test, another caller) simply goes without the theme.
type NavRwUnit = RwUnitSummary & Partial<Pick<RwUnitProfile, 'themeLabel'>>;

const rwItem = (unit: NavRwUnit): PublicNavItem => ({
  label: unit.shortName,
  href: unit.path,
  rw: { label: unit.label, shortName: unit.shortName, accentKey: unit.accentKey },
  ...(unit.themeLabel ? { description: unit.themeLabel } : {}),
});

const scheduleItem = (unit: NavRwUnit): PublicNavItem => ({
  label: `Jadwal pertunjukan ${unit.label}`,
  href: rwSchedulePath(unit.slug),
});

const PACKAGES_ITEM: PublicNavItem = { label: 'Paket wisata', href: '/paket-wisata' };
const PRODUCTS_ITEM: PublicNavItem = { label: 'Produk UMKM', href: '/produk' };
const GALLERY_ITEM: PublicNavItem = { label: 'Galeri', href: '/galeri' };
const MAP_ITEM: PublicNavItem = { label: 'Peta & kontak', href: '/peta-kontak' };

// The way back to a booking without an account; the desktop header shows it as a pill (DESIGN-SPEC §2.7).
export const LOOKUP_NAV_ITEM = {
  label: 'Cari reservasi',
  href: '/reservasi/cari',
} as const satisfies PublicNavItem;

const VISIT_GROUP: PublicNavGroup = {
  title: 'Kunjungan',
  items: [PACKAGES_ITEM, PRODUCTS_ITEM, LOOKUP_NAV_ITEM],
};

const INFORMATION_GROUP: PublicNavGroup = {
  title: 'Informasi',
  items: [
    GALLERY_ITEM,
    { label: 'E-booklet', href: '/e-booklet' },
    { label: 'Artikel', href: '/artikel' },
    { label: 'Ulasan', href: '/ulasan' },
    MAP_ITEM,
  ],
};

// The RWs come from rw_units in their own order (decision of 2026-10-21). The desktop header has room for five links,
// so it sends a visitor to the home page's RW section rather than naming every RW: visitors do not know the RWs by
// number, and a menu of them would cost every public page client script (decision of 2026-10-22). The mobile menu,
// the footer, that section and the breadcrumbs link each RW directly, the schedule of each RW that runs one among
// them.
export function publicNavFor(units: readonly NavRwUnit[]): PublicNav {
  const rwItems = units.map(rwItem);
  const kampungItem: PublicNavItem = {
    label: 'Kampung Wisata',
    href: `${HOME_NAV_ITEM.href}#${HOME_RW_SECTION_ID}`,
    currentOn: units.map((unit) => unit.path),
  };
  return {
    headerItems: [kampungItem, PACKAGES_ITEM, PRODUCTS_ITEM, GALLERY_ITEM, MAP_ITEM],
    groups: [
      {
        title: 'Edu wisata',
        items: [...rwItems, ...units.filter((unit) => unit.scheduleEnabled).map(scheduleItem)],
      },
      VISIT_GROUP,
      INFORMATION_GROUP,
    ],
  };
}

// Whether a link marks the page the visitor is on: its own address and the pages below it, or for a link to a section
// of another page, the pages it stands for.
export function isCurrentNavItem(item: PublicNavItem, pathname: string): boolean {
  if (item.currentOn) return item.currentOn.some((path) => isPathUnder(pathname, path));
  return isPathUnder(pathname, item.href);
}

export const LEGAL_NAV_ITEMS: readonly PublicNavItem[] = [
  { label: 'Kebijakan privasi', href: '/privasi' },
  // `Permintaan data pribadi` (/privasi/permintaan) returns with its form in P3.12.03 (decision of 2026-10-18,
  // go-live check #23); until then /privasi explains the request by email.
];
