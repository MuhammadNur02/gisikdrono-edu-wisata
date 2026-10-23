import dynamic from 'next/dynamic';

import { PhotoFrame } from '@/components/marketing/photo';
import { cn } from '@/lib/utils/cn';
import type { PublicImage } from '@/types/media';

// The scroll hooks reach the browser after the page itself; the frame and the photo are server HTML of a fixed
// size, so nothing shifts when the drift starts (docs/StyleGuide.md §10.1).
const ParallaxLayer = dynamic(() =>
  import('@/components/marketing/parallax-layer').then((module) => module.ParallaxLayer),
);

export interface ParallaxPhotoProps {
  image: PublicImage;
  // A preset from IMAGE_SIZES.
  sizes: string;
  // The frame's proportions, such as `aspect-4/3 lg:aspect-21/9`.
  aspectClassName: string;
  className?: string;
}

// A decorative photo in a fixed frame whose image drifts with the scroll from md (§7.3). Never the LCP image: the
// hero photo is pinned with CSS instead.
export function ParallaxPhoto({ image, sizes, aspectClassName, className }: ParallaxPhotoProps) {
  return (
    <div className={cn('relative overflow-hidden bg-muted', aspectClassName, className)}>
      <ParallaxLayer>
        <PhotoFrame
          image={image}
          sizes={sizes}
          aspectClassName=""
          className="absolute inset-0 rounded-none"
        />
      </ParallaxLayer>
    </div>
  );
}
