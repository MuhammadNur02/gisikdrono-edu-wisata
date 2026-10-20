import { z } from 'zod';

import { CMS_LIMITS } from '@/config/cms';
import { copy } from '@/lib/copy/id';
import {
  contentText,
  imagePathSchema,
  optionalContentText,
  optionalJakartaDateTimeSchema,
  rowIdSchema,
  sortOrderSchema,
} from '@/lib/validations/content';

// /dashboard/settings/hero-banners (docs/PRD.md FR-ADMIN-23, FR-PUB-01): the home page's slides, the superadmin's alone. A button
// leads to a page of this site only, as hero_banners.cta_href's CHECK says, and its address holds no space or
// backslash either, so it cannot be read as another host.

const messages = copy.cms.validation;
const INTERNAL_PATH = /^\/(?![/\\])[^\s\\]*$/;

const bannerFields = {
  title: contentText(CMS_LIMITS.bannerTitle),
  subtitle: optionalContentText(CMS_LIMITS.bannerSubtitle),
  ctaLabel: optionalContentText(CMS_LIMITS.bannerCtaLabel),
  ctaHref: optionalContentText(CMS_LIMITS.bannerCtaHref).refine(
    (href) => href === null || INTERNAL_PATH.test(href),
    messages.internalPath,
  ),
  imagePath: imagePathSchema,
  mobileImagePath: imagePathSchema,
  productId: rowIdSchema.nullable(),
  sortOrder: sortOrderSchema,
  isActive: z.boolean(),
  startsAt: optionalJakartaDateTimeSchema,
  endsAt: optionalJakartaDateTimeSchema,
};

interface BannerRules {
  imagePath: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  startsAt: string | null;
  endsAt: string | null;
}

function checkBanner(banner: BannerRules, context: z.RefinementCtx): void {
  if (banner.imagePath === null) {
    context.addIssue({ code: 'custom', path: ['imagePath'], message: messages.imageRequired });
  }
  if ((banner.ctaLabel === null) !== (banner.ctaHref === null)) {
    context.addIssue({ code: 'custom', path: ['ctaHref'], message: messages.ctaPair });
  }
  const { startsAt, endsAt } = banner;
  if (startsAt !== null && endsAt !== null && Date.parse(endsAt) <= Date.parse(startsAt)) {
    context.addIssue({ code: 'custom', path: ['endsAt'], message: messages.endAfterStart });
  }
}

export const createHeroBannerSchema = z.object(bannerFields).strict().superRefine(checkBanner);

export const updateHeroBannerSchema = z
  .object({ id: rowIdSchema, ...bannerFields })
  .strict()
  .superRefine(checkBanner);

export type HeroBannerInput = z.input<typeof createHeroBannerSchema>;
export type HeroBannerValues = z.output<typeof createHeroBannerSchema>;
export type UpdateHeroBannerValues = z.output<typeof updateHeroBannerSchema>;
