import { describe, expect, it } from 'vitest';

import { createUuidV7 } from '@/lib/utils/uuid-v7';

import {
  bookletCoverPath,
  bookletPageFileName,
  bookletPageObjectName,
  bookletPagePaths,
  bookletPdfPath,
  isPdfPurpose,
  isPublishedImagePathFor,
  isMediaOwner,
  isTargetAllowed,
  MEDIA_OWNER_SOURCE,
  ownerFor,
  parseQuarantinePath,
  publicMediaPathFor,
  quarantinePathFor,
  thumbnailPathFor,
  type QuarantineUpload,
} from './paths';

const SIGNED_AT = Date.UTC(2026, 9, 18, 2, 0, 0);
const OBJECT_NAME = createUuidV7(SIGNED_AT);
const ENTITY_ID = '6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';
const PAGE_12_OF_40 = bookletPageObjectName(OBJECT_NAME, {
  bookletId: ENTITY_ID,
  pageNumber: 12,
  pageCount: 40,
});

function upload(path: string): QuarantineUpload {
  const parsed = parseQuarantinePath(path);
  if (!parsed) throw new Error(`fixture path ${path} does not parse`);
  return parsed;
}

describe('owner prefixes', () => {
  it('names an RW and the kelurahan the way the buckets do', () => {
    expect(ownerFor(5)).toBe('rw-05');
    expect(ownerFor(13)).toBe('rw-13');
    expect(ownerFor(null)).toBe('kelurahan');
  });

  it('knows an owner by its shape, since the RWs are rows of rw_units', () => {
    for (const owner of ['rw-05', 'rw-13', 'rw-99', 'kelurahan'])
      expect(isMediaOwner(owner)).toBe(true);
    for (const owner of ['rw-00', 'rw-5', 'rw-100', 'RW-05', 'kelurahan-x', '']) {
      expect(isMediaOwner(owner)).toBe(false);
    }
    expect(new RegExp(`^${MEDIA_OWNER_SOURCE}$`).test('rw-13')).toBe(true);
  });
});

describe('parseQuarantinePath', () => {
  it('reads an RW the site did not know before', () => {
    expect(parseQuarantinePath(quarantinePathFor(13, OBJECT_NAME))?.rwId).toBe(13);
  });

  it('reads the owner, the RW and the time the upload was signed', () => {
    expect(parseQuarantinePath(quarantinePathFor(8, OBJECT_NAME))).toEqual({
      owner: 'rw-08',
      rwId: 8,
      objectName: OBJECT_NAME,
      signedAtMs: SIGNED_AT,
      page: null,
    });
    expect(parseQuarantinePath(`kelurahan/${OBJECT_NAME}`)?.rwId).toBeNull();
  });

  it('reads the booklet page a sign-pages object was signed for', () => {
    expect(PAGE_12_OF_40).toBe(`${OBJECT_NAME}.${ENTITY_ID}.0012.0040`);
    expect(parseQuarantinePath(`rw-05/${PAGE_12_OF_40}`)).toEqual({
      owner: 'rw-05',
      rwId: 5,
      objectName: PAGE_12_OF_40,
      signedAtMs: SIGNED_AT,
      page: { bookletId: ENTITY_ID, pageNumber: 12, pageCount: 40 },
    });
  });

  it.each([
    ['a page past the page count', `${OBJECT_NAME}.${ENTITY_ID}.0041.0040`],
    ['page zero', `${OBJECT_NAME}.${ENTITY_ID}.0000.0040`],
    ['a booklet over 100 pages', `${OBJECT_NAME}.${ENTITY_ID}.0001.0101`],
    ['a page number of the wrong width', `${OBJECT_NAME}.${ENTITY_ID}.12.0040`],
    ['a booklet id that is not a uuid', `${OBJECT_NAME}.booklet-rw05.0001.0040`],
    ['an extra part', `${PAGE_12_OF_40}.webp`],
    ['a missing page count', `${OBJECT_NAME}.${ENTITY_ID}.0012`],
  ])('refuses a page name with %s', (_case, objectName) => {
    expect(parseQuarantinePath(`rw-05/${objectName}`)).toBeNull();
  });

  it.each([
    ['an RW number out of range', `rw-00/${OBJECT_NAME}`],
    ['an owner of the wrong shape', `rw-5/${OBJECT_NAME}`],
    ['a name sign never issues', 'rw-05/foto-bank-sampah.jpg'],
    ['a version 4 uuid', 'rw-05/4d1f8a2e-3b5c-4d6e-8f70-123456789abc'],
    ['a deeper path', `rw-05/${OBJECT_NAME}/x`],
    ['a climb out of the prefix', `rw-05/../rw-08/${OBJECT_NAME}`],
    ['a bare name', OBJECT_NAME],
    ['a leading slash', `/rw-05/${OBJECT_NAME}`],
  ])('refuses %s', (_case, path) => {
    expect(parseQuarantinePath(path)).toBeNull();
  });
});

describe('isTargetAllowed', () => {
  const rw05 = upload(`rw-05/${OBJECT_NAME}`);
  const kelurahan = upload(`kelurahan/${OBJECT_NAME}`);

  it('keeps hero banners at kelurahan level and activity points inside an RW', () => {
    expect(isTargetAllowed(kelurahan, { purpose: 'hero' })).toBe(true);
    expect(isTargetAllowed(rw05, { purpose: 'hero' })).toBe(false);
    expect(isTargetAllowed(rw05, { purpose: 'activity-point', entityId: ENTITY_ID })).toBe(true);
    expect(isTargetAllowed(kelurahan, { purpose: 'activity-point', entityId: ENTITY_ID })).toBe(
      false,
    );
  });

  it('asks for a row id exactly where the folder has one', () => {
    expect(isTargetAllowed(rw05, { purpose: 'gallery' })).toBe(true);
    expect(isTargetAllowed(rw05, { purpose: 'gallery', entityId: ENTITY_ID })).toBe(false);
    expect(isTargetAllowed(rw05, { purpose: 'product' })).toBe(false);
    expect(isTargetAllowed(rw05, { purpose: 'product', entityId: ENTITY_ID })).toBe(true);
  });

  it('lets a booklet page come only from sign-pages, and a sign-pages object become only a page', () => {
    const page = upload(`rw-05/${PAGE_12_OF_40}`);
    expect(isTargetAllowed(page, { purpose: 'booklet-page' })).toBe(true);
    expect(isTargetAllowed(rw05, { purpose: 'booklet-page' })).toBe(false);
    expect(isTargetAllowed(page, { purpose: 'booklet-page', entityId: ENTITY_ID })).toBe(false);
    expect(isTargetAllowed(page, { purpose: 'gallery' })).toBe(false);
    expect(isTargetAllowed(page, { purpose: 'booklet', entityId: ENTITY_ID })).toBe(false);
  });
});

describe('publicMediaPathFor', () => {
  const rw05 = upload(`rw-05/${OBJECT_NAME}`);

  it('follows the folder layout of docs/PRD.md §8.8', () => {
    expect(publicMediaPathFor(rw05, { purpose: 'gallery' })).toBe(
      `rw-05/gallery/${OBJECT_NAME}.webp`,
    );
    expect(publicMediaPathFor(upload(`kelurahan/${OBJECT_NAME}`), { purpose: 'hero' })).toBe(
      `kelurahan/hero/${OBJECT_NAME}.webp`,
    );
    expect(publicMediaPathFor(rw05, { purpose: 'activity-point', entityId: ENTITY_ID })).toBe(
      `rw-05/activity-points/${ENTITY_ID}/${OBJECT_NAME}.webp`,
    );
    expect(publicMediaPathFor(rw05, { purpose: 'booklet', entityId: ENTITY_ID })).toBe(
      `rw-05/booklets/${ENTITY_ID}/booklet.pdf`,
    );
    expect(publicMediaPathFor(upload(`rw-05/${PAGE_12_OF_40}`), { purpose: 'booklet-page' })).toBe(
      `rw-05/booklets/${ENTITY_ID}/pages/0012.webp`,
    );
    expect(bookletPdfPath(5, ENTITY_ID)).toBe(`rw-05/booklets/${ENTITY_ID}/booklet.pdf`);
  });

  it('never makes a page of an object sign-pages did not sign', () => {
    expect(() => publicMediaPathFor(rw05, { purpose: 'booklet-page' })).toThrow(RangeError);
  });

  it('puts the gallery thumbnail next to its photo', () => {
    expect(thumbnailPathFor(`rw-05/gallery/${OBJECT_NAME}.webp`)).toBe(
      `rw-05/gallery/${OBJECT_NAME}-thumb.webp`,
    );
  });
});

describe('bookletPageFileName', () => {
  it('numbers pages with four digits', () => {
    expect(bookletPageFileName(1)).toBe('0001.webp');
    expect(bookletPageFileName(100)).toBe('0100.webp');
  });

  it.each([0, 101, 1.5])('refuses page %s', (pageNumber) => {
    expect(() => bookletPageFileName(pageNumber)).toThrow(RangeError);
  });
});

describe('bookletPagePaths', () => {
  it('lists every page under the prefix, with or without its trailing slash', () => {
    const pages = ['rw-05/booklets/b/pages/0001.webp', 'rw-05/booklets/b/pages/0002.webp'];
    expect(bookletPagePaths('rw-05/booklets/b/pages', 2)).toEqual(pages);
    expect(bookletPagePaths('rw-05/booklets/b/pages/', 2)).toEqual(pages);
  });

  it('has no pages until the prefix and a count are both set', () => {
    expect(bookletPagePaths(null, 12)).toEqual([]);
    expect(bookletPagePaths('rw-05/booklets/b/pages', null)).toEqual([]);
    expect(bookletPagePaths('rw-05/booklets/b/pages', 0)).toEqual([]);
  });

  it('never lists more pages than a booklet may have', () => {
    expect(bookletPagePaths('kelurahan/booklets/b/pages', 500)).toHaveLength(100);
  });
});

describe('isPdfPurpose', () => {
  it('takes PDFs for booklets only', () => {
    expect(isPdfPurpose('booklet')).toBe(true);
    expect(isPdfPurpose('booklet-page')).toBe(false);
    expect(isPdfPurpose('gallery')).toBe(false);
  });
});

describe('isPublishedImagePathFor', () => {
  const name = createUuidV7();
  const articleId = '6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';

  it('accepts a photo finalize published for this owner, purpose and row, and its thumbnail', () => {
    expect(
      isPublishedImagePathFor(`rw-05/gallery/${name}.webp`, { rwId: 5, purpose: 'gallery' }),
    ).toBe(true);
    expect(
      isPublishedImagePathFor(`rw-05/gallery/${name}-thumb.webp`, { rwId: 5, purpose: 'gallery' }),
    ).toBe(true);
    expect(
      isPublishedImagePathFor(`kelurahan/articles/${articleId}/${name}.webp`, {
        rwId: null,
        purpose: 'article',
        entityId: articleId,
      }),
    ).toBe(true);
  });

  // An RW 05 officer hanging RW 08's photo, a photo of another kind or of another row on their own content.
  it.each([
    ['another RW', `rw-08/gallery/${name}.webp`],
    ['the kelurahan', `kelurahan/gallery/${name}.webp`],
    ['another kind of file', `rw-05/products/${name}.webp`],
    ['a folder below the right one', `rw-05/gallery/x/${name}.webp`],
    ['a name finalize never writes', 'rw-05/gallery/../rw-08/gallery/foto.webp'],
    ['a PDF', `rw-05/gallery/${name}.pdf`],
  ])('refuses a path of %s', (_case, path) => {
    expect(isPublishedImagePathFor(path, { rwId: 5, purpose: 'gallery' })).toBe(false);
  });

  it("refuses another row's folder", () => {
    const otherId = '7a1c2d3e-4a5b-4c6d-8e7f-0123456789ab';
    expect(
      isPublishedImagePathFor(`rw-05/articles/${otherId}/${name}.webp`, {
        rwId: 5,
        purpose: 'article',
        entityId: articleId,
      }),
    ).toBe(false);
  });
});

describe('bookletCoverPath', () => {
  it("is the booklet's first page", () => {
    const bookletId = '6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';
    expect(bookletCoverPath(8, bookletId)).toBe(`rw-08/booklets/${bookletId}/pages/0001.webp`);
  });
});
