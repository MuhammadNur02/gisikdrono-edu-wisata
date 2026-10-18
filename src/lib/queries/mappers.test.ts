import { describe, expect, it } from 'vitest';

import { toOptionalRwId, toPublicImage, toPublicImages, toRwId } from '@/lib/queries/mappers';
import { parseItinerary } from '@/lib/queries/packages';

describe('toPublicImage', () => {
  it('gives no image without a path, so the page shows the photo placeholder', () => {
    expect(toPublicImage(null, 'Bank Sampah')).toBeNull();
    expect(toPublicImage('', 'Bank Sampah')).toBeNull();
  });

  it('carries the stored size and the average colour of its blurhash', () => {
    const image = toPublicImage('rw-05/gallery/a.webp', 'Foto bersama', {
      width: 1600,
      height: 1200,
      blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
    });

    expect(image).toMatchObject({
      path: 'rw-05/gallery/a.webp',
      alt: 'Foto bersama',
      width: 1600,
      height: 1200,
    });
    expect(image?.placeholderColour).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('keeps the order of image_paths, the first one being the cover', () => {
    const images = toPublicImages(['rw-05/packages/1/a.webp', 'rw-05/packages/1/b.webp'], 'Paket');

    expect(images.map((image) => image.path)).toEqual([
      'rw-05/packages/1/a.webp',
      'rw-05/packages/1/b.webp',
    ]);
    expect(images[0]).toMatchObject({ alt: 'Paket', width: null, placeholderColour: null });
  });
});

describe('toRwId', () => {
  it('accepts the two RWs and refuses one the site has no page for', () => {
    expect(toRwId(5)).toBe(5);
    expect(toOptionalRwId(8)).toBe(8);
    expect(toOptionalRwId(null)).toBeNull();
    expect(() => toRwId(3)).toThrow('rw_id 3');
  });
});

describe('parseItinerary', () => {
  it('keeps well-formed steps in order and leaves out the ones that do not fit', () => {
    const itinerary = parseItinerary([
      { order: 2, rw_id: 8, time: '10:00', title: 'Menari', description: null },
      { order: 1, title: 'Memilah sampah' },
      { order: 3 },
      'not a step',
    ]);

    expect(itinerary).toEqual([
      { order: 1, rwId: null, time: null, title: 'Memilah sampah', description: null },
      { order: 2, rwId: 8, time: '10:00', title: 'Menari', description: null },
    ]);
  });

  it('reads anything but an array as no itinerary', () => {
    expect(parseItinerary({ order: 1, title: 'x' })).toEqual([]);
    expect(parseItinerary(null)).toEqual([]);
  });
});
