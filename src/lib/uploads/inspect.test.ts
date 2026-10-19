import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { LEADING_BYTES_LENGTH, MAX_BOOKLET_PDF_BYTES, MAX_IMAGE_BYTES } from '@/config/uploads';

import { isHeifSignature } from './heif';
import { checkUploadedFile, checkUploadRequest, kindOfType } from './inspect';
import {
  iphoneHeicPhoto,
  jpegPhoto,
  mif1HeifPhoto,
  SVG_WITH_SCRIPT,
} from '../../../tests/fixtures/uploads';

const PDF_BYTES = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog >>\nendobj\n');

function head(bytes: Uint8Array): Uint8Array {
  return bytes.subarray(0, LEADING_BYTES_LENGTH);
}

describe('isHeifSignature', () => {
  it('recognises a real HEIC photo by its ftypheic box', () => {
    const photo = iphoneHeicPhoto();
    expect(photo.subarray(4, 12).toString('latin1')).toBe('ftypheic');
    expect(isHeifSignature(photo)).toBe(true);
    expect(isHeifSignature(head(photo))).toBe(true);
  });

  it('recognises ftypmif1 too', () => {
    const photo = mif1HeifPhoto();
    expect(photo.subarray(4, 12).toString('latin1')).toBe('ftypmif1');
    expect(isHeifSignature(photo)).toBe(true);
  });

  it('leaves AVIF, which shares the box, and other formats alone', async () => {
    const avifLike = mif1HeifPhoto();
    avifLike.write('avif', 16, 'latin1');
    expect(isHeifSignature(avifLike)).toBe(false);
    expect(isHeifSignature(await jpegPhoto())).toBe(false);
    expect(isHeifSignature(PDF_BYTES)).toBe(false);
    expect(isHeifSignature(new Uint8Array(4))).toBe(false);
  });

  // Security review of PR #14, L1.
  it('reads no brand past the first 64 bytes, whatever size the ftyp box claims', () => {
    const forged = Buffer.concat([mif1HeifPhoto(), Buffer.alloc(64)]);
    forged.writeUInt32BE(0xffffffff, 0);
    forged.write('avif', 80, 'latin1');
    expect(isHeifSignature(forged)).toBe(true);

    forged.write('avif', 56, 'latin1');
    expect(isHeifSignature(forged)).toBe(false);
  });
});

describe('kindOfType', () => {
  it('knows the accepted image types and the booklet PDF', () => {
    expect(kindOfType('image/jpeg')).toBe('image');
    expect(kindOfType('image/webp')).toBe('image');
    expect(kindOfType('application/pdf')).toBe('pdf');
    expect(kindOfType('image/gif')).toBeNull();
    expect(kindOfType(null)).toBeNull();
  });
});

describe('checkUploadRequest (api/uploads/sign)', () => {
  it('accepts a JPEG and a PDF within their limits', async () => {
    const jpeg = await jpegPhoto();
    await expect(
      checkUploadRequest({
        contentType: 'image/jpeg',
        size: jpeg.length,
        leadingBytes: head(jpeg),
      }),
    ).resolves.toEqual({ kind: 'image' });
    await expect(
      checkUploadRequest({
        contentType: 'application/pdf',
        size: MAX_BOOKLET_PDF_BYTES,
        leadingBytes: head(PDF_BYTES),
      }),
    ).resolves.toEqual({ kind: 'pdf' });
  });

  it.each([
    ['declared as HEIC', 'image/heic'],
    ['renamed to .jpg and declared as JPEG', 'image/jpeg'],
    ['with no type at all, as Windows reports it', ''],
  ])('refuses a real HEIC photo %s with the HEIC message', async (_case, contentType) => {
    const photo = iphoneHeicPhoto();
    await expect(
      checkUploadRequest({ contentType, size: photo.length, leadingBytes: head(photo) }),
    ).resolves.toEqual({ problem: 'heic' });
  });

  it('refuses a ftypmif1 HEIF the same way', async () => {
    const photo = mif1HeifPhoto();
    await expect(
      checkUploadRequest({
        contentType: 'image/heif',
        size: photo.length,
        leadingBytes: head(photo),
      }),
    ).resolves.toEqual({ problem: 'heic' });
  });

  it('names SVG by its declared type or its bytes', async () => {
    await expect(
      checkUploadRequest({ contentType: 'image/svg+xml', size: 10, leadingBytes: head(PDF_BYTES) }),
    ).resolves.toEqual({ problem: 'svg' });
    await expect(
      checkUploadRequest({
        contentType: 'image/png',
        size: SVG_WITH_SCRIPT.length,
        leadingBytes: head(SVG_WITH_SCRIPT),
      }),
    ).resolves.toEqual({ problem: 'svg' });
  });

  it('refuses a declared type that the bytes contradict', async () => {
    const jpeg = await jpegPhoto();
    await expect(
      checkUploadRequest({ contentType: 'application/pdf', size: 10, leadingBytes: head(jpeg) }),
    ).resolves.toEqual({ problem: 'type' });
    await expect(
      checkUploadRequest({ contentType: 'image/gif', size: 10, leadingBytes: head(jpeg) }),
    ).resolves.toEqual({ problem: 'type' });
  });

  it('holds images to 10 MB and PDFs to 50 MB', async () => {
    const jpeg = await jpegPhoto();
    await expect(
      checkUploadRequest({
        contentType: 'image/jpeg',
        size: MAX_IMAGE_BYTES + 1,
        leadingBytes: head(jpeg),
      }),
    ).resolves.toEqual({ problem: 'image_size' });
    await expect(
      checkUploadRequest({
        contentType: 'application/pdf',
        size: MAX_BOOKLET_PDF_BYTES + 1,
        leadingBytes: head(PDF_BYTES),
      }),
    ).resolves.toEqual({ problem: 'pdf_size' });
  });
});

describe('checkUploadedFile (api/uploads/finalize)', () => {
  it('accepts a JPEG for an image purpose and a PDF for a booklet', async () => {
    await expect(checkUploadedFile(await jpegPhoto(), 'image')).resolves.toEqual({
      kind: 'image',
      type: 'image/jpeg',
    });
    await expect(checkUploadedFile(PDF_BYTES, 'pdf')).resolves.toEqual({
      kind: 'pdf',
      type: 'application/pdf',
    });
  });

  it('refuses a real HEIC photo and a ftypmif1 HEIF by their bytes', async () => {
    await expect(checkUploadedFile(iphoneHeicPhoto(), 'image')).resolves.toMatchObject({
      problem: 'heic',
    });
    await expect(checkUploadedFile(mif1HeifPhoto(), 'image')).resolves.toMatchObject({
      problem: 'heic',
    });
  });

  it('refuses SVG, unknown bytes and a file of the wrong kind', async () => {
    await expect(checkUploadedFile(SVG_WITH_SCRIPT, 'image')).resolves.toMatchObject({
      problem: 'svg',
    });
    await expect(checkUploadedFile(Buffer.from('hello'), 'image')).resolves.toMatchObject({
      problem: 'type',
    });
    await expect(checkUploadedFile(PDF_BYTES, 'image')).resolves.toMatchObject({
      problem: 'wrong_kind',
    });
    await expect(checkUploadedFile(await jpegPhoto(), 'pdf')).resolves.toMatchObject({
      problem: 'wrong_kind',
    });
  });

  it('refuses a GIF even though sharp could read it', async () => {
    const gif = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .gif()
      .toBuffer();
    await expect(checkUploadedFile(gif, 'image')).resolves.toMatchObject({ problem: 'type' });
  });

  // Security review of PR #14, L1: an oversized file is turned away before its bytes are looked into.
  it('checks the size before it looks at the bytes', async () => {
    const oversizedSvg = Buffer.concat([SVG_WITH_SCRIPT, Buffer.alloc(MAX_IMAGE_BYTES)]);
    await expect(checkUploadedFile(oversizedSvg, 'image')).resolves.toEqual({
      problem: 'image_size',
      type: null,
    });
  });

  it('checks the real size, not the one the browser declared', async () => {
    const jpeg = await jpegPhoto();
    const padded = Buffer.concat([jpeg, Buffer.alloc(MAX_IMAGE_BYTES)]);
    await expect(checkUploadedFile(padded, 'image')).resolves.toMatchObject({
      problem: 'image_size',
    });
  });
});
