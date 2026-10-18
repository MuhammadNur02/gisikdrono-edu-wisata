import type { LucideIcon } from 'lucide-react';
import {
  Bug,
  Building2,
  Drama,
  Flag,
  Gamepad2,
  GraduationCap,
  Landmark,
  Layers,
  Leaf,
  MapPin,
  Music,
  Recycle,
  Scissors,
  Sprout,
  Store,
  Ticket,
} from 'lucide-react';

import type { EnumValue } from '@/db/enums';

// docs/StyleGuide.md §9.2: Postgres enum values are translated here and nowhere else, and icons follow the map of
// §8.1. A missing value fails the build (Record over the enum). The status badges of §6.5 join this file in P2.8.

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

export const PRODUCT_CATEGORY_LABELS: Record<EnumValue<'product_category'>, string> = {
  compost: 'Kompos',
  seedling: 'Bibit',
  recycled_craft: 'Kerajinan Daur Ulang',
  snack: 'Camilan',
  souvenir: 'Suvenir',
  other: 'Lainnya',
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
