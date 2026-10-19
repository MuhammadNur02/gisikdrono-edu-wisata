import { PDFArray, PDFDict, PDFDocument, PDFName, type PDFObject } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { MARKUP_ANNOTATIONS } from './pdf-rules';
import { scanBookletPdf } from './pdf-scan';
import { handWrittenPdf, readableCopy } from '../../../tests/fixtures/pdf';
import { PRIVATE_DATA_CASES } from '../../../tests/fixtures/pdf-private-data';

// Security review of PR #14, L4, N1 and N2: the published copy leaves out metadata, private data, thumbnails,
// orphans and comments whole, and the scan reports exactly the comments it removed. Every check reads the copy back
// through pdf-lib with its streams inflated; pdf-cleanup-control.test.ts shows each would fail without the cleanup.

async function publishedCopy(pdf: Uint8Array) {
  const result = await scanBookletPdf(pdf);
  if (!result.ok)
    throw new Error(`the scan refused the fixture: ${result.problem} ${result.detail ?? ''}`);
  return result;
}

// Subtypes of every comment-like dictionary pdf-lib reads back from the copy, nested ones included.
async function commentsIn(pdf: Uint8Array): Promise<string[]> {
  const copy = await PDFDocument.load(pdf, { updateMetadata: false });
  const found: string[] = [];
  const pending = copy.context.enumerateIndirectObjects().map(([, object]) => object);
  while (pending.length > 0) {
    const next = pending.pop();
    if (next instanceof PDFArray) pending.push(...next.asArray());
    if (!(next instanceof PDFDict)) continue;
    const subtype = next.get(PDFName.of('Subtype'));
    if (subtype instanceof PDFName && MARKUP_ANNOTATIONS.has(subtype.decodeText())) {
      found.push(subtype.decodeText());
    }
    pending.push(...next.entries().map(([, value]) => value));
  }
  return found;
}

async function pageAnnotationTypes(pdf: Uint8Array): Promise<string[] | null> {
  const copy = await PDFDocument.load(pdf, { updateMetadata: false });
  const annots = copy.getPage(0).node.lookup(PDFName.of('Annots'));
  if (!(annots instanceof PDFArray)) return null;
  return annots.asArray().map((entry) => {
    const annotation = copy.context.lookup(entry);
    const subtype = annotation instanceof PDFDict ? annotation.get(PDFName.of('Subtype')) : null;
    return subtype instanceof PDFName ? subtype.decodeText() : 'unknown';
  });
}

describe('scanBookletPdf: what the published copy leaves out', () => {
  it.each(PRIVATE_DATA_CASES.map((privateCase) => [privateCase.name, privateCase] as const))(
    'leaves out %s',
    async (_name, privateCase) => {
      const result = await publishedCopy(privateCase.pdf());
      const copy = await readableCopy(result.pdf);

      for (const needle of privateCase.needles) expect(copy).not.toContain(needle);
      expect(await commentsIn(result.pdf)).toEqual([]);
    },
  );

  it.each(PRIVATE_DATA_CASES.map((privateCase) => [privateCase.name, privateCase] as const))(
    'reports exactly the comments it removed from %s',
    async (_name, privateCase) => {
      const result = await publishedCopy(privateCase.pdf());

      expect(result.removed).toEqual({ openAction: null, annotations: privateCase.comments });
    },
  );
});

// Security review of PR #14, F5: the trailer's /ID is the authoring tool's fingerprint of the source file.
describe('scanBookletPdf: the file identifier', () => {
  it('leaves out the trailer /ID', async () => {
    const pdf = handWrittenPdf('', [], '/ID [<4A6F686E446F65> <4A6F686E446F65>] ');
    const before = await PDFDocument.load(pdf, { updateMetadata: false });
    expect(before.context.trailerInfo.ID).toBeDefined();

    const result = await publishedCopy(pdf);
    const copy = await PDFDocument.load(result.pdf, { updateMetadata: false });

    expect(copy.context.trailerInfo.ID).toBeUndefined();
  });
});

describe('scanBookletPdf: what the published copy keeps', () => {
  function caseNamed(name: string) {
    const found = PRIVATE_DATA_CASES.find((privateCase) => privateCase.name === name);
    if (!found) throw new Error(`no fixture named ${name}`);
    return found.pdf();
  }

  it('keeps the link on its page when the comments beside it go', async () => {
    const result = await publishedCopy(caseNamed('a sticky note and its popup next to a link'));

    expect(await pageAnnotationTypes(result.pdf)).toEqual(['Link']);
  });

  it('keeps a link whose /Popup pointed at a note, without the reference', async () => {
    const result = await publishedCopy(caseNamed('a note only a link’s /Popup points at'));
    const copy = await readableCopy(result.pdf);

    expect(await pageAnnotationTypes(result.pdf)).toEqual(['Link']);
    expect(copy).not.toContain('/Popup');
  });

  it('drops the /Annots array when only comments were on the page', async () => {
    const result = await publishedCopy(caseNamed('a highlight alone on its page'));

    expect(await pageAnnotationTypes(result.pdf)).toBeNull();
  });

  it('keeps the structure tree of a tagged PDF, without the references to the note', async () => {
    const result = await publishedCopy(
      caseNamed('a note the structure tree of a tagged PDF points at'),
    );
    const copy = await readableCopy(result.pdf);

    expect(copy).toContain('/StructTreeRoot');
    expect(copy).toContain('/StructElem');
    expect(copy).not.toContain('/OBJR');
  });

  // Security review of PR #14, Info A: a number tree and a name tree pair each key with the value after it, and a
  // page's parent-tree entry is indexed by marked-content id, so a removed reference leaves null in its place.
  it('keeps every key of a number tree and a name tree on its own value', async () => {
    const result = await publishedCopy(caseNamed('a note a number tree and a name tree point at'));
    const copy = await PDFDocument.load(result.pdf, { updateMetadata: false });
    const lookup = (object: PDFObject | undefined) => copy.context.lookup(object);
    const describeEntry = (entry: PDFObject | undefined): string => {
      const value = lookup(entry);
      if (value instanceof PDFArray) return `[${value.asArray().map(describeEntry).join(' ')}]`;
      if (value instanceof PDFDict) return String(lookup(value.get(PDFName.of('Type'))) ?? 'dict');
      return value === undefined ? 'missing' : value.toString();
    };
    const arrayAt = (dict: PDFObject | undefined, ...keys: string[]): string[] => {
      let current = lookup(dict);
      for (const key of keys)
        current = current instanceof PDFDict ? lookup(current.get(PDFName.of(key))) : undefined;
      return current instanceof PDFArray ? current.asArray().map(describeEntry) : [];
    };

    expect(arrayAt(copy.catalog, 'StructTreeRoot', 'ParentTree', 'Nums')).toEqual([
      '0',
      '[/StructElem null /StructElem]',
      '1',
      'null',
      '2',
      '/StructElem',
    ]);
    expect(arrayAt(copy.catalog, 'Names', 'Dests', 'Names')).toEqual([
      '(bab-1)',
      'null',
      '(sampul)',
      '[/Page /Fit]',
    ]);
  });
});
