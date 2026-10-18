import { describe, expect, it } from 'vitest';

import { finalizeUploadSchema, signUploadSchema } from './upload';

const LEADING_BYTES = Buffer.alloc(64, 1).toString('base64');

describe('signUploadSchema', () => {
  const valid = { rwId: 5, contentType: 'image/jpeg', size: 1024, leadingBytes: LEADING_BYTES };

  it('accepts an RW or the kelurahan', () => {
    expect(signUploadSchema.safeParse(valid).success).toBe(true);
    expect(signUploadSchema.safeParse({ ...valid, rwId: null }).success).toBe(true);
  });

  it.each([
    ['an RW that does not exist', { ...valid, rwId: 3 }],
    ['a path chosen by the browser', { ...valid, path: 'rw-08/foto.jpg' }],
    ['a missing size', { rwId: 5, contentType: 'image/jpeg', leadingBytes: LEADING_BYTES }],
    ['an empty file', { ...valid, size: 0 }],
    [
      'more leading bytes than sign reads',
      { ...valid, leadingBytes: Buffer.alloc(65).toString('base64') },
    ],
    ['leading bytes that are not base64', { ...valid, leadingBytes: '<svg>' }],
  ])('refuses %s', (_case, input) => {
    expect(signUploadSchema.safeParse(input).success).toBe(false);
  });
});

describe('finalizeUploadSchema', () => {
  const path = 'rw-05/0199f5a0-0000-7000-8000-000000000000';

  it('accepts a gallery photo and a booklet page', () => {
    expect(finalizeUploadSchema.safeParse({ path, purpose: 'gallery' }).success).toBe(true);
    expect(
      finalizeUploadSchema.safeParse({
        path,
        purpose: 'booklet-page',
        entityId: '6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab',
        pageNumber: 3,
      }).success,
    ).toBe(true);
  });

  it.each([
    ['an unknown purpose', { path, purpose: 'staff' }],
    ['an entity id that is not a uuid', { path, purpose: 'product', entityId: '1 or 1=1' }],
    ['page zero', { path, purpose: 'booklet-page', pageNumber: 0 }],
    ['a target bucket', { path, purpose: 'gallery', bucket: 'documents' }],
    ['an overlong path', { path: `${path}/${'x'.repeat(64)}`, purpose: 'gallery' }],
  ])('refuses %s', (_case, input) => {
    expect(finalizeUploadSchema.safeParse(input).success).toBe(false);
  });
});
