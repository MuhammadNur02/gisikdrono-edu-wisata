import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { uploadBooklet } from './upload-client';
import { UploadRejectedError } from './upload-error';

// How a booklet's pages reach public-media. Security review of PR #14, M2: every page goes to quarantine before any
// is finalized, so the URLs' five minutes cover the uploads alone. F3: the pages are drawn from the copy finalize
// published, so they show what the published PDF shows, never the file the officer picked.

const storage = vi.hoisted(() => ({ uploadToSignedUrl: vi.fn() }));
const drawn = vi.hoisted(() => ({ images: [] as Blob[], from: [] as unknown[] }));

// pdf.js needs a real browser; the booklet flow only needs the drawn pages, and what they were drawn from.
vi.mock('@/lib/uploads/rasterise-pdf', () => ({
  renderPdfPages: async function* renderPdfPages(source: unknown) {
    drawn.from.push(source);
    for (const [index, image] of drawn.images.entries()) {
      yield await Promise.resolve({ number: index + 1, total: drawn.images.length, image });
    }
  },
}));

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    storage: {
      from: (bucket: string) => ({
        uploadToSignedUrl: storage.uploadToSignedUrl,
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `http://storage.test/storage/v1/object/public/${bucket}/${path}` },
        }),
      }),
    },
  }),
}));

const BOOKLET_ID = '6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';
const QUARANTINE_PATH = 'rw-05/0199f5a0-0000-7000-8000-000000000000';
const PAGE_COUNT = 6;
const PDF = {
  kind: 'pdf',
  path: `rw-05/booklets/${BOOKLET_ID}/booklet.pdf`,
  pageCount: PAGE_COUNT,
  fileSizeBytes: 900,
};
const PAGE_IMAGE = {
  kind: 'image',
  path: `rw-05/booklets/${BOOKLET_ID}/pages/0001.webp`,
  width: 1131,
  height: 1600,
  blurhash: 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH',
  thumbnailPath: null,
};
const SIGNED_PAGES = {
  pageCount: PAGE_COUNT,
  pages: Array.from({ length: PAGE_COUNT }, (_, index) => ({
    pageNumber: index + 1,
    path: `${QUARANTINE_PATH}.${BOOKLET_ID}.000${String(index + 1)}.0006`,
    token: `t${String(index + 1)}`,
  })),
};

const fetchMock = vi.fn<typeof fetch>();
const steps: string[] = [];

function answer(body: unknown, status = 200) {
  return Promise.resolve(Response.json(body, { status }));
}

function failure(code: string, status: number) {
  return answer({ ok: false, error: { code, message: `pesan ${code}` } }, status);
}

// Answers sign, the PDF's finalize and sign-pages; page finalizes get `pageAnswer`.
function serve(pageAnswer: (path: string, attempt: number) => Promise<Response>) {
  const attempts = new Map<string, number>();
  fetchMock.mockImplementation((url, init) => {
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    if (url === '/api/uploads/sign') {
      return answer({ ok: true, data: { path: QUARANTINE_PATH, token: 't' } });
    }
    if (url === '/api/uploads/sign-pages') return answer({ ok: true, data: SIGNED_PAGES });
    if (body.purpose !== 'booklet-page') return answer({ ok: true, data: PDF });
    const path = String(body.path);
    const attempt = (attempts.get(path) ?? 0) + 1;
    attempts.set(path, attempt);
    steps.push(`finalize ${path.slice(-9, -5)}`);
    return pageAnswer(path, attempt);
  });
}

function upload(onPage?: (done: number) => void) {
  return uploadBooklet(
    new File(['%PDF-1.7 with comments'], 'booklet.pdf', { type: 'application/pdf' }),
    { rwId: 5, bookletId: BOOKLET_ID },
    onPage,
  );
}

const publishEveryPage = () => answer({ ok: true, data: PAGE_IMAGE });

beforeEach(() => {
  steps.length = 0;
  drawn.from = [];
  drawn.images = Array.from(
    { length: PAGE_COUNT },
    (_, index) => new Blob([`page ${String(index + 1)}`], { type: 'image/webp' }),
  );
  storage.uploadToSignedUrl.mockReset().mockImplementation((path: string) => {
    if (path.includes(BOOKLET_ID)) steps.push(`put ${path.slice(-9, -5)}`);
    return Promise.resolve({ data: {}, error: null });
  });
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadBooklet: where the pages are drawn from', () => {
  it('draws the pages from the copy finalize published, never from the file the officer picked', async () => {
    serve(publishEveryPage);

    await upload();

    expect(drawn.from).toEqual([
      `http://storage.test/storage/v1/object/public/public-media/${PDF.path}`,
    ]);
  });
});

describe('uploadBooklet: pages go to quarantine first, then finalize one by one', () => {
  it('puts every page in quarantine before the first page is finalized', async () => {
    serve(publishEveryPage);

    await upload();

    const firstFinalize = steps.findIndex((step) => step.startsWith('finalize'));
    expect(steps.slice(0, firstFinalize)).toHaveLength(PAGE_COUNT);
    expect(steps.slice(firstFinalize)).toEqual(
      ['0001', '0002', '0003', '0004', '0005', '0006'].map((page) => `finalize ${page}`),
    );
  });

  it('uploads the pages four at a time', async () => {
    serve(publishEveryPage);
    let inFlight = 0;
    let mostInFlight = 0;
    storage.uploadToSignedUrl.mockImplementation(async () => {
      inFlight += 1;
      mostInFlight = Math.max(mostInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { data: {}, error: null };
    });

    await upload();

    expect(mostInFlight).toBe(4);
  });

  it('counts a page as done when its retry finds it published already', async () => {
    serve((path, attempt) => {
      // Page 2's first reply is lost after the server published it.
      if (path.endsWith('0002.0006') && attempt === 1)
        return Promise.reject(new TypeError('network'));
      if (path.endsWith('0002.0006')) return failure('CONFLICT', 409);
      return publishEveryPage();
    });
    const progress: number[] = [];

    await expect(upload((done) => progress.push(done))).resolves.toEqual(PDF);
    expect(progress).toEqual([1, 2, 3, 4, 5, 6]);
    expect(steps.filter((step) => step === 'finalize 0002')).toHaveLength(2);
  });

  it('tries an upload that failed once more, and takes an object already there as arrived', async () => {
    serve(publishEveryPage);
    storage.uploadToSignedUrl
      .mockResolvedValueOnce({ data: {}, error: null })
      .mockResolvedValueOnce({ data: null, error: { statusCode: '500', message: 'busy' } })
      .mockResolvedValueOnce({ data: null, error: { statusCode: '409', message: 'exists' } });

    await expect(upload()).resolves.toEqual(PDF);
  });

  it('stops at a refusal without trying again, and never takes it for a finished page', async () => {
    serve((path) => (path.endsWith('0003.0006') ? failure('VALIDATION', 400) : publishEveryPage()));

    await expect(upload()).rejects.toEqual(
      new UploadRejectedError('pesan VALIDATION', 'VALIDATION'),
    );
    expect(steps.filter((step) => step === 'finalize 0003')).toHaveLength(1);
    expect(steps).not.toContain('finalize 0004');
  });
});
