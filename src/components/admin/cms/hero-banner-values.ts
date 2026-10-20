import { toJakartaDateTimeField } from '@/lib/utils/dates';
import type { HeroBannerInput } from '@/lib/validations/hero-banner';
import type { HeroBannerAdmin } from '@/types/cms';

export function blankHeroBanner(): HeroBannerInput {
  return {
    title: '',
    subtitle: '',
    ctaLabel: '',
    ctaHref: '',
    imagePath: null,
    mobileImagePath: null,
    productId: null,
    sortOrder: 0,
    isActive: true,
    startsAt: '',
    endsAt: '',
  };
}

// The form's fields for a stored banner; the id goes with the update action, never through a form field.
export function heroBannerValues(banner: HeroBannerAdmin): HeroBannerInput {
  return {
    title: banner.title,
    subtitle: banner.subtitle ?? '',
    ctaLabel: banner.ctaLabel ?? '',
    ctaHref: banner.ctaHref ?? '',
    imagePath: banner.imagePath,
    mobileImagePath: banner.mobileImagePath,
    productId: banner.productId,
    sortOrder: banner.sortOrder,
    isActive: banner.isActive,
    startsAt: banner.startsAt === null ? '' : toJakartaDateTimeField(banner.startsAt),
    endsAt: banner.endsAt === null ? '' : toJakartaDateTimeField(banner.endsAt),
  };
}
