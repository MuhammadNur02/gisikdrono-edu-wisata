import { describe, expect, it } from 'vitest';

import supabaseImageLoader from '@/lib/images/supabase-loader';
import { publicEnv } from '@/lib/public-env';

const supabaseUrl = publicEnv.NEXT_PUBLIC_SUPABASE_URL;

describe('supabaseImageLoader', () => {
  it('asks the Supabase transformer for the whole photo scaled to the requested width', () => {
    const url = supabaseImageLoader({ src: 'rw-05/gallery/abc.webp', width: 640, quality: 60 });

    // Without resize=contain the transformer keeps the original height and crops (checked on the local stack).
    expect(url).toBe(
      `${supabaseUrl}/storage/v1/render/image/public/public-media/rw-05/gallery/abc.webp?width=640&quality=60&resize=contain`,
    );
  });

  it('uses quality 75 unless the image asks for another', () => {
    const url = new URL(supabaseImageLoader({ src: 'kelurahan/hero/a.webp', width: 1280 }));

    expect(url.searchParams.get('quality')).toBe('75');
  });

  it('keeps every path segment inside the bucket path', () => {
    const url = new URL(supabaseImageLoader({ src: 'rw-08/a b?c.webp', width: 480 }));

    expect(url.pathname).toBe('/storage/v1/render/image/public/public-media/rw-08/a%20b%3Fc.webp');
    expect(url.searchParams.get('width')).toBe('480');
  });

  it('serves a file under public/ as it is, one URL per width', () => {
    expect(supabaseImageLoader({ src: '/icons/logo.png', width: 96 })).toBe('/icons/logo.png?w=96');
  });
});
