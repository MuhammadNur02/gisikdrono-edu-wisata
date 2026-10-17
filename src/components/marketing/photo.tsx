import Image from 'next/image';

import { PhotoPending } from '@/components/marketing/photo-pending';
import { cn } from '@/lib/utils/cn';
import type { PublicImage } from '@/types/media';

export interface PhotoProps {
  // NULL until the CMS has a real photo for this slot (docs/StyleGuide.md §1.3 G1).
  image: PublicImage | null;
  // Where or what the photo shows: the caption under it, or the subject of the Foto menyusul box (G8).
  caption: string;
  // A preset from IMAGE_SIZES in src/config/images.ts; next/image needs it to pick the width.
  sizes: string;
  // The slot's proportions, such as `aspect-video` or `aspect-4/3`, so the page never shifts (CLS).
  aspectClassName: string;
  // Only the first hero image of a page (docs/StyleGuide.md §8.2).
  priority?: boolean;
  className?: string;
}

// A public-media photo with its caption, or the Foto menyusul box when there is none yet.
export function Photo({
  image,
  caption,
  sizes,
  aspectClassName,
  priority = false,
  className,
}: PhotoProps) {
  if (!image) return <PhotoPending subject={caption} className={cn(aspectClassName, className)} />;
  // While the photo loads, the slot shows its average colour from the stored blurhash (docs/StyleGuide.md
  // §8.2); a colour from the data, not a design value, so it is the one inline style here.
  const placeholderStyle = image.placeholderColour
    ? { backgroundColor: image.placeholderColour }
    : undefined;
  return (
    <figure className={cn('space-y-2', className)}>
      <div
        className={cn('relative overflow-hidden rounded-xl bg-muted', aspectClassName)}
        style={placeholderStyle}
      >
        <Image
          src={image.path}
          alt={image.alt}
          fill
          sizes={sizes}
          priority={priority}
          fetchPriority={priority ? 'high' : undefined}
          className="object-cover"
        />
      </div>
      <figcaption className="text-caption text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}
