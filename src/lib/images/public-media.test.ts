import { describe, expect, it } from 'vitest';

import { publicMediaPathOf, publicMediaUrl } from '@/lib/images/public-media';
import { publicEnv } from '@/lib/public-env';

describe('publicMediaUrl', () => {
  it('points at the public object, every segment encoded', () => {
    expect(publicMediaUrl('rw-05/gallery/a b.webp')).toBe(
      `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/public-media/rw-05/gallery/a%20b.webp`,
    );
  });
});

describe('publicMediaPathOf', () => {
  it('reads the path back from a URL publicMediaUrl made', () => {
    const path = 'rw-05/articles/x/a b.webp';
    expect(publicMediaPathOf(publicMediaUrl(path))).toBe(path);
  });

  it('refuses any other address', () => {
    expect(
      publicMediaPathOf('https://evil.example/storage/v1/object/public/public-media/a.webp'),
    ).toBeNull();
    expect(
      publicMediaPathOf(
        `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/documents/a.pdf`,
      ),
    ).toBeNull();
    expect(publicMediaPathOf(`${publicMediaUrl('')}%E0%A4%A`)).toBeNull();
  });
});
