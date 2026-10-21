import Image from 'next/image';
import type { CSSProperties } from 'react';

import {
  PhotoPlaceholder,
  type PhotoPlaceholderProps,
} from '@/components/marketing/photo-placeholder';
import { cn } from '@/lib/utils/cn';
import type { PublicImage } from '@/types/media';

// A slot without a stored size, such as a gallery item uploaded before the pipeline recorded one.
const FALLBACK_ASPECT_CLASS = 'aspect-4/3';

export interface PhotoFrameProps {
  image: PublicImage;
  // A preset from IMAGE_SIZES in src/config/images.ts; next/image needs it to pick the width.
  sizes: string;
  // The slot's proportions, such as `aspect-video`. Left out, the photo keeps its own (a gallery tile).
  aspectClassName?: string;
  // Where the crop is anchored when the slot's proportions differ from the photo's, such as
  // `object-left-top`; centred by default.
  objectPositionClassName?: string;
  // `contain` shows the whole image inside the slot, such as a booklet cover; photos fill it.
  fit?: 'cover' | 'contain';
  // Only the first hero image of a page (docs/StyleGuide.md §8.2).
  priority?: boolean;
  className?: string;
}

// The colour and the native ratio come from the data, not from design values, so they are the inline styles
// here: the average colour shows while the photo loads (§8.2), the ratio keeps the page from shifting (CLS).
function frameStyle(image: PublicImage, hasAspectClass: boolean): CSSProperties | undefined {
  const style: CSSProperties = {};
  if (image.placeholderColour) style.backgroundColor = image.placeholderColour;
  if (!hasAspectClass && image.width && image.height) {
    style.aspectRatio = `${String(image.width)} / ${String(image.height)}`;
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

function nativeAspectClass(image: PublicImage): string | undefined {
  return image.width && image.height ? undefined : FALLBACK_ASPECT_CLASS;
}

export function PhotoFrame({
  image,
  sizes,
  aspectClassName,
  objectPositionClassName,
  fit = 'cover',
  priority = false,
  className,
}: PhotoFrameProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl bg-muted',
        aspectClassName ?? nativeAspectClass(image),
        className,
      )}
      style={frameStyle(image, aspectClassName !== undefined)}
    >
      <Image
        src={image.path}
        alt={image.alt}
        fill
        sizes={sizes}
        priority={priority}
        fetchPriority={priority ? 'high' : undefined}
        className={cn(
          fit === 'contain' ? 'object-contain' : 'object-cover',
          objectPositionClassName,
        )}
      />
    </div>
  );
}

export interface PhotoProps extends Omit<PhotoFrameProps, 'image' | 'className'> {
  // NULL until the CMS has a real photo for this slot (docs/StyleGuide.md §1.3 G1).
  image: PublicImage | null;
  // Where or what the photo shows: the caption under it (G8), or the description of the placeholder.
  caption: string;
  // What the placeholder shows while the photo is missing.
  placeholder: Pick<PhotoPlaceholderProps, 'icon' | 'rws'>;
  className?: string;
}

export interface CaptionedPhotoProps extends Omit<PhotoFrameProps, 'className'> {
  // Where or what the photo shows (docs/StyleGuide.md §1.3 G8).
  caption: string;
  className?: string;
}

export function CaptionedPhoto({ caption, className, ...frame }: CaptionedPhotoProps) {
  return (
    <figure className={cn('space-y-2', className)}>
      <PhotoFrame {...frame} />
      <figcaption className="text-caption text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}

// A public-media photo with its caption, or the wordless placeholder when there is none yet.
export function Photo({ image, caption, placeholder, className, ...frame }: PhotoProps) {
  if (!image) {
    return (
      <PhotoPlaceholder
        label={caption}
        {...placeholder}
        className={cn(frame.aspectClassName ?? FALLBACK_ASPECT_CLASS, className)}
      />
    );
  }
  return <CaptionedPhoto image={image} caption={caption} className={className} {...frame} />;
}
