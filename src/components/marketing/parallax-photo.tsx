import { PhotoFrame } from '@/components/marketing/photo';
import { cn } from '@/lib/utils/cn';
import type { PublicImage } from '@/types/media';

export interface ParallaxPhotoProps {
  image: PublicImage;
  // A preset from IMAGE_SIZES.
  sizes: string;
  // The frame's proportions, such as `aspect-4/3 lg:aspect-21/9`.
  aspectClassName: string;
  className?: string;
}

// docs/StyleGuide.md §7.3 (decision of 2026-10-23): a decorative photo in a fixed frame whose image drifts against
// the page's native scroll, after dusunbambu.id's parallax bands. It is CSS only (`parallax-frame` / `parallax-drift`
// in src/styles/globals.css): no script, no scroll handler, nothing to hydrate. The layer is taller than its frame
// from the first paint, so the drift moves nothing around it. Never the LCP image: the hero photo is pinned instead.
export function ParallaxPhoto({ image, sizes, aspectClassName, className }: ParallaxPhotoProps) {
  return (
    <div className={cn('parallax-frame relative overflow-hidden bg-muted', aspectClassName, className)}>
      <div className="parallax-drift absolute inset-x-0 top-1/2 h-(--parallax-overscan) -translate-y-1/2">
        <PhotoFrame
          image={image}
          sizes={sizes}
          aspectClassName=""
          className="absolute inset-0 rounded-none"
        />
      </div>
    </div>
  );
}
