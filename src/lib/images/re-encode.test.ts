import { isBlurhashValid } from 'blurhash';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

import { reencodeImage, thumbnailOf, UnsupportedImageError } from '@/lib/images/re-encode';

import { HEAVY_FILE_TEST_TIMEOUT_MS } from '../../../tests/fixtures/timeouts';
import { iphoneHeicPhoto } from '../../../tests/fixtures/uploads';

vi.setConfig({ testTimeout: HEAVY_FILE_TEST_TIMEOUT_MS });

// A synthetic camera photo: landscape pixels with EXIF orientation 6 (shot with the phone held upright),
// a camera make and a GPS position, the metadata a visitor's photo must never carry onto the public site.
async function cameraJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 40, g: 120, b: 60 } } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Make: 'FixtureCam' },
      IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '6/1 58/1 0/1' },
    })
    .toBuffer();
}

describe('reencodeImage', () => {
  it('writes an upright WebP of at most 1600 px with no metadata and a blurhash', async () => {
    const original = await cameraJpeg(2400, 1200);
    const originalMetadata = await sharp(original).metadata();
    expect(originalMetadata.orientation).toBe(6);
    expect(originalMetadata.exif).toBeDefined();

    const result = await reencodeImage(original);

    const metadata = await sharp(result.webp).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
    // Orientation 6 turns the landscape pixels upright, then the long edge comes down to 1600.
    expect({ width: metadata.width, height: metadata.height }).toEqual({
      width: 800,
      height: 1600,
    });
    expect({ width: result.width, height: result.height }).toEqual({ width: 800, height: 1600 });
    expect(isBlurhashValid(result.blurhash).result).toBe(true);
  });

  it('never enlarges a small photo', async () => {
    const result = await reencodeImage(await cameraJpeg(300, 200));

    expect({ width: result.width, height: result.height }).toEqual({ width: 200, height: 300 });
  });

  it('refuses an SVG, whatever its name says', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
    );

    await expect(reencodeImage(svg)).rejects.toBeInstanceOf(UnsupportedImageError);
  });

  it('refuses a truncated file instead of publishing the part that decoded', async () => {
    const original = await cameraJpeg(800, 600);

    await expect(reencodeImage(original.subarray(0, original.length / 2))).rejects.toThrow();
  });

  // finalize names HEIC before it reaches sharp; this is the net behind that check.
  it('refuses a real HEIC photo, which sharp cannot decode', async () => {
    await expect(reencodeImage(iphoneHeicPhoto())).rejects.toBeInstanceOf(UnsupportedImageError);
  });

  it('refuses a file that would unpack into more pixels than any phone takes', async () => {
    const huge = await sharp({
      create: { width: 12_000, height: 9_000, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();

    await expect(reencodeImage(huge)).rejects.toThrow(/pixel limit/i);
  });
});

describe('thumbnailOf', () => {
  it('makes a 480 px WebP copy and never enlarges', async () => {
    const { webp } = await reencodeImage(await cameraJpeg(2400, 1200));

    const thumbnail = await sharp(await thumbnailOf(webp)).metadata();
    const small = await sharp(
      await thumbnailOf((await reencodeImage(await cameraJpeg(300, 200))).webp),
    ).metadata();

    expect({ format: thumbnail.format, width: thumbnail.width, height: thumbnail.height }).toEqual({
      format: 'webp',
      width: 240,
      height: 480,
    });
    expect({ width: small.width, height: small.height }).toEqual({ width: 200, height: 300 });
  });
});
