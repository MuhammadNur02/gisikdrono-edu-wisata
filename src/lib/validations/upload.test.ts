import { describe, expect, it } from 'vitest';

import { finalizeUploadSchema, signBookletPagesSchema, signUploadSchema } from './upload';

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

  it('accepts a gallery photo and a booklet page named by its path', () => {
    const pagePath = `${path}.6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab.0003.0040`;
    expect(finalizeUploadSchema.safeParse({ path, purpose: 'gallery' }).success).toBe(true);
    expect(
      finalizeUploadSchema.safeParse({ path: pagePath, purpose: 'booklet-page' }).success,
    ).toBe(true);
  });

  it.each([
    ['an unknown purpose', { path, purpose: 'staff' }],
    ['an entity id that is not a uuid', { path, purpose: 'product', entityId: '1 or 1=1' }],
    ['a page number chosen by the browser', { path, purpose: 'booklet-page', pageNumber: 3 }],
    ['a target bucket', { path, purpose: 'gallery', bucket: 'documents' }],
    ['an overlong path', { path: `${path}/${'x'.repeat(96)}`, purpose: 'gallery' }],
  ])('refuses %s', (_case, input) => {
    expect(finalizeUploadSchema.safeParse(input).success).toBe(false);
  });

  // Security review of PR #14, L10: paths.ts accepts lower case only, so one row never has two spellings.
  it('lower-cases the entity id', () => {
    const parsed = finalizeUploadSchema.parse({
      path,
      purpose: 'booklet',
      entityId: '6F1C2D3E-4A5B-4C6D-8E7F-0123456789AB',
    });
    expect(parsed.entityId).toBe('6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab');
  });
});

describe('signBookletPagesSchema', () => {
  it('takes an RW or the kelurahan and the booklet id, nothing else', () => {
    const bookletId = '6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';
    expect(signBookletPagesSchema.safeParse({ rwId: 8, bookletId }).success).toBe(true);
    expect(signBookletPagesSchema.safeParse({ rwId: null, bookletId }).success).toBe(true);
    expect(signBookletPagesSchema.safeParse({ rwId: 8, bookletId, pageCount: 500 }).success).toBe(
      false,
    );
    expect(signBookletPagesSchema.safeParse({ rwId: 8, bookletId: '../x' }).success).toBe(false);
  });

  it('lower-cases the booklet id, as finalize does', () => {
    const parsed = signBookletPagesSchema.parse({
      rwId: 5,
      bookletId: '6F1C2D3E-4A5B-4C6D-8E7F-0123456789AB',
    });
    expect(parsed.bookletId).toBe('6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab');
  });
});
