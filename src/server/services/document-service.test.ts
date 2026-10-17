import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { Database } from '@/db/types';

import {
  createDocumentSignedUrl,
  isDocumentPathFor,
  purgeMarkedFiles,
  SIGNED_URL_TTL_SECONDS,
} from './document-service';

type Reply = { status: number; body: unknown };
type RecordedRequest = { method: string; path: string; body: unknown };

const NOW = new Date('2026-10-16T02:00:00Z');
const TWO_DAYS_AGO = '2026-10-14T02:00:00Z';
const ONE_HOUR_AGO = '2026-10-16T01:00:00Z';

// A real typed client whose fetch answers PostgREST and Storage calls from a table keyed by
// "METHOD path", recording every request so the tests see exactly what was deleted and forgotten.
function clientWith(replies: Record<string, Reply>) {
  const requests: RecordedRequest[] = [];
  const fakeFetch: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    requests.push({ method, path: url.pathname, body });
    const reply = replies[`${method} ${url.pathname}`] ?? {
      status: 404,
      body: { message: 'no route' },
    };
    return Promise.resolve(
      new Response(JSON.stringify(reply.body), {
        status: reply.status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  };
  const client = createClient<Database>('http://supabase.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fakeFetch },
  });
  return { client, requests };
}

const markedFiles = [
  { bucket: 'documents', path: 'certificates/b1/participant-1.pdf' },
  { bucket: 'documents', path: 'exports/p1/attendance-1.xlsx' },
];

const quarantineListing = [
  { name: 'old-upload', id: 'o1', created_at: TWO_DAYS_AGO },
  { name: 'fresh-upload', id: 'o2', created_at: ONE_HOUR_AGO },
  { name: 'nested', id: null, created_at: null },
];

const happyReplies: Record<string, Reply> = {
  'POST /rest/v1/rpc/svc_purgeable_files': { status: 200, body: markedFiles },
  'DELETE /storage/v1/object/documents': { status: 200, body: [] },
  'POST /rest/v1/rpc/svc_forget_purged_files': { status: 200, body: 2 },
  'POST /storage/v1/object/list/uploads-quarantine': { status: 200, body: quarantineListing },
  'DELETE /storage/v1/object/uploads-quarantine': { status: 200, body: [] },
};

function bodiesOf(requests: RecordedRequest[], method: string, path: string): unknown[] {
  return requests
    .filter((request) => request.method === method && request.path === path)
    .map((request) => request.body);
}

describe('purgeMarkedFiles', () => {
  it('deletes the marked files, forgets them, and drops quarantine uploads older than a day', async () => {
    const { client, requests } = clientWith(happyReplies);

    // Each of the three quarantine prefixes lists the same objects here, so one stale file per prefix.
    await expect(purgeMarkedFiles(client, NOW)).resolves.toEqual({ processed: 5, failed: 0 });

    expect(bodiesOf(requests, 'DELETE', '/storage/v1/object/documents')).toEqual([
      { prefixes: ['certificates/b1/participant-1.pdf', 'exports/p1/attendance-1.xlsx'] },
    ]);
    expect(bodiesOf(requests, 'POST', '/rest/v1/rpc/svc_forget_purged_files')).toEqual([
      { p_paths: ['certificates/b1/participant-1.pdf', 'exports/p1/attendance-1.xlsx'] },
    ]);
    expect(bodiesOf(requests, 'DELETE', '/storage/v1/object/uploads-quarantine')).toEqual([
      { prefixes: ['rw-05/old-upload'] },
      { prefixes: ['rw-08/old-upload'] },
      { prefixes: ['kelurahan/old-upload'] },
    ]);
  });

  it('keeps a file marked when Storage refuses to delete it, so the next run tries again', async () => {
    const { client, requests } = clientWith({
      ...happyReplies,
      'DELETE /storage/v1/object/documents': {
        status: 500,
        body: { message: 'storage unavailable' },
      },
      'POST /storage/v1/object/list/uploads-quarantine': { status: 200, body: [] },
    });

    await expect(purgeMarkedFiles(client, NOW)).resolves.toEqual({ processed: 0, failed: 2 });
    expect(bodiesOf(requests, 'POST', '/rest/v1/rpc/svc_forget_purged_files')).toEqual([]);
  });

  it('does nothing when nothing is marked or stale', async () => {
    const { client, requests } = clientWith({
      ...happyReplies,
      'POST /rest/v1/rpc/svc_purgeable_files': { status: 200, body: [] },
      'POST /storage/v1/object/list/uploads-quarantine': { status: 200, body: [] },
    });

    await expect(purgeMarkedFiles(client, NOW)).resolves.toEqual({ processed: 0, failed: 0 });
    expect(requests.filter((request) => request.method === 'DELETE')).toEqual([]);
  });

  it('fails the run when the quarantine cannot be listed', async () => {
    const { client } = clientWith({
      ...happyReplies,
      'POST /storage/v1/object/list/uploads-quarantine': { status: 500, body: { message: 'down' } },
    });

    await expect(purgeMarkedFiles(client, NOW)).rejects.toBeDefined();
  });
});

describe('createDocumentSignedUrl', () => {
  const ticketPath = 'bookings/b1/ticket-GSK-7F3K9Q2M-05.pdf';
  const signRoute = `POST /storage/v1/object/sign/documents/${ticketPath}`;

  it('keeps the lifetimes of docs/Security.md §10.3', () => {
    expect(SIGNED_URL_TTL_SECONDS).toEqual({
      ticket: 600,
      certificate: 600,
      invoice: 900,
      quotation: 900,
      receipt: 900,
      credit_note: 900,
      export: 300,
      whatsapp_document_header: 3600,
    });
  });

  it('signs the documents object for the lifetime of its kind', async () => {
    const { client, requests } = clientWith({
      [signRoute]: {
        status: 200,
        body: { signedURL: `/object/sign/documents/${ticketPath}?token=t1` },
      },
    });

    await expect(createDocumentSignedUrl(client, ticketPath, 'ticket')).resolves.toBe(
      `http://supabase.test/storage/v1/object/sign/documents/${ticketPath}?token=t1`,
    );
    await createDocumentSignedUrl(client, ticketPath, 'whatsapp_document_header');
    expect(bodiesOf(requests, 'POST', `/storage/v1/object/sign/documents/${ticketPath}`)).toEqual([
      { expiresIn: 600 },
      { expiresIn: 3600 },
    ]);
  });

  it.each([
    ['ticket', 'bookings/b1/ticket.pdf', true],
    ['certificate', 'certificates/b1/participant-01.pdf', true],
    ['export', 'exports/p1/visits-2026-10.xlsx', true],
    ['whatsapp_document_header', 'certificates/b1/group.pdf', true],
    ['ticket', 'exports/p1/visits-2026-10.xlsx', false],
    ['invoice', 'payouts/2026-10/batch.csv', false],
    ['ticket', 'bookings/../exports/p1/visits.xlsx', false],
    ['ticket', 'bookings/b1/../../exports/p1/visits.xlsx', false],
    ['ticket', '/bookings/b1/ticket.pdf', false],
    ['ticket', 'bookings//ticket.pdf', false],
    ['ticket', 'bookings/ticket.pdf', false],
    ['ticket', 'bookings/b1/.hidden', false],
  ] as const)('%s may be signed from %s: %s', (kind, path, allowed) => {
    expect(isDocumentPathFor(kind, path)).toBe(allowed);
  });

  it("refuses a path outside its kind's folder before asking Storage", async () => {
    const { client, requests } = clientWith({});

    await expect(
      createDocumentSignedUrl(client, 'exports/p1/visits.xlsx', 'ticket'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(requests).toEqual([]);
  });

  it('fails when Storage refuses, so no route ever redirects to a URL that does not work', async () => {
    const { client } = clientWith({
      [signRoute]: { status: 400, body: { message: 'Object not found' } },
    });

    await expect(createDocumentSignedUrl(client, ticketPath, 'ticket')).rejects.toBeDefined();
  });
});
