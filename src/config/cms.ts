import type { RwId } from '@/config/rw';
import type { EnumValue } from '@/db/enums';

// The content screens of the dashboard (Task P2.9.04–P2.9.06, docs/PRD.md FR-ADMIN-10 … FR-ADMIN-15, FR-ADMIN-23).

export const CMS_PATHS = {
  articles: '/dashboard/articles',
  newArticle: '/dashboard/articles/new',
  editArticle: (id: string) => `/dashboard/articles/${id}/edit`,
  galleries: '/dashboard/galleries',
  booklets: '/dashboard/booklets',
  schedules: '/dashboard/schedules',
  activityPoints: '/dashboard/activity-points',
  pages: '/dashboard/pages',
  heroBanners: '/dashboard/settings/hero-banners',
} as const;

// Length caps (docs/Security.md APP-09). Where the table has a CHECK the cap is the same number; the others keep a
// pasted essay or a runaway form from reaching the database.
export const CMS_LIMITS = {
  slug: 80,
  articleTitle: 160,
  articleExcerpt: 300,
  seoTitle: 70,
  seoDescription: 160,
  articleBodyBytes: 200_000,
  tag: 30,
  tags: 10,
  caption: 300,
  bookletTitle: 160,
  bookletDescription: 1000,
  bannerTitle: 90,
  bannerSubtitle: 160,
  bannerCtaLabel: 30,
  bannerCtaHref: 200,
  pointName: 120,
  pointShortDescription: 200,
  longText: 5000,
  scheduleTitle: 160,
  venue: 160,
  recurrenceRule: 300,
  tagline: 160,
  sortOrder: 9999,
} as const;

// docs/PRD.md FR-ADMIN-13: performance schedules belong to RW 08's arts programme; the RW 08 admin and the superadmin
// manage them, and the superadmin's are RW 08's whatever the RwSwitcher says.
export const SCHEDULE_RW_ID: RwId = 8;

// The statuses each form offers. Articles move through moderation (articles_moderation_guard, 0004), so their status
// follows from the button pressed rather than from a field.
export const PUBLISHABLE_STATUSES = [
  'draft',
  'published',
] as const satisfies readonly EnumValue<'content_status'>[];
export type PublishableStatus = (typeof PUBLISHABLE_STATUSES)[number];

// What an article action asks for: an RW admin saves a draft or sends it for review; the superadmin publishes or takes
// it back to draft.
export const ARTICLE_INTENTS = ['draft', 'review', 'publish'] as const;
export type ArticleIntent = (typeof ARTICLE_INTENTS)[number];

// activity_points.map_x / map_y are percentages of the site plan (docs/StyleGuide.md §8.3), 0–100 with two decimals.
export const MAP_PERCENT_MAX = 100;
export const MAP_PERCENT_DECIMALS = 2;
// 10 to the power of MAP_PERCENT_DECIMALS, for rounding a click to those decimals.
export const MAP_PERCENT_ROUNDING = 100;

// How deep the JSON of an article body may nest: ARTICLE_MAX_DEPTH blocks take a few levels each (content, attrs,
// marks), so this leaves room for any document the editor writes and refuses one built to exhaust the server.
export const ARTICLE_JSON_MAX_DEPTH = 64;

// The longest each month gets, February in a leap year, for the days a schedule's recurrence rule may name
// (finding 3 of the review of PR #18).
export const MONTH_LENGTHS_IN_LEAP_YEAR = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
