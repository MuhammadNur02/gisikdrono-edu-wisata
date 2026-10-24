import { ImageOff } from 'lucide-react';

import { PhotoFrame } from '@/components/marketing/photo';
import { IMAGE_SIZES } from '@/config/images';

export interface ListThumbProps {
  // A public-media path, or null when the row has no photo of its own (a video without a still).
  path: string | null;
  alt: string;
}

// The small photo in a content list's row or card (Task P4.3.03, docs/StyleGuide.md §6.4): 4:3, never animated.
export function ListThumb({ path, alt }: ListThumbProps) {
  if (path === null) {
    return (
      <div
        role="img"
        aria-label={alt}
        className="flex aspect-4/3 w-16 items-center justify-center rounded-md bg-muted"
      >
        <ImageOff aria-hidden className="size-5 text-muted-foreground" />
      </div>
    );
  }
  return (
    <PhotoFrame
      image={{ path, alt, width: null, height: null, placeholderColour: null }}
      sizes={IMAGE_SIZES.listThumb}
      aspectClassName="aspect-4/3"
      className="w-16 rounded-md"
    />
  );
}
