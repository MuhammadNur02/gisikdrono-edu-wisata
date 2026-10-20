import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getBookletDownload } from '@/lib/queries/booklets';
import {
  countBookletDownload,
  withinBookletDownloadLimit,
} from '@/server/services/document-service';

import { GET } from './route';

vi.mock('@/lib/queries/booklets', () => ({ getBookletDownload: vi.fn() }));
vi.mock('@/server/services/document-service', () => ({
  countBookletDownload: vi.fn(),
  withinBookletDownloadLimit: vi.fn(),
}));

const BOOKLET_ID = '6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';
const BOOKLET = {
  id: BOOKLET_ID,
  slug: 'foto-kunjungan-rw-05',
  pdfPath: `rw-05/booklets/${BOOKLET_ID}/booklet.pdf`,
};

function download(kind: string, id: string) {
  const request = new Request(`http://localhost/api/documents/${kind}/${id}`, {
    headers: { 'x-real-ip': '203.0.113.7' },
  });
  return GET(request, { params: Promise.resolve({ kind, id }) });
}

describe('GET /api/documents/booklet/[id]', () => {
  beforeEach(() => {
    vi.mocked(getBookletDownload).mockReset().mockResolvedValue(BOOKLET);
    vi.mocked(withinBookletDownloadLimit).mockReset().mockResolvedValue(true);
    vi.mocked(countBookletDownload).mockReset().mockResolvedValue(undefined);
  });

  it('counts the download and sends the visitor to the PDF as an attachment', async () => {
    const response = await download('booklet', BOOKLET_ID);

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe(
      `/storage/v1/object/public/public-media/rw-05/booklets/${BOOKLET_ID}/booklet.pdf`,
    );
    expect(location.searchParams.get('download')).toBe('foto-kunjungan-rw-05.pdf');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(withinBookletDownloadLimit).toHaveBeenCalledWith('203.0.113.7');
    expect(countBookletDownload).toHaveBeenCalledWith(BOOKLET_ID);
  });

  it.each([
    ['another document kind', 'invoice', BOOKLET_ID],
    ['an id that is not a uuid', 'booklet', '..%2F..%2Fsecret'],
  ])('answers 404 for %s without touching the database', async (_case, kind, id) => {
    const response = await download(kind, id);
    expect(response.status).toBe(404);
    expect(withinBookletDownloadLimit).not.toHaveBeenCalled();
    expect(getBookletDownload).not.toHaveBeenCalled();
  });

  it('answers 404 for a booklet that is not published and counts nothing', async () => {
    vi.mocked(getBookletDownload).mockResolvedValue(null);
    const response = await download('booklet', BOOKLET_ID);
    expect(response.status).toBe(404);
    expect(countBookletDownload).not.toHaveBeenCalled();
  });

  it('answers 429 past the limit before looking the booklet up', async () => {
    vi.mocked(withinBookletDownloadLimit).mockResolvedValue(false);
    const response = await download('booklet', BOOKLET_ID);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(getBookletDownload).not.toHaveBeenCalled();
    expect(countBookletDownload).not.toHaveBeenCalled();
  });

  it('answers 503 when the database fails', async () => {
    vi.mocked(countBookletDownload).mockRejectedValue(new Error('connection refused'));
    const response = await download('booklet', BOOKLET_ID);
    expect(response.status).toBe(503);
  });
});
