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

import { RW_PROGRAMMES, type RwId } from '@/config/rw';
import type { AppRole } from '@/db/enums';

// Public navigation (docs/PRD.md §5.1) and the dashboard groups of docs/StyleGuide.md §6.2.

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

// ===== Dashboard (docs/StyleGuide.md §6.2) =====

type StaffRole = Exclude<AppRole, 'none'>;

export interface DashboardNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: readonly StaffRole[];
  // Set where an RW officer sees the item for some RWs only; the superadmin always sees it.
  rwIds?: readonly RwId[];
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
        rwIds: [8],
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
      { label: 'Ulasan', href: '/dashboard/reviews', icon: MessageSquare, roles: SUPERADMIN_ONLY },
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
