import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { pageScale, renderPdfPages } from './rasterise-pdf';

// pdf.js needs a browser; these tests stand in for it and record what the module asks of it.
const pdfjs = vi.hoisted(() => ({
  documentOptions: [] as unknown[],
  renderOptions: [] as unknown[],
}));

vi.mock('pdfjs-dist', () => ({
  AnnotationMode: { DISABLE: 0, ENABLE: 1, ENABLE_FORMS: 2, ENABLE_STORAGE: 3 },
  GlobalWorkerOptions: { workerPort: {} },
  getDocument: (options: unknown) => {
    pdfjs.documentOptions.push(options);
    const page = {
      getViewport: ({ scale }: { scale: number }) => ({ width: 420 * scale, height: 595 * scale }),
      render: (options: unknown) => {
        pdfjs.renderOptions.push(options);
        return { promise: Promise.resolve() };
      },
      cleanup: () => undefined,
    };
    return {
      promise: Promise.resolve({ numPages: 1, getPage: () => Promise.resolve(page) }),
      destroy: () => Promise.resolve(),
    };
  },
}));

const PUBLISHED_URL =
  'http://127.0.0.1:54321/storage/v1/object/public/public-media/rw-05/booklets/b/booklet.pdf';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pageScale', () => {
  it('brings the long edge of a page to 1600 px, portrait or landscape', () => {
    expect(595 * pageScale(420, 595)).toBeCloseTo(1600);
    expect(842 * pageScale(842, 595)).toBeCloseTo(1600);
  });
});

// Security review of PR #14, F3: the pages come from the published copy and show no annotations.
describe('renderPdfPages', () => {
  it('loads the published copy by its address and draws its pages without annotations', async () => {
    const canvas = {
      width: 0,
      height: 0,
      toBlob: (done: (blob: Blob) => void) => {
        done(new Blob(['page'], { type: 'image/webp' }));
      },
    };
    vi.stubGlobal('document', { createElement: () => canvas });

    const pages = [];
    for await (const page of renderPdfPages(PUBLISHED_URL)) pages.push(page.number);

    expect(pages).toEqual([1]);
    expect(pdfjs.documentOptions).toEqual([{ url: PUBLISHED_URL }]);
    expect(pdfjs.renderOptions).toEqual([expect.objectContaining({ annotationMode: 0 })]);
  });
});

// Security review of PR #14, F9: the bundled pdf.js (6.4) has no eval path for fonts and no isEvalSupported switch
// left to set. This fails if a pdfjs-dist bundled later compiles code at run time again.
describe('the bundled pdf.js', () => {
  it.each(['pdfjs-dist/build/pdf.mjs', 'pdfjs-dist/build/pdf.worker.min.mjs'])(
    'compiles no code at run time in %s',
    (bundle) => {
      const source = readFileSync(createRequire(import.meta.url).resolve(bundle), 'utf8');

      expect(source).not.toContain('new Function(');
      expect(source).not.toMatch(/[^\w.]eval\(/);
      expect(source).not.toContain('isEvalSupported');
    },
  );
});
