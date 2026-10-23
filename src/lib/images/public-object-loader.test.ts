import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { IMAGE_LOADER_FILES, imageLoaderFileFor } from '@/config/images';
import publicObjectImageLoader from '@/lib/images/public-object-loader';
import { publicEnv } from '@/lib/public-env';

const supabaseUrl = publicEnv.NEXT_PUBLIC_SUPABASE_URL;

describe('publicObjectImageLoader', () => {
  it('serves the plain public-media file, never the transformer', () => {
    const url = publicObjectImageLoader({ src: 'rw-05/gallery/abc.webp', width: 640, quality: 60 });

    expect(url).toBe(`${supabaseUrl}/storage/v1/object/public/public-media/rw-05/gallery/abc.webp`);
    expect(url).not.toContain('/render/image/');
  });

  it('keeps every path segment inside the bucket path', () => {
    const url = new URL(publicObjectImageLoader({ src: 'rw-08/a b?c.webp', width: 480 }));

    expect(url.pathname).toBe('/storage/v1/object/public/public-media/rw-08/a%20b%3Fc.webp');
    expect(url.search).toBe('');
  });

  it('serves a file under public/ as it is, one URL per width', () => {
    expect(publicObjectImageLoader({ src: '/icons/logo.png', width: 96 })).toBe(
      '/icons/logo.png?w=96',
    );
  });
});

describe('imageLoaderFileFor', () => {
  it('keeps the Supabase transformer unless the flag is off', () => {
    expect(imageLoaderFileFor(undefined)).toBe(IMAGE_LOADER_FILES.transformer);
    expect(imageLoaderFileFor('on')).toBe(IMAGE_LOADER_FILES.transformer);
  });

  it('names loader files that exist', () => {
    for (const file of Object.values(IMAGE_LOADER_FILES)) {
      expect(existsSync(resolve(process.cwd(), file))).toBe(true);
    }
  });

  it('switches to the plain files when the flag is off', () => {
    expect(imageLoaderFileFor('off')).toBe(IMAGE_LOADER_FILES.plainObject);
  });
});
