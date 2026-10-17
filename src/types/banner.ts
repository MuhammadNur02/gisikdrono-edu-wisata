import type { PublicImage } from '@/types/media';

export interface HeroBanner {
  id: string;
  title: string;
  subtitle: string | null;
  ctaLabel: string | null;
  // An internal path only (hero_banners CHECK).
  ctaHref: string | null;
  image: PublicImage;
  mobileImage: PublicImage | null;
  // The featured UMKM product the slide points at, while that product is published.
  productSlug: string | null;
}
