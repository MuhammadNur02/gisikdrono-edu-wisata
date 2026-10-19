import { describe, expect, it } from 'vitest';

import { countPublishedPages, scanBookletPdf } from './pdf-scan';
import { pdfFromObjects, pdfObject } from '../../../tests/fixtures/pdf';

// Security review of PR #14, L3: pages are counted by a walk that visits each node of the page tree once.

const CATALOG = pdfObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
const PAGE = (objectNumber: number, parent: number) =>
  pdfObject(
    objectNumber,
    `<< /Type /Page /Parent ${String(parent)} 0 R /MediaBox [0 0 420 595] >>`,
  );

// A chain of /Pages nodes from 2 down, each listing the next one twice, ending in one page: pdf-lib's own count
// would visit that page 2^levels times.
function doubledTree(levels: number): Buffer {
  const objects = [CATALOG];
  for (let level = 0; level < levels; level += 1) {
    const node = 2 + level;
    const kid = node + 1;
    objects.push(
      pdfObject(node, `<< /Type /Pages /Kids [${String(kid)} 0 R ${String(kid)} 0 R] /Count 2 >>`),
    );
  }
  objects.push(PAGE(2 + levels, 1 + levels));
  return pdfFromObjects(objects);
}

describe('scanBookletPdf: the page tree', () => {
  it('refuses a node listed twice, before any page is counted', async () => {
    await expect(scanBookletPdf(doubledTree(1))).resolves.toEqual({
      ok: false,
      problem: 'unreadable',
      detail: 'page-tree-node-twice',
    });
  });

  it('answers at once for a tree that doubles forty times', async () => {
    const startedAt = performance.now();

    await expect(scanBookletPdf(doubledTree(40))).resolves.toMatchObject({
      detail: 'page-tree-node-twice',
    });
    expect(performance.now() - startedAt).toBeLessThan(2000);
  });

  it('refuses a tree that loops back on itself', async () => {
    const pdf = pdfFromObjects([
      CATALOG,
      pdfObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
      pdfObject(3, '<< /Type /Pages /Kids [2 0 R] /Count 1 >>'),
    ]);

    await expect(scanBookletPdf(pdf)).resolves.toMatchObject({ detail: 'page-tree-node-twice' });
  });

  it.each([
    [
      'a kid written in place of a reference',
      '<< /Type /Pages /Kids [<< /Type /Page >>] /Count 1 >>',
    ],
    ['a node of another type', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Font >>'],
    ['/Kids that is not an array', '<< /Type /Pages /Kids 3 0 R /Count 1 >>', '<< /Type /Page >>'],
  ])('refuses %s', async (_case, root, kid = '<< /Type /Page /Parent 2 0 R >>') => {
    const pdf = pdfFromObjects([CATALOG, pdfObject(2, root), pdfObject(3, kid)]);

    await expect(scanBookletPdf(pdf)).resolves.toEqual({
      ok: false,
      problem: 'unreadable',
      detail: 'page-tree',
    });
  });

  it('refuses a node with more kids than a booklet has pages, before stacking them', async () => {
    const kids = Array.from({ length: 101 }, (_, index) => `${String(3 + index)} 0 R`).join(' ');
    const pages = Array.from({ length: 101 }, (_, index) => PAGE(3 + index, 2));
    const pdf = pdfFromObjects([
      CATALOG,
      pdfObject(2, `<< /Type /Pages /Kids [${kids}] /Count 101 >>`),
      ...pages,
    ]);

    await expect(scanBookletPdf(pdf)).resolves.toEqual({
      ok: false,
      problem: 'pdf_too_many_pages',
      detail: 'more than 100',
    });
  });

  it('counts the pages of a nested tree in order', async () => {
    const pdf = pdfFromObjects([
      CATALOG,
      pdfObject(2, '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 3 >>'),
      PAGE(3, 2),
      pdfObject(4, '<< /Type /Pages /Parent 2 0 R /Kids [5 0 R 6 0 R] /Count 2 >>'),
      PAGE(5, 4),
      PAGE(6, 4),
    ]);

    await expect(scanBookletPdf(pdf)).resolves.toMatchObject({ ok: true, pageCount: 3 });
  });
});

describe('countPublishedPages', () => {
  it('walks the same way, so a doubled tree cannot hold api/uploads/sign-pages', async () => {
    await expect(countPublishedPages(doubledTree(40))).resolves.toEqual({
      ok: false,
      problem: 'unreadable',
    });
  });
});
