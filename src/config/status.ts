import type { LucideIcon } from 'lucide-react';
import {
  Archive,
  Baby,
  Ban,
  Bug,
  Building2,
  CheckCircle2,
  Clock,
  Cookie,
  Drama,
  FilePen,
  FileCheck2,
  Flag,
  History,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartHandshake,
  Landmark,
  Layers,
  Leaf,
  MapPin,
  Music,
  Recycle,
  Scissors,
  ShoppingBag,
  Sprout,
  Store,
  Ticket,
} from 'lucide-react';

import type { EnumValue } from '@/db/enums';

// docs/StyleGuide.md §9.2: Postgres enum values are translated here and nowhere else, and icons follow the map of
// §8.1. A missing value fails the build (Record over the enum). The status badges of §6.5 join this file one enum at
// a time, as their screens are built.

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
  news: 'Kabar',
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

export const CONTENT_STATUS: Record<EnumValue<'content_status'>, StatusMeta> = {
  draft: { tone: 'neutral', label: 'Draf', icon: FilePen },
  pending_review: { tone: 'warning', label: 'Menunggu Tinjauan', icon: Clock },
  published: { tone: 'success', label: 'Tayang', icon: CheckCircle2 },
  archived: { tone: 'neutral', outline: true, label: 'Arsip', icon: Archive },
};

// The documents a visitor checks at /verifikasi/[code] (docs/PRD.md FR-PUB-20, Task P3.6.05).
export const QUOTATION_STATUS: Record<EnumValue<'quotation_status'>, StatusMeta> = {
  issued: { tone: 'success', label: 'Berlaku', icon: FileCheck2 },
  accepted: { tone: 'info', label: 'Disetujui', icon: CheckCircle2 },
  expired: { tone: 'neutral', outline: true, label: 'Kedaluwarsa', icon: Clock },
  superseded: { tone: 'neutral', outline: true, label: 'Diganti versi baru', icon: History },
  void: { tone: 'danger', outline: true, label: 'Dibatalkan', icon: Ban },
};

export const CERTIFICATE_STATUS: Record<EnumValue<'certificate_status'>, StatusMeta> = {
  issued: { tone: 'success', label: 'Sah', icon: FileCheck2 },
  revoked: { tone: 'danger', outline: true, label: 'Dicabut', icon: Ban },
};
