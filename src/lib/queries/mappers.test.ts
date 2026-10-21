import { describe, expect, it } from 'vitest';

import { toPublicImage, toPublicImages } from '@/lib/queries/mappers';
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

describe('parseItinerary', () => {
  const units = [{ id: 8, label: 'RW 08', accentKey: 'terracotta' as const }];

  it('keeps well-formed steps in order and leaves out the ones that do not fit', () => {
    const itinerary = parseItinerary(
      [
        { order: 2, rw_id: 8, time: '10:00', title: 'Menari', description: null },
        { order: 1, title: 'Memilah sampah' },
        { order: 3 },
        'not a step',
      ],
      units,
    );

    expect(itinerary).toEqual([
      { order: 1, rw: null, time: null, title: 'Memilah sampah', description: null },
      { order: 2, rw: units[0], time: '10:00', title: 'Menari', description: null },
    ]);
  });

  it('reads anything but an array as no itinerary', () => {
    expect(parseItinerary({ order: 1, title: 'x' }, units)).toEqual([]);
    expect(parseItinerary(null, units)).toEqual([]);
  });

  it('marks a step of an RW that is offline with its number in the neutral colours', () => {
    expect(parseItinerary([{ order: 1, rw_id: 13, title: 'Menari' }], units)[0]?.rw).toEqual({
      id: 13,
      label: 'RW 13',
      accentKey: null,
    });
  });
});
