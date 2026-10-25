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

// Public navigation lives in src/config/public-nav.ts; it is re-exported here for the server components that read both.
export * from '@/config/public-nav';

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
      // An RW admin exports their own RW's attendance; the superadmin every kind (Task P4.6.03).
      { label: 'Ekspor', href: '/dashboard/exports', icon: Download, roles: BOTH_ROLES },
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
