'use client';

import type { ImageLoaderProps } from 'next/image';

import { publicMediaUrl } from '@/lib/images/public-media';

// The loader of a build without Supabase's image transformer (NEXT_PUBLIC_FLAG_IMAGE_TRANSFORMS=off, the Free-plan
// staging project; src/config/images.ts). Every width gets the same plain public-media file, which the upload
// pipeline already keeps at 1600 px or less as WebP (src/lib/images/re-encode.ts), so a phone downloads more than
// it needs but never a raw camera file. next.config.ts names this file as images.loaderFile in that case.
export default function publicObjectImageLoader({ src, width }: ImageLoaderProps): string {
  // A file under public/ is served as it is; the width only keeps each candidate URL distinct.
  if (src.startsWith('/')) return `${src}?w=${String(width)}`;
  return publicMediaUrl(src);
}
