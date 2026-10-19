import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { copy } from '@/lib/copy/id';

import { createImageUpload, uploadBooklet, uploadFile } from './upload-client';
import { UploadRejectedError } from './upload-error';
import { jpegPhoto } from '../../../tests/fixtures/uploads';

const storage = vi.hoisted(() => ({ uploadToSignedUrl: vi.fn() }));
const drawnPages = vi.hoisted(() => ({ images: [] as Blob[] }));

// pdf.js needs a real browser; the booklet flow only needs the drawn pages.
vi.mock('@/lib/uploads/rasterise-pdf', () => ({
  renderPdfPages: async function* renderPdfPages() {
    for (const [index, image] of drawnPages.images.entries()) {
      yield await Promise.resolve({ number: index + 1, total: drawnPages.images.length, image });
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

const QUARANTINE_PATH = 'rw-05/0199f5a0-0000-7000-8000-000000000000';
const IMAGE = {
  kind: 'image',
  path: 'rw-05/gallery/0199f5a0-0000-7000-8000-000000000000.webp',
  width: 64,
  height: 48,
  blurhash: 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH',
  thumbnailPath: 'rw-05/gallery/0199f5a0-0000-7000-8000-000000000000-thumb.webp',
};

const fetchMock = vi.fn<typeof fetch>();

// The JSON the helper posted on its nth fetch call.
function sentBody(callIndex: number): unknown {
  const body = fetchMock.mock.calls[callIndex]?.[1]?.body;
  if (typeof body !== 'string') throw new Error(`fetch call ${String(callIndex)} sent no JSON`);
  return JSON.parse(body);
}

function answer(body: unknown, status = 200) {
  return Promise.resolve(Response.json(body, { status }));
}

beforeEach(() => {
  fetchMock.mockReset();
  storage.uploadToSignedUrl.mockReset().mockResolvedValue({ data: {}, error: null });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadFile', () => {
  it('signs, uploads to the signed URL and finalizes, sending only what the server needs', async () => {
    fetchMock
      .mockReturnValueOnce(answer({ ok: true, data: { path: QUARANTINE_PATH, token: 't' } }))
      .mockReturnValueOnce(answer({ ok: true, data: IMAGE }));
    const jpeg = await jpegPhoto();
    const file = new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' });

    const result = await uploadFile(file, { rwId: 5, purpose: 'gallery' });

    expect(result).toEqual(IMAGE);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/uploads/sign');
    expect(sentBody(0)).toEqual({
      rwId: 5,
      contentType: 'image/jpeg',
      size: jpeg.length,
      leadingBytes: jpeg.subarray(0, 64).toString('base64'),
    });
    expect(storage.uploadToSignedUrl).toHaveBeenCalledWith(QUARANTINE_PATH, 't', file, {
      contentType: 'image/jpeg',
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/uploads/finalize');
    expect(sentBody(1)).toEqual({
      path: QUARANTINE_PATH,
      purpose: 'gallery',
    });
  });

  it('passes the server’s refusal on word for word, such as the HEIC message', async () => {
    fetchMock.mockReturnValueOnce(
      answer(
        { ok: false, error: { code: 'VALIDATION', message: copy.uploads.problems.heic } },
        400,
      ),
    );

    const upload = uploadFile(new Blob(['x'], { type: 'image/jpeg' }), {
      rwId: 5,
      purpose: 'gallery',
    });

    await expect(upload).rejects.toEqual(
      new UploadRejectedError(copy.uploads.problems.heic, 'VALIDATION'),
    );
    expect(storage.uploadToSignedUrl).not.toHaveBeenCalled();
  });

  it('gives the generic message when an answer is not what the routes send', async () => {
    fetchMock.mockReturnValueOnce(answer({ ok: true, data: { path: 42 } }));

    await expect(
      uploadFile(new Blob(['x'], { type: 'image/jpeg' }), { rwId: 5, purpose: 'gallery' }),
    ).rejects.toEqual(new UploadRejectedError(copy.forms.image.failed));
  });

  it('stops when the file could not reach the quarantine', async () => {
    fetchMock.mockReturnValueOnce(
      answer({ ok: true, data: { path: QUARANTINE_PATH, token: 't' } }),
    );
    storage.uploadToSignedUrl.mockResolvedValue({ data: null, error: new Error('network') });

    await expect(
      uploadFile(new Blob(['x'], { type: 'image/jpeg' }), { rwId: 5, purpose: 'gallery' }),
    ).rejects.toBeInstanceOf(UploadRejectedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('createImageUpload', () => {
  it('hands the ImageUploader the image fields, the thumbnail included', async () => {
    fetchMock
      .mockReturnValueOnce(answer({ ok: true, data: { path: QUARANTINE_PATH, token: 't' } }))
      .mockReturnValueOnce(answer({ ok: true, data: IMAGE }));

    const upload = createImageUpload({ rwId: 5, purpose: 'gallery' });

    await expect(upload(new Blob(['x'], { type: 'image/jpeg' }))).resolves.toEqual({
      path: IMAGE.path,
      width: 64,
      height: 48,
      blurhash: IMAGE.blurhash,
      thumbnailPath: IMAGE.thumbnailPath,
    });
  });
});

describe('uploadBooklet', () => {
  const BOOKLET_ID = '6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';
  const PDF = {
    kind: 'pdf',
    path: `rw-05/booklets/${BOOKLET_ID}/booklet.pdf`,
    pageCount: 2,
    fileSizeBytes: 900,
  };
  const pagePath = (page: number) => `${QUARANTINE_PATH}.${BOOKLET_ID}.000${String(page)}.0002`;
  const signedPages = {
    pageCount: 2,
    pages: [1, 2].map((pageNumber) => ({
      pageNumber,
      path: pagePath(pageNumber),
      token: `t${String(pageNumber)}`,
    })),
  };

  beforeEach(() => {
    drawnPages.images = [
      new Blob(['page 1'], { type: 'image/webp' }),
      new Blob(['page 2'], { type: 'image/webp' }),
    ];
  });

  it('publishes the PDF, draws its pages, signs them in one call and finalizes each page', async () => {
    fetchMock
      .mockReturnValueOnce(answer({ ok: true, data: { path: QUARANTINE_PATH, token: 't' } }))
      .mockReturnValueOnce(answer({ ok: true, data: PDF }))
      .mockReturnValueOnce(answer({ ok: true, data: signedPages }))
      .mockReturnValueOnce(
        answer({ ok: true, data: { ...IMAGE, path: 'p1', thumbnailPath: null } }),
      )
      .mockReturnValueOnce(
        answer({ ok: true, data: { ...IMAGE, path: 'p2', thumbnailPath: null } }),
      );
    const progress: number[] = [];

    const result = await uploadBooklet(
      new File(['%PDF-1.7'], 'booklet.pdf', { type: 'application/pdf' }),
      { rwId: 5, bookletId: BOOKLET_ID },
      (done) => progress.push(done),
    );

    expect(result).toEqual(PDF);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/api/uploads/sign',
      '/api/uploads/finalize',
      '/api/uploads/sign-pages',
      '/api/uploads/finalize',
      '/api/uploads/finalize',
    ]);
    expect(sentBody(2)).toEqual({ rwId: 5, bookletId: BOOKLET_ID });
    expect(sentBody(3)).toEqual({ path: pagePath(1), purpose: 'booklet-page' });
    expect(storage.uploadToSignedUrl).toHaveBeenNthCalledWith(
      2,
      pagePath(1),
      't1',
      drawnPages.images[0],
      {
        contentType: 'image/webp',
      },
    );
    expect(progress).toEqual([1, 2]);
  });

  it('stops when the server counts other pages than the browser drew', async () => {
    fetchMock
      .mockReturnValueOnce(answer({ ok: true, data: { path: QUARANTINE_PATH, token: 't' } }))
      .mockReturnValueOnce(answer({ ok: true, data: PDF }))
      .mockReturnValueOnce(answer({ ok: true, data: { ...signedPages, pageCount: 3 } }));

    await expect(
      uploadBooklet(new File(['%PDF-1.7'], 'booklet.pdf', { type: 'application/pdf' }), {
        rwId: 5,
        bookletId: BOOKLET_ID,
      }),
    ).rejects.toEqual(new UploadRejectedError(copy.uploads.bookletPagesFailed));
    expect(storage.uploadToSignedUrl).toHaveBeenCalledTimes(1);
  });
});
