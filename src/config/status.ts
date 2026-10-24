import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Archive,
  Baby,
  Ban,
  Bug,
  Building2,
  CalendarX2,
  CheckCheck,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  CircleHelp,
  Clock,
  Cookie,
  Copy,
  Drama,
  Eye,
  FilePen,
  FileText,
  Flag,
  Gamepad2,
  Gift,
  GraduationCap,
  Hand,
  HeartHandshake,
  Hourglass,
  Landmark,
  Layers,
  Leaf,
  Lock,
  MailCheck,
  MapPin,
  Music,
  PackageCheck,
  PauseCircle,
  Recycle,
  RotateCcw,
  ScanSearch,
  Scissors,
  Send,
  ShieldAlert,
  ShieldX,
  ShoppingBag,
  Sprout,
  Store,
  Ticket,
  TicketX,
  Timer,
  UserX,
  XCircle,
} from 'lucide-react';

import type { EnumValue } from '@/db/enums';

// docs/StyleGuide.md §9.2: Postgres enum values are translated here and nowhere else, and icons follow the map of
// §8.1. A missing value fails the build (Record over the enum). The status badges of §6.5 read STATUS_META.

export interface EnumMeta {
  label: string;
  icon: LucideIcon;
}

export const PACKAGE_CATEGORY: Record<EnumValue<'package_category'>, EnumMeta> = {
  regular: { label: 'Reguler', icon: Ticket },
  student: { label: 'Pelajar', icon: GraduationCap },
  institutional: { label: 'Institusi', icon: Building2 },
  combo: { label: 'Kombinasi', icon: Layers },
};

export const PRODUCT_CATEGORY: Record<EnumValue<'product_category'>, EnumMeta> = {
  compost: { label: 'Kompos', icon: Leaf },
  seedling: { label: 'Bibit', icon: Sprout },
  recycled_craft: { label: 'Kerajinan Daur Ulang', icon: Recycle },
  snack: { label: 'Camilan', icon: Cookie },
  souvenir: { label: 'Suvenir', icon: Gift },
  other: { label: 'Lainnya', icon: ShoppingBag },
};

export const ACTIVITY_POINT_TYPE: Record<EnumValue<'activity_point_type'>, EnumMeta> = {
  bank_sampah: { label: 'Bank Sampah', icon: Recycle },
  composter: { label: 'Pengomposan', icon: Leaf },
  maggot: { label: 'Budidaya Maggot', icon: Bug },
  urban_farming: { label: 'Urban Farming', icon: Sprout },
  pkk_craft: { label: 'Kerajinan PKK', icon: Scissors },
  sanggar: { label: 'Sanggar', icon: Music },
  culture_house: { label: 'Rumah Budaya', icon: Landmark },
  stage: { label: 'Panggung', icon: Drama },
  dolanan_area: { label: 'Area Dolanan', icon: Gamepad2 },
  inclusion_center: { label: 'Pusat Inklusi', icon: HeartHandshake },
  child_friendly_space: { label: 'Ruang Ramah Anak', icon: Baby },
  umkm_stall: { label: 'Lapak UMKM', icon: Store },
  meeting_point: { label: 'Titik Kumpul', icon: Flag },
  other: { label: 'Lainnya', icon: MapPin },
};

export const SCHEDULE_TYPE_LABELS: Record<EnumValue<'schedule_type'>, string> = {
  dance_performance: 'Pertunjukan Tari',
  dolanan_session: 'Sesi Dolanan',
  workshop: 'Lokakarya',
  art_class: 'Kelas Seni',
  other: 'Lainnya',
};

export const ARTICLE_CATEGORY_LABELS: Record<EnumValue<'article_category'>, string> = {
  news: 'Berita',
  education: 'Edukasi',
  announcement: 'Pengumuman',
};

export const BOOKLET_KIND_LABELS: Record<EnumValue<'booklet_kind'>, string> = {
  ebooklet: 'E-booklet',
  visit_proposal: 'Proposal Kunjungan',
  price_list: 'Daftar Harga',
};

export const GALLERY_CATEGORY_LABELS: Record<EnumValue<'gallery_category'>, string> = {
  activity: 'Kegiatan',
  umkm: 'UMKM',
  visit: 'Kunjungan',
  event: 'Acara',
};

// docs/StyleGuide.md §6.5: the soft Badge variant and whether it is the outline (terminal) form.
export type BadgeTone = 'success' | 'warning' | 'info' | 'danger' | 'neutral';

export interface StatusMeta {
  tone: BadgeTone;
  outline?: true;
  label: string;
  icon: LucideIcon;
}

// The enums a StatusBadge can show, each mirrored in src/db/enums.ts.
type StatusEnumName =
  | 'content_status'
  | 'booking_status'
  | 'payment_status'
  | 'ticket_status'
  | 'notification_status'
  | 'review_status'
  | 'certificate_status'
  | 'adjustment_status'
  | 'session_status'
  | 'scan_result'
  | 'booking_leg_status'
  | 'addon_fulfillment_status'
  | 'quotation_status'
  | 'invoice_status'
  | 'alert_severity';

type StatusMap<Name extends StatusEnumName> = Record<EnumValue<Name>, StatusMeta>;

export const CONTENT_STATUS: StatusMap<'content_status'> = {
  draft: { tone: 'neutral', label: 'Draf', icon: FilePen },
  pending_review: { tone: 'warning', label: 'Menunggu Tinjauan', icon: Clock },
  published: { tone: 'success', label: 'Tayang', icon: CheckCircle2 },
  archived: { tone: 'neutral', outline: true, label: 'Arsip', icon: Archive },
};

export const BOOKING_STATUS: StatusMap<'booking_status'> = {
  quoted: { tone: 'neutral', label: 'Penawaran', icon: FileText },
  pending_payment: { tone: 'warning', label: 'Menunggu Pembayaran', icon: Clock },
  paid: { tone: 'success', label: 'Lunas', icon: CheckCircle2 },
  checked_in: { tone: 'info', label: 'Check-in', icon: ScanSearch },
  completed: { tone: 'success', outline: true, label: 'Selesai', icon: CheckCheck },
  no_show: { tone: 'neutral', outline: true, label: 'Tidak Hadir', icon: UserX },
  expired: { tone: 'neutral', outline: true, label: 'Kedaluwarsa', icon: Timer },
  cancelled: { tone: 'danger', label: 'Dibatalkan', icon: XCircle },
  refunded: { tone: 'danger', outline: true, label: 'Dikembalikan', icon: RotateCcw },
};

export const PAYMENT_STATUS: StatusMap<'payment_status'> = {
  initiated: { tone: 'neutral', label: 'Dibuat', icon: CircleDashed },
  pending: { tone: 'warning', label: 'Menunggu', icon: Clock },
  needs_review: { tone: 'warning', label: 'Perlu Tinjauan', icon: Eye },
  settled: { tone: 'success', label: 'Lunas', icon: CheckCircle2 },
  denied: { tone: 'danger', label: 'Ditolak', icon: Ban },
  failed: { tone: 'danger', label: 'Gagal', icon: XCircle },
  cancelled: { tone: 'neutral', label: 'Dibatalkan', icon: XCircle },
  expired: { tone: 'neutral', outline: true, label: 'Kedaluwarsa', icon: Timer },
  refunded: { tone: 'danger', outline: true, label: 'Dikembalikan', icon: RotateCcw },
  partially_refunded: {
    tone: 'warning',
    outline: true,
    label: 'Dikembalikan Sebagian',
    icon: RotateCcw,
  },
  disputed: { tone: 'danger', label: 'Sengketa', icon: AlertTriangle },
  duplicate: { tone: 'danger', label: 'Duplikat', icon: Copy },
};

export const TICKET_STATUS: StatusMap<'ticket_status'> = {
  issued: { tone: 'info', label: 'Terbit', icon: Ticket },
  used: { tone: 'success', label: 'Terpakai', icon: CheckCircle2 },
  suspended: { tone: 'warning', label: 'Ditangguhkan', icon: PauseCircle },
  revoked: { tone: 'danger', label: 'Dicabut', icon: TicketX },
  expired: { tone: 'neutral', label: 'Kedaluwarsa', icon: Timer },
};

export const NOTIFICATION_STATUS: StatusMap<'notification_status'> = {
  queued: { tone: 'neutral', label: 'Antre', icon: Hourglass },
  sending: { tone: 'info', label: 'Mengirim', icon: Send },
  sent: { tone: 'info', label: 'Terkirim', icon: Send },
  delivered: { tone: 'success', label: 'Diterima', icon: MailCheck },
  read: { tone: 'success', outline: true, label: 'Dibaca', icon: Eye },
  failed: { tone: 'danger', label: 'Gagal', icon: XCircle },
  cancelled: { tone: 'neutral', outline: true, label: 'Dibatalkan', icon: Ban },
};

export const REVIEW_STATUS: StatusMap<'review_status'> = {
  pending: { tone: 'warning', label: 'Menunggu Moderasi', icon: Clock },
  published: { tone: 'success', label: 'Tayang', icon: CheckCircle2 },
  rejected: { tone: 'danger', label: 'Ditolak', icon: Ban },
};

export const CERTIFICATE_STATUS: StatusMap<'certificate_status'> = {
  issued: { tone: 'success', label: 'Terbit', icon: CheckCircle2 },
  revoked: { tone: 'danger', label: 'Dicabut', icon: XCircle },
};

export const ADJUSTMENT_STATUS: StatusMap<'adjustment_status'> = {
  proposed: { tone: 'warning', label: 'Diusulkan', icon: FilePen },
  approved: { tone: 'info', label: 'Disetujui', icon: CheckCircle2 },
  rejected: { tone: 'danger', label: 'Ditolak', icon: Ban },
  applied: { tone: 'success', label: 'Diterapkan', icon: CheckCheck },
};

export const SESSION_STATUS: StatusMap<'session_status'> = {
  open: { tone: 'success', label: 'Buka', icon: CircleDot },
  closed: { tone: 'neutral', label: 'Tutup', icon: Lock },
  cancelled: { tone: 'danger', label: 'Dibatalkan', icon: CalendarX2 },
};

export const SCAN_RESULT: StatusMap<'scan_result'> = {
  ok: { tone: 'success', label: 'Tiket valid', icon: CheckCircle2 },
  already_used: { tone: 'warning', label: 'Tiket sudah dipakai', icon: AlertTriangle },
  outside_window: { tone: 'warning', label: 'Di luar jam sesi', icon: Clock },
  wrong_date: { tone: 'warning', label: 'Tanggal kunjungan berbeda', icon: CalendarX2 },
  invalid_signature: { tone: 'danger', label: 'Bukan tiket resmi', icon: ShieldX },
  not_found: { tone: 'danger', label: 'Tiket tidak ditemukan', icon: XCircle },
  suspended: { tone: 'danger', label: 'Tiket ditangguhkan', icon: PauseCircle },
  revoked: { tone: 'danger', label: 'Tiket dicabut', icon: TicketX },
  wrong_rw: { tone: 'danger', label: 'Tiket untuk RW lain', icon: MapPin },
  booking_not_paid: { tone: 'danger', label: 'Reservasi belum lunas', icon: Ban },
  ticket_expired: { tone: 'danger', label: 'Tiket kedaluwarsa', icon: Timer },
  forbidden: { tone: 'danger', label: 'Tidak berwenang', icon: ShieldAlert },
};

export const BOOKING_LEG_STATUS: StatusMap<'booking_leg_status'> = {
  unreserved: { tone: 'neutral', label: 'Belum Dipesan', icon: CircleDashed },
  reserved: { tone: 'info', label: 'Dipesan', icon: CircleDot },
  checked_in: { tone: 'success', label: 'Check-in', icon: CheckCircle2 },
  released: { tone: 'neutral', outline: true, label: 'Dilepas', icon: RotateCcw },
};

export const ADDON_FULFILLMENT_STATUS: StatusMap<'addon_fulfillment_status'> = {
  pending: { tone: 'warning', label: 'Menunggu', icon: Clock },
  prepared: { tone: 'info', label: 'Disiapkan', icon: PackageCheck },
  handed_over: { tone: 'success', label: 'Diserahkan', icon: Hand },
  cancelled: { tone: 'neutral', label: 'Dibatalkan', icon: Ban },
};

export const QUOTATION_STATUS: StatusMap<'quotation_status'> = {
  issued: { tone: 'info', label: 'Terbit', icon: FileText },
  accepted: { tone: 'success', label: 'Diterima', icon: CheckCircle2 },
  expired: { tone: 'neutral', label: 'Kedaluwarsa', icon: Timer },
  superseded: { tone: 'neutral', outline: true, label: 'Digantikan', icon: Copy },
  void: { tone: 'danger', label: 'Batal', icon: XCircle },
};

export const INVOICE_STATUS: StatusMap<'invoice_status'> = {
  issued: { tone: 'info', label: 'Terbit', icon: FileText },
  paid: { tone: 'success', label: 'Lunas', icon: CheckCircle2 },
  void: { tone: 'danger', label: 'Batal', icon: XCircle },
};

export const ALERT_SEVERITY: StatusMap<'alert_severity'> = {
  info: { tone: 'info', label: 'Info', icon: CircleDot },
  medium: { tone: 'warning', label: 'Sedang', icon: AlertTriangle },
  high: { tone: 'danger', label: 'Tinggi', icon: AlertTriangle },
  critical: { tone: 'danger', label: 'Kritis', icon: ShieldAlert },
};

// StatusBadge looks a value up by its enum name: `<StatusBadge kind="booking_status" value={booking.status} />`.
export const STATUS_META = {
  content_status: CONTENT_STATUS,
  booking_status: BOOKING_STATUS,
  payment_status: PAYMENT_STATUS,
  ticket_status: TICKET_STATUS,
  notification_status: NOTIFICATION_STATUS,
  review_status: REVIEW_STATUS,
  certificate_status: CERTIFICATE_STATUS,
  adjustment_status: ADJUSTMENT_STATUS,
  session_status: SESSION_STATUS,
  scan_result: SCAN_RESULT,
  booking_leg_status: BOOKING_LEG_STATUS,
  addon_fulfillment_status: ADDON_FULFILLMENT_STATUS,
  quotation_status: QUOTATION_STATUS,
  invoice_status: INVOICE_STATUS,
  alert_severity: ALERT_SEVERITY,
} as const satisfies { [Name in StatusEnumName]: StatusMap<Name> };

export type StatusKind = keyof typeof STATUS_META;

// A value the map does not know (a row written by a newer migration than this build) reads as a neutral badge with
// the raw value, never a crash (review of PR #31, item 9); status.test.ts proves every enum value is mapped, and the
// Sentry capture of such a row lands with the monitoring of P5 (MON-*), since @sentry/nextjs is not wired yet.
function fallbackStatusMeta(value: string): StatusMeta {
  return { tone: 'neutral', outline: true, label: value, icon: CircleHelp };
}

// Every map is a Record over its enum; the index type only lets TypeScript see through the generic kind.
export function statusMetaOf<Kind extends StatusKind>(
  kind: Kind,
  value: EnumValue<Kind>,
): StatusMeta {
  const map: Record<string, StatusMeta | undefined> = STATUS_META[kind];
  return map[value] ?? fallbackStatusMeta(value);
}
