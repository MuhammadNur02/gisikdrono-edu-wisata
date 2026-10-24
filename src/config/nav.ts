import {
  Award,
  BookOpen,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Download,
  FileText,
  ImageIcon,
  Images,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  Newspaper,
  Package,
  PieChart,
  Scale,
  ScanLine,
  ScrollText,
  Settings,
  ShieldAlert,
  ShoppingBag,
  SlidersHorizontal,
  UserCheck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import type { AppRole } from '@/db/enums';
import { isPathUnder, rwSchedulePath } from '@/lib/utils/paths';
import type { RwEyebrowData, RwUnitSummary } from '@/types/rw-unit';

// Public navigation (docs/PRD.md §5.1) and the dashboard groups of docs/StyleGuide.md §6.2.

export interface PublicNavItem {
  label: string;
  href: string;
  // Set on the RW pages, which carry the RW eyebrow in that RW's accent (docs/StyleGuide.md §2.7).
  rw?: RwEyebrowData;
  // For a link to a section of another page: the pages on which it still marks the current section.
  currentOn?: readonly string[];
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

const rwItem = (unit: RwUnitSummary): PublicNavItem => ({
  label: unit.shortName,
  href: unit.path,
  rw: { label: unit.label, shortName: unit.shortName, accentKey: unit.accentKey },
});

const scheduleItem = (unit: RwUnitSummary): PublicNavItem => ({
  label: `Jadwal pertunjukan ${unit.label}`,
  href: rwSchedulePath(unit.slug),
});

const PACKAGES_ITEM: PublicNavItem = { label: 'Paket wisata', href: '/paket-wisata' };
const PRODUCTS_ITEM: PublicNavItem = { label: 'Produk UMKM', href: '/produk' };
const GALLERY_ITEM: PublicNavItem = { label: 'Galeri', href: '/galeri' };
const MAP_ITEM: PublicNavItem = { label: 'Peta & kontak', href: '/peta-kontak' };

const VISIT_GROUP: PublicNavGroup = {
  title: 'Kunjungan',
  items: [PACKAGES_ITEM, PRODUCTS_ITEM, { label: 'Cari reservasi', href: '/reservasi/cari' }],
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
export function publicNavFor(units: readonly RwUnitSummary[]): PublicNav {
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

// ===== Dashboard (docs/StyleGuide.md §6.2) =====

type StaffRole = Exclude<AppRole, 'none'>;

export interface DashboardNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: readonly StaffRole[];
  // Set where an RW officer sees the item only if their RW runs a performance schedule (rw_units.schedule_enabled);
  // the superadmin always sees it.
  forScheduleRws?: boolean;
}

export interface DashboardNavGroup {
  title: string;
  items: readonly DashboardNavItem[];
}

const BOTH_ROLES = ['superadmin', 'admin_rw'] as const;
const SUPERADMIN_ONLY = ['superadmin'] as const;

// Every staff route of CLAUDE.md Appendix A.3 a role may open; requireRole() and RLS guard each of them as well,
// so a hidden item is never the only lock. The overview group is called Ringkasan on screen (Indonesian copy only,
// CLAUDE.md §12.1 no. 18).
export const DASHBOARD_NAV_GROUPS: readonly DashboardNavGroup[] = [
  {
    title: 'Ringkasan',
    items: [{ label: 'Dasbor', href: '/dashboard', icon: LayoutDashboard, roles: BOTH_ROLES }],
  },
  {
    title: 'Operasional',
    items: [
      { label: 'Reservasi', href: '/dashboard/bookings', icon: ClipboardList, roles: BOTH_ROLES },
      {
        label: 'Sesi Kunjungan',
        href: '/dashboard/sessions',
        icon: CalendarClock,
        roles: BOTH_ROLES,
      },
      { label: 'Scanner', href: '/dashboard/scanner', icon: ScanLine, roles: BOTH_ROLES },
      { label: 'Kehadiran', href: '/dashboard/attendance', icon: UserCheck, roles: BOTH_ROLES },
      { label: 'Sertifikat', href: '/dashboard/certificates', icon: Award, roles: BOTH_ROLES },
    ],
  },
  {
    title: 'Konten',
    items: [
      { label: 'Halaman RW', href: '/dashboard/pages', icon: FileText, roles: BOTH_ROLES },
      { label: 'Artikel', href: '/dashboard/articles', icon: Newspaper, roles: BOTH_ROLES },
      { label: 'Galeri', href: '/dashboard/galleries', icon: Images, roles: BOTH_ROLES },
      { label: 'E-Booklet', href: '/dashboard/booklets', icon: BookOpen, roles: BOTH_ROLES },
      {
        label: 'Jadwal Pertunjukan',
        href: '/dashboard/schedules',
        icon: CalendarDays,
        roles: BOTH_ROLES,
        forScheduleRws: true,
      },
      {
        label: 'Titik Aktivitas',
        href: '/dashboard/activity-points',
        icon: MapPin,
        roles: BOTH_ROLES,
      },
    ],
  },
  {
    title: 'Katalog',
    items: [
      { label: 'Paket Wisata', href: '/dashboard/packages', icon: Package, roles: BOTH_ROLES },
      { label: 'Produk UMKM', href: '/dashboard/products', icon: ShoppingBag, roles: BOTH_ROLES },
    ],
  },
  {
    title: 'Moderasi',
    items: [
      { label: 'Ulasan', href: '/dashboard/reviews', icon: MessageSquare, roles: BOTH_ROLES },
    ],
  },
  {
    title: 'Keuangan',
    items: [
      { label: 'Rekap', href: '/dashboard/finance', icon: Wallet, roles: SUPERADMIN_ONLY },
      {
        label: 'Bagi Hasil',
        href: '/dashboard/finance/revenue-share',
        icon: PieChart,
        roles: SUPERADMIN_ONLY,
      },
      {
        label: 'Rekonsiliasi',
        href: '/dashboard/finance/reconciliation',
        icon: Scale,
        roles: SUPERADMIN_ONLY,
      },
      {
        label: 'Penyesuaian',
        href: '/dashboard/finance/adjustments',
        icon: SlidersHorizontal,
        roles: SUPERADMIN_ONLY,
      },
      { label: 'Ekspor', href: '/dashboard/exports', icon: Download, roles: SUPERADMIN_ONLY },
    ],
  },
  {
    title: 'Administrasi',
    items: [
      { label: 'Pengguna', href: '/dashboard/users', icon: Users, roles: SUPERADMIN_ONLY },
      {
        label: 'Hero Banner',
        href: '/dashboard/settings/hero-banners',
        icon: ImageIcon,
        roles: SUPERADMIN_ONLY,
      },
      { label: 'Pengaturan', href: '/dashboard/settings', icon: Settings, roles: SUPERADMIN_ONLY },
      {
        label: 'Log Aktivitas',
        href: '/dashboard/audit-logs',
        icon: ScrollText,
        roles: SUPERADMIN_ONLY,
      },
      {
        label: 'Peringatan Keamanan',
        href: '/dashboard/security-alerts',
        icon: ShieldAlert,
        roles: SUPERADMIN_ONLY,
      },
    ],
  },
];
