import { readFileSync } from 'node:fs';

import sharp from 'sharp';

// iphone-photo.heic is a genuine HEIC file, HEVC-coded by libheif 1.23.6 with the x265 encoder (pillow-heif
// 1.8.1): a 64 × 48 synthetic gradient, no camera and no metadata. Its ftyp box reads `ftypheic` with the
// compatible brands mif1, heic and miaf, the way an iPhone writes one.
export function iphoneHeicPhoto(): Buffer {
  return readFileSync(new URL('./uploads/iphone-photo.heic', import.meta.url));
}

// The same file with its major brand set to mif1, as other phones and converters write HEIF.
export function mif1HeifPhoto(): Buffer {
  const photo = Buffer.from(iphoneHeicPhoto());
  photo.write('mif1', 8, 'latin1');
  return photo;
}

export function jpegPhoto(width = 64, height = 48): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 40, g: 120, b: 60 } } })
    .jpeg()
    .toBuffer();
}

export const SVG_WITH_SCRIPT = Buffer.from(
  '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">' +
    '<script>alert(1)</script></svg>',
);
