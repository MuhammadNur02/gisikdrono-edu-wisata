import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/db/types';
import type { StaffContext } from '@/server/auth/guards';
import { readPublishedBookletFiles } from '@/server/services/upload-service';

import { createBooklet, updateBooklet } from './booklet-service';

const session = vi.hoisted(() => ({ client: null as SupabaseClient<Database> | null }));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => Promise.resolve(session.client),
}));
vi.mock('@/server/services/upload-service', () => ({
  readPublishedBookletFiles: vi.fn(),
  removeBookletFiles: vi.fn(),
}));

const ADMIN_05: StaffContext = {
  userId: '0192f3a4-0000-7000-8000-000000000005',
  role: 'admin_rw',
  rwId: 5,
  isAal2: true,
  totpVerifiedAt: null,
  claimsVersion: 1,
};
const BOOKLET_ID = '6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';
const FOLDER = `rw-05/booklets/${BOOKLET_ID}`;
const VALUES = {
  id: BOOKLET_ID,
  pdfPath: `${FOLDER}/booklet.pdf`,
  kind: 'ebooklet' as const,
  slug: 'ecowastreme-2026',
  title: 'Mengenal Ecowastreme RW 05',
  description: null,
  status: 'published' as const,
};

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? Object.fromEntries(Object.entries(value))
    : {};
}

function jsonReply(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// A real typed client whose fetch answers PostgREST: every write is recorded and answered with the row it wrote, and a
// read answers with `stored` (as src/server/services/document-service.test.ts does).
function sessionClientWith(stored: Record<string, unknown> | null) {
  const writes: { method: string; body: Record<string, unknown> }[] = [];
  const fakeFetch: typeof fetch = (_input, init) => {
    const method = init?.method ?? 'GET';
    if (method === 'GET') return Promise.resolve(jsonReply(stored));
    const body = recordOf(typeof init?.body === 'string' ? JSON.parse(init.body) : null);
    writes.push({ method, body });
    return Promise.resolve(jsonReply({ ...stored, ...body, download_count: 0 }));
  };
  session.client = createClient<Database>('http://supabase.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fakeFetch },
  });
  return writes;
}

beforeEach(() => {
  vi.mocked(readPublishedBookletFiles)
    .mockReset()
    .mockResolvedValue({ pageCount: 12, fileSizeBytes: 345678 });
});

describe('createBooklet', () => {
  it('keeps the page count and size Storage holds, and paths that follow from the owner and id', async () => {
    const writes = sessionClientWith(null);
    await createBooklet(ADMIN_05, 5, VALUES);
    const [write] = writes;
    expect(write?.method).toBe('POST');
    expect(write?.body).toMatchObject({
      rw_id: 5,
      created_by: ADMIN_05.userId,
      pdf_path: `${FOLDER}/booklet.pdf`,
      cover_path: `${FOLDER}/pages/0001.webp`,
      page_images_prefix: `${FOLDER}/pages`,
      page_count: 12,
      file_size_bytes: 345678,
    });
  });

  it("refuses a PDF in another RW's folder before reading Storage", async () => {
    const writes = sessionClientWith(null);
    const foreign = { ...VALUES, pdfPath: VALUES.pdfPath.replace('rw-05', 'rw-08') };
    await expect(createBooklet(ADMIN_05, 5, foreign)).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(readPublishedBookletFiles).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it('refuses a booklet whose pages never reached Storage', async () => {
    vi.mocked(readPublishedBookletFiles).mockResolvedValue({ pageCount: 0, fileSizeBytes: 1 });
    const writes = sessionClientWith(null);
    await expect(createBooklet(ADMIN_05, 5, VALUES)).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(writes).toEqual([]);
  });
});

describe('updateBooklet', () => {
  const stored = {
    id: BOOKLET_ID,
    rw_id: 5,
    kind: 'ebooklet',
    slug: 'ecowastreme-2026',
    title: 'Lama',
    description: null,
    pdf_path: `${FOLDER}/booklet.pdf`,
    cover_path: `${FOLDER}/pages/0001.webp`,
    page_count: 12,
    status: 'draft',
    published_at: null,
  };

  it('writes the description columns only, and dates the first publication', async () => {
    const writes = sessionClientWith(stored);
    await updateBooklet(5, VALUES);
    const [write] = writes;
    expect(write?.method).toBe('PATCH');
    expect(Object.keys(write?.body ?? {}).sort()).toEqual(
      ['description', 'kind', 'published_at', 'slug', 'status', 'title'].sort(),
    );
    expect(write?.body.published_at).toEqual(expect.any(String));
  });

  it('refuses another PDF for a saved booklet', async () => {
    const writes = sessionClientWith(stored);
    const other = {
      ...VALUES,
      pdfPath: `rw-05/booklets/${BOOKLET_ID.replace('6f', '7f')}/booklet.pdf`,
    };
    await expect(updateBooklet(5, other)).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(writes).toEqual([]);
  });
});
