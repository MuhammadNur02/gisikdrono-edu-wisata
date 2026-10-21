import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { Database } from '@/db/types';

import {
  keepOnlyRowPhotos,
  readPublishedBooklet,
  removeBookletFolder,
  removeUnusedGalleryFiles,
  removeUnusedHeroFiles,
} from './media-library';

const PHOTO = 'rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp';
const THUMB = 'rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-23456789abcd-thumb.webp';
const BOOKLET_ID = '6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';

type Listing = { name: string; metadata: Record<string, unknown> | null }[];

interface FakeStorage {
  // How many rows show each path, whichever column.
  references?: Record<string, number>;
  // Storage listings by folder.
  listings?: Record<string, Listing>;
}

// PostgREST's answer to a count by path: the count in Content-Range, no body.
function countReply(url: URL, references: Record<string, number>): Response {
  const path =
    [...url.searchParams.values()].find((value) => value.startsWith('eq.'))?.slice(3) ?? '';
  return new Response(null, {
    status: 200,
    headers: { 'Content-Range': `*/${String(references[path] ?? 0)}` },
  });
}

function jsonReply(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// The folder a Storage list asks for, without a trailing slash.
function prefixOf(body: unknown): string {
  return typeof body === 'object' && body !== null && 'prefix' in body
    ? String(body.prefix).replace(/\/$/, '')
    : '';
}

// A real typed client whose fetch answers the PostgREST counts and the Storage calls media-library makes, recording
// what was removed (as src/server/services/document-service.test.ts does).
function clientWith({ references = {}, listings = {} }: FakeStorage) {
  const removed: unknown[] = [];
  const fakeFetch: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname.startsWith('/rest/v1/')) return Promise.resolve(countReply(url, references));
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    if (method === 'DELETE') removed.push(body);
    return Promise.resolve(jsonReply(method === 'DELETE' ? [] : (listings[prefixOf(body)] ?? [])));
  };
  const client = createClient<Database>('http://supabase.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fakeFetch },
  });
  return { client, removed };
}

describe('removeUnusedGalleryFiles', () => {
  it("removes a removed item's photo and thumbnail when nothing else shows them", async () => {
    const { client, removed } = clientWith({});
    expect(await removeUnusedGalleryFiles(client, 5, [PHOTO, THUMB])).toEqual([PHOTO, THUMB]);
    expect(removed).toEqual([{ prefixes: [PHOTO, THUMB] }]);
  });

  it('keeps a photo another row still shows, such as the RW page', async () => {
    const { client } = clientWith({ references: { [PHOTO]: 1 } });
    expect(await removeUnusedGalleryFiles(client, 5, [PHOTO, THUMB])).toEqual([THUMB]);
  });

  // A video keeps its address in storage_path, and a row could hold a path of another RW: neither is a file to remove.
  it("touches nothing that is not this owner's own gallery photo", async () => {
    const { client, removed } = clientWith({});
    const foreign = PHOTO.replace('rw-05', 'rw-08');
    const video = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    expect(await removeUnusedGalleryFiles(client, 5, [video, foreign, null])).toEqual([]);
    expect(removed).toEqual([]);
  });
});

describe('readPublishedBooklet', () => {
  it('counts the page images and reads the size of the PDF Storage holds', async () => {
    const { client } = clientWith({
      listings: {
        [`rw-05/booklets/${BOOKLET_ID}`]: [{ name: 'booklet.pdf', metadata: { size: 123456 } }],
        [`rw-05/booklets/${BOOKLET_ID}/pages`]: [
          { name: '0001.webp', metadata: { size: 1 } },
          { name: '0002.webp', metadata: { size: 1 } },
          { name: 'stray.txt', metadata: { size: 1 } },
        ],
      },
    });
    expect(await readPublishedBooklet(client, 5, BOOKLET_ID)).toEqual({
      pageCount: 2,
      fileSizeBytes: 123456,
    });
  });

  it('is null for a booklet whose PDF was never published', async () => {
    const { client } = clientWith({});
    expect(await readPublishedBooklet(client, 5, BOOKLET_ID)).toBeNull();
  });
});

describe('removeBookletFolder', () => {
  it("removes the booklet's PDF and its page images, named from the owner and the id", async () => {
    const pages = `rw-05/booklets/${BOOKLET_ID}/pages`;
    const { client, removed } = clientWith({
      listings: {
        [pages]: [
          { name: '0001.webp', metadata: { size: 1 } },
          { name: '0002.webp', metadata: { size: 1 } },
          { name: '../../rw-08/gallery/x.webp', metadata: { size: 1 } },
        ],
      },
    });
    expect(await removeBookletFolder(client, 5, BOOKLET_ID)).toBe(3);
    expect(removed).toEqual([
      {
        prefixes: [
          `rw-05/booklets/${BOOKLET_ID}/booklet.pdf`,
          `${pages}/0001.webp`,
          `${pages}/0002.webp`,
        ],
      },
    ]);
  });
});

// docs/Security.md R34 (decision of 2026-10-21): what a banner or a row stops showing leaves public-media.
describe('removeUnusedHeroFiles', () => {
  const HERO = 'kelurahan/hero/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp';

  it('removes a hero photo no banner shows any more', async () => {
    const { client, removed } = clientWith({});
    expect(await removeUnusedHeroFiles(client, [HERO, null])).toEqual([HERO]);
    expect(removed).toEqual([{ prefixes: [HERO] }]);
  });

  it('keeps one another banner still shows, and touches nothing outside the hero folder', async () => {
    const { client, removed } = clientWith({ references: { [HERO]: 1 } });
    expect(await removeUnusedHeroFiles(client, [HERO, PHOTO])).toEqual([]);
    expect(removed).toEqual([]);
  });
});

describe('keepOnlyRowPhotos', () => {
  const ARTICLE_ID = '0192f3a4-5b6c-7d8e-9f01-000000000a01';
  const FOLDER = `rw-05/articles/${ARTICLE_ID}`;
  const COVER = `${FOLDER}/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp`;
  const OLD = `${FOLDER}/0192f3a4-5b6c-7d8e-9f01-23456789abce.webp`;
  const target = { rwId: 5 as const, purpose: 'article' as const, entityId: ARTICLE_ID };

  it("removes every photo of the row's folder it does not keep", async () => {
    const { client, removed } = clientWith({
      listings: {
        [FOLDER]: [
          { name: COVER.split('/').at(-1) ?? '', metadata: { size: 1 } },
          { name: OLD.split('/').at(-1) ?? '', metadata: { size: 1 } },
          { name: 'stray.txt', metadata: { size: 1 } },
        ],
      },
    });
    expect(await keepOnlyRowPhotos(client, target, [COVER])).toBe(1);
    expect(removed).toEqual([{ prefixes: [OLD] }]);
  });

  it('removes nothing when the folder holds only what it keeps', async () => {
    const { client, removed } = clientWith({
      listings: { [FOLDER]: [{ name: COVER.split('/').at(-1) ?? '', metadata: { size: 1 } }] },
    });
    expect(await keepOnlyRowPhotos(client, target, [COVER])).toBe(0);
    expect(removed).toEqual([]);
  });
});
