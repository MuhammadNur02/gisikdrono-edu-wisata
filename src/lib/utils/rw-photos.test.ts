import { describe, expect, it } from 'vitest';

import type { GalleryItem } from '@/types/gallery';

import { planRwPhotos, rwGalleryPhotos } from './rw-photos';

const image = {
  path: 'rw-05/a.webp',
  alt: 'Warga',
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
    alt: `Alt ${id}`,
    image,
    youtubeId: null,
    caption: `Foto ${id}`,
    takenAt: null,
    ...overrides,
  };
}

describe('rwGalleryPhotos', () => {
  it('keeps photos, falls back to the alt text and leaves videos out', () => {
    const photos = rwGalleryPhotos([
      item('a'),
      item('b', { caption: null }),
      item('v', { mediaType: 'video' }),
    ]);
    expect(photos.map((photo) => [photo.id, photo.caption])).toEqual([
      ['a', 'Foto a'],
      ['b', 'Alt b'],
    ]);
  });
});

describe('planRwPhotos', () => {
  const photos = rwGalleryPhotos(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => item(id)));

  it('places two by the profile, one by the points and the rest in the mosaic', () => {
    const plan = planRwPhotos(photos);
    expect(plan.profile.map((photo) => photo.id)).toEqual(['a', 'b']);
    expect(plan.points?.id).toBe('c');
    expect(plan.mosaic.map((photo) => photo.id)).toEqual(['d', 'e', 'f', 'g']);
  });

  it('gives a short gallery to the mosaic alone', () => {
    const plan = planRwPhotos(photos.slice(0, 4));
    expect(plan).toEqual({ profile: [], points: null, mosaic: photos.slice(0, 4) });
  });
});
