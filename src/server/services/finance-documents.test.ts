import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseClient } from '@/db/rpc-result';
import { checkUploadedFile } from '@/lib/uploads/inspect';
import { parseQuarantinePath } from '@/lib/uploads/paths';
import { downloadObject, quarantineObject } from '@/server/services/upload-storage';

import { proofDigest, removeFinanceDocument, storeFinanceDocument } from './finance-documents';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/images/re-encode', () => ({
  reencodeImage: vi.fn(() => Promise.resolve({ webp: new Uint8Array([9, 9, 9]) })),
}));
vi.mock('@/lib/uploads/inspect', () => ({ checkUploadedFile: vi.fn() }));
vi.mock('@/lib/uploads/paths', () => ({
  parseQuarantinePath: vi.fn(),
  quarantinePathFor: vi.fn(() => 'kelurahan/upload-1'),
}));
vi.mock('@/lib/uploads/pdf-scan', () => ({ scanBookletPdf: vi.fn() }));
vi.mock('@/lib/uploads/scan-slots', () => ({ withScanSlot: vi.fn() }));
vi.mock('@/server/services/upload-storage', () => ({
  downloadObject: vi.fn(),
  quarantineObject: vi.fn(),
  retireQuarantineObject: vi.fn(() => Promise.resolve()),
  storageStatusOf: vi.fn(() => undefined),
}));

// Review of PR #80, M-4: every finance proof is hashed as it arrives and the digest stored with its documents path.

const IMAGE_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

interface FakeClient {
  client: DatabaseClient;
  inserted: unknown[];
  calls: string[];
  deleted: unknown[];
}

function fakeClient(): FakeClient {
  const inserted: unknown[] = [];
  const deleted: unknown[] = [];
  const calls: string[] = [];
  const storage = {
    from: () => ({
      upload: () => {
        calls.push('upload');
        return Promise.resolve({ error: null });
      },
      remove: () => Promise.resolve({ error: null }),
    }),
  };
  const from = () => ({
    insert: (row: unknown) => {
      calls.push('insert');
      inserted.push(row);
      return Promise.resolve({ error: null });
    },
    delete: () => ({
      eq: (column: string, value: unknown) => {
        deleted.push({ column, value });
        return Promise.resolve({ error: null });
      },
    }),
  });
  // A stand-in for the service-role client with only the calls this module makes.
  const client = { storage, from } as unknown as DatabaseClient;
  return { client, inserted, calls, deleted };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(parseQuarantinePath).mockReturnValue({
    owner: 'kelurahan',
    rwId: null,
    objectName: 'upload-1',
    page: null,
    signedAtMs: Date.now(),
  });
  vi.mocked(quarantineObject).mockResolvedValue({
    size: IMAGE_BYTES.length,
    createdAtMs: Date.now(),
  });
  vi.mocked(downloadObject).mockResolvedValue(IMAGE_BYTES);
  vi.mocked(checkUploadedFile).mockResolvedValue({ kind: 'image', type: 'image/jpeg' });
});

describe('proofDigest', () => {
  it('is the lowercase hex SHA-256 of the bytes', () => {
    expect(proofDigest(IMAGE_BYTES)).toBe(createHash('sha256').update(IMAGE_BYTES).digest('hex'));
    expect(proofDigest(IMAGE_BYTES)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('storeFinanceDocument (M-4)', () => {
  it('stores the digest of the uploaded bytes, before any re-encoding, with the path, before the file', async () => {
    const fake = fakeClient();
    const stored = await storeFinanceDocument(
      fake.client,
      'kelurahan/upload-1',
      'payouts/batch-1/bukti',
    );
    expect(stored).toEqual({ ok: true, path: 'payouts/batch-1/bukti.webp' });
    expect(fake.inserted).toEqual([
      { path: 'payouts/batch-1/bukti.webp', sha256: proofDigest(IMAGE_BYTES) },
    ]);
    expect(fake.calls).toEqual(['insert', 'upload']);
  });

  it('forgets the digest when the document is taken out again', async () => {
    const fake = fakeClient();
    await removeFinanceDocument(fake.client, 'payouts/batch-1/bukti.webp');
    expect(fake.deleted).toEqual([{ column: 'path', value: 'payouts/batch-1/bukti.webp' }]);
  });
});
