import { PDFArray, PDFDocument, PDFName, type PDFObject } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { removeComments } from './pdf-annotations';
import { ScanDeadline, ScanTimeout } from './pdf-deadline';
import { readPageTree } from './pdf-pages';
import { firstFinding, type Walk } from './pdf-rules';
import { pdfFromObjects, pdfObject } from '../../../tests/fixtures/pdf';

// Security review of PR #14, F1 and F4: the walks after the load step on the scan's deadline, and the comment sweep
// compacts an array in one pass instead of shifting its tail for every element it removes.

const NOTE = '<< /Type /Annot /Subtype /Text /Rect [0 0 10 10] /Contents (catatan) >>';
const PAST = new ScanDeadline(Number.NEGATIVE_INFINITY);
const NEVER = new ScanDeadline(Number.POSITIVE_INFINITY);

// A booklet whose catalog holds one array of `references`; object 4 is a note the sweep deletes, 1 to 3 stay.
async function bookletWithArray(references: string) {
  const document = await PDFDocument.load(
    pdfFromObjects([
      pdfObject(1, `<< /Type /Catalog /Pages 2 0 R /Extra [${references}] >>`),
      pdfObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
      pdfObject(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] >>'),
      pdfObject(4, NOTE),
    ]),
  );
  const tree = readPageTree(document);
  if (!tree.ok) throw new Error('fixture page tree unreadable');
  return { document, pages: tree.pages };
}

function goneThenKept(gone: number, kept: number): string {
  return `${'4 0 R '.repeat(gone)}${'3 0 R '.repeat(kept)}`;
}

function walkOf(document: PDFDocument, deadline: ScanDeadline): Walk {
  return { lookup: (object: PDFObject | undefined) => document.context.lookup(object), deadline };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the walks after the load', () => {
  it('stops the allowlist walk once the deadline has passed', async () => {
    const { document } = await bookletWithArray(goneThenKept(0, 10_000));
    const objects = document.context.enumerateIndirectObjects().map(([, object]) => object);

    expect(() => firstFinding(objects, walkOf(document, PAST))).toThrow(ScanTimeout);
    expect(firstFinding(objects, walkOf(document, NEVER))).toBeNull();
  });

  it('stops the comment sweep once the deadline has passed', async () => {
    const { document, pages } = await bookletWithArray(goneThenKept(5_000, 5_000));

    expect(() => removeComments(document, pages, PAST)).toThrow(ScanTimeout);
  });
});

describe('the comment sweep', () => {
  it('only ever removes from the end of an array, so a long one costs a single pass', async () => {
    const { document, pages } = await bookletWithArray(goneThenKept(2_000, 2_000));
    const removals: { index: number; lastIndex: number }[] = [];
    const prototype: { remove: (this: PDFArray, index: number) => void } = PDFArray.prototype;
    const remove = prototype.remove;
    vi.spyOn(PDFArray.prototype, 'remove').mockImplementation(function recordRemoval(
      this: PDFArray,
      index: number,
    ) {
      removals.push({ index, lastIndex: this.size() - 1 });
      remove.call(this, index);
    });

    expect(removeComments(document, pages, NEVER)).toBe(1);
    expect(removals).toHaveLength(2_000);
    expect(removals.every(({ index, lastIndex }) => index === lastIndex)).toBe(true);
  });

  it('keeps what stays in its order', async () => {
    const { document, pages } = await bookletWithArray('3 0 R 4 0 R 1 0 R 4 0 R 2 0 R 4 0 R');

    removeComments(document, pages, NEVER);

    const extra = document.catalog.lookup(PDFName.of('Extra'), PDFArray);
    expect(extra.asArray().map(String)).toEqual(['3 0 R', '1 0 R', '2 0 R']);
  });
});
