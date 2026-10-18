import { describe, expect, it } from 'vitest';

import { publicMediaUrl } from '@/lib/images/public-media';
import { publicEnv } from '@/lib/public-env';

describe('publicMediaUrl', () => {
  it('points at the public object, every segment encoded', () => {
    expect(publicMediaUrl('rw-05/gallery/a b.webp')).toBe(
      `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/public-media/rw-05/gallery/a%20b.webp`,
    );
  });
});
