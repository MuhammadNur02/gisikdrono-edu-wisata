import { describe, expect, it } from 'vitest';

import { MAX_IMAGE_BYTES } from '@/config/uploads';

import { checkImageBytes, checkImageFile, fitWithin } from './client-resize';
import { iphoneHeicPhoto, jpegPhoto, mif1HeifPhoto } from '../../../tests/fixtures/uploads';

describe('checkImageFile', () => {
  it('accepts JPEG, PNG and WebP up to 10 MB', () => {
    expect(checkImageFile({ name: 'bank-sampah.jpg', type: 'image/jpeg', size: 1024 })).toBeNull();
    expect(checkImageFile({ name: 'a.png', type: 'image/png', size: MAX_IMAGE_BYTES })).toBeNull();
    expect(checkImageFile({ name: 'a.webp', type: 'image/webp', size: 1 })).toBeNull();
  });

  it('names SVG separately, by type or by extension', () => {
    expect(checkImageFile({ name: 'logo.svg', type: 'image/svg+xml', size: 10 })).toBe('svg');
    expect(checkImageFile({ name: 'LOGO.SVG', type: '', size: 10 })).toBe('svg');
  });

  it('names HEIC separately by the type or name the browser gives', () => {
    expect(checkImageFile({ name: 'IMG_0412.HEIC', type: 'image/heic', size: 10 })).toBe('heic');
    expect(checkImageFile({ name: 'IMG_0412.heic', type: '', size: 10 })).toBe('heic');
    expect(checkImageFile({ name: 'foto.heif', type: 'image/heif', size: 10 })).toBe('heic');
  });

  it('refuses other formats and files over the limit', () => {
    expect(checkImageFile({ name: 'a.gif', type: 'image/gif', size: 10 })).toBe('type');
    expect(checkImageFile({ name: 'a.pdf', type: 'application/pdf', size: 10 })).toBe('type');
    expect(checkImageFile({ name: 'a.jpg', type: 'image/jpeg', size: MAX_IMAGE_BYTES + 1 })).toBe(
      'size',
    );
  });
});

describe('checkImageBytes', () => {
  it('catches a real HEIC photo renamed to .jpg by its ftypheic or ftypmif1 bytes', async () => {
    const renamed = new File([new Uint8Array(iphoneHeicPhoto())], 'IMG_0412.jpg', {
      type: 'image/jpeg',
    });
    expect(checkImageFile(renamed)).toBeNull();

    await expect(checkImageBytes(renamed)).resolves.toBe('heic');
    await expect(checkImageBytes(new Blob([new Uint8Array(mif1HeifPhoto())]))).resolves.toBe(
      'heic',
    );
  });

  it('lets a real JPEG through', async () => {
    await expect(
      checkImageBytes(new Blob([new Uint8Array(await jpegPhoto())])),
    ).resolves.toBeNull();
  });
});

describe('fitWithin', () => {
  it('scales the longer edge down to 1600 px and keeps the ratio', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });

  it('never scales an image up', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 900)).toEqual({ width: 1600, height: 900 });
  });

  it('takes another limit when given one', () => {
    expect(fitWithin(1000, 500, 100)).toEqual({ width: 100, height: 50 });
  });
});
