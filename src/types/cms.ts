import type { RwId } from '@/config/rw';
import type { EnumValue } from '@/db/enums';
import type { Json } from '@/db/types';
import type { BannerPhase } from '@/lib/utils/hero-banners';
import type { ContentOwner } from '@/types/content';

// What the dashboard's content screens read and the CMS actions answer with (Task P2.9.05). Plain values only: they
// cross into client components.

export interface RwPageAdmin {
  rwId: RwId;
  // The RW's public page.
  path: string;
  name: string;
  tagline: string | null;
  descriptionMd: string | null;
  visionMd: string | null;
  heroImagePath: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  mapLat: number | null;
  mapLng: number | null;
}

// An RW page as the dashboard list shows it (Task P4.3.03): the RW's id, as text, is the row's.
export interface RwPageListItem extends RwPageAdmin {
  id: string;
}

export interface ActivityPointAdmin {
  id: string;
  rwId: RwId;
  name: string;
  slug: string;
  pointType: EnumValue<'activity_point_type'>;
  shortDescription: string | null;
  bodyMd: string | null;
  imagePath: string | null;
  mapX: number | null;
  mapY: number | null;
  // activity_points.svg_hotspot_id as stored, text; the form narrows it to the plan's ids (PLAN_HOTSPOT_IDS).
  svgHotspotId: string | null;
  lat: number | null;
  lng: number | null;
  sortOrder: number;
  status: EnumValue<'content_status'>;
}

// Times are ISO strings with Semarang's +07:00 offset.
export interface ScheduleAdmin {
  id: string;
  title: string;
  scheduleType: EnumValue<'schedule_type'>;
  descriptionMd: string | null;
  startsAt: string;
  endsAt: string;
  venue: string | null;
  recurrenceRule: string | null;
  imagePath: string | null;
  packageId: string | null;
  status: EnumValue<'content_status'>;
}

export interface SchedulePackageOption {
  id: string;
  name: string;
}

export interface GalleryItemAdmin {
  id: string;
  owner: ContentOwner;
  category: EnumValue<'gallery_category'>;
  mediaType: EnumValue<'media_type'>;
  // The photo, or a video's own still; null for a video without one.
  previewPath: string | null;
  videoUrl: string | null;
  caption: string | null;
  altText: string;
  takenAt: string | null;
  sortOrder: number;
  status: EnumValue<'content_status'>;
}

export interface BookletAdmin {
  id: string;
  owner: ContentOwner;
  kind: EnumValue<'booklet_kind'>;
  slug: string;
  title: string;
  description: string | null;
  pdfPath: string;
  coverPath: string | null;
  pageCount: number | null;
  downloadCount: number;
  status: EnumValue<'content_status'>;
}

export interface HeroBannerAdmin {
  id: string;
  title: string;
  subtitle: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  imagePath: string;
  mobileImagePath: string | null;
  productId: string | null;
  sortOrder: number;
  isActive: boolean;
  // ISO in Asia/Jakarta, or null for no bound.
  startsAt: string | null;
  endsAt: string | null;
}

// A banner as the dashboard list shows it (Task P4.9.02): where it stands now, worked out on the server so the page and
// its hydration agree, and the featured product's name.
export interface HeroBannerListItem extends HeroBannerAdmin {
  phase: BannerPhase;
  productName: string | null;
  // Whether the row offers a move up or down: only in the home page's order, and not past either end.
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export interface BannerProductOption {
  id: string;
  name: string;
}

export interface ArticleListItem {
  id: string;
  owner: ContentOwner;
  slug: string;
  title: string;
  category: EnumValue<'article_category'>;
  status: EnumValue<'content_status'>;
  updatedAt: string;
}

export interface ArticleAdmin {
  id: string;
  owner: ContentOwner;
  slug: string;
  title: string;
  excerpt: string | null;
  // articles.body_json as stored; the allowlist renderer decides what of it is shown.
  bodyJson: Json;
  coverPath: string | null;
  category: EnumValue<'article_category'>;
  tags: string[];
  status: EnumValue<'content_status'>;
  seoTitle: string | null;
  seoDescription: string | null;
}

// A write that also took the files it replaced or removed out of public-media: what was saved, and whether every
// one of those files went (docs/Security.md R34).
export interface CleanedUp<T> {
  value: T;
  filesRemoved: boolean;
}
