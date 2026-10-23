import { describe, expect, it } from 'vitest';

import type { GalleryItem } from '@/types/gallery';

import { pickHomeGalleryPhotos } from './home-gallery';

const image = {
  path: 'rw-05/foto.webp',
  alt: 'Warga memilah sampah',
  width: 1600,
  height: 1200,
  placeholderColour: null,
};

function item(id: string, overrides: Partial<GalleryItem> = {}): GalleryItem {
  return {
    id,
    rwId: 5,
    category: 'activity',
    mediaType: 'image',
    alt: image.alt,
    image,
    youtubeId: null,
    caption: `Kegiatan ${id}`,
    takenAt: null,
    ...overrides,
  };
}

describe('pickHomeGalleryPhotos', () => {
  it('keeps captioned photos and links each to its tile on /galeri', () => {
    expect(pickHomeGalleryPhotos([item('a'), item('b')], 10)).toEqual([
      { id: 'a', image, caption: 'Kegiatan a', href: '/galeri#foto-1' },
      { id: 'b', image, caption: 'Kegiatan b', href: '/galeri#foto-2' },
    ]);
  });

  it('leaves out videos and photos without a caption, keeping the /galeri numbering', () => {
    const photos = pickHomeGalleryPhotos(
      [
        item('video', { mediaType: 'video', youtubeId: null }),
        item('uncaptioned', { caption: null }),
        item('kept'),
      ],
      10,
    );
    expect(photos.map((photo) => [photo.id, photo.href])).toEqual([['kept', '/galeri#foto-3']]);
  });

  it('stops at the limit', () => {
    expect(pickHomeGalleryPhotos([item('a'), item('b'), item('c')], 2)).toHaveLength(2);
  });
});
