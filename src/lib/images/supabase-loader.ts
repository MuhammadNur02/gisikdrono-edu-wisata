'use client';

import type { ImageLoaderProps } from 'next/image';

import { IMAGE_QUALITY } from '@/config/images';
import { publicEnv } from '@/lib/public-env';

// docs/StyleGuide.md §8.2: Supabase Storage resizes public-media images itself, so next/image asks it for the
// width each slot needs instead of running Next.js' own optimiser. `src` is the path inside the bucket, as
// the public queries return it.
const RENDER_PATH = '/storage/v1/render/image/public/public-media/';

function encodeStoragePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

// next.config.ts names this file as images.loaderFile, which Next.js requires to export the loader as default.
export default function supabaseImageLoader({ src, width, quality }: ImageLoaderProps): string {
  // A file under public/ is served as it is; the width only keeps each candidate URL distinct.
  if (src.startsWith('/')) return `${src}?w=${String(width)}`;
  const url = new URL(RENDER_PATH + encodeStoragePath(src), publicEnv.NEXT_PUBLIC_SUPABASE_URL);
  url.searchParams.set('width', String(width));
  url.searchParams.set('quality', String(quality ?? IMAGE_QUALITY));
  // With a width alone the transformer's default `cover` keeps the original height and crops the sides;
  // `contain` scales the whole photo to that width.
  url.searchParams.set('resize', 'contain');
  return url.toString();
}
