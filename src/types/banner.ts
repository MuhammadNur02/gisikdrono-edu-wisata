import type { PublicImage } from '@/types/media';
import type { ProductSummary } from '@/types/product';

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

// A home hero slide: the banner and, when it points at one that is still published, its UMKM product.
export interface HeroSlideData {
  banner: HeroBanner;
  product: ProductSummary | null;
}
