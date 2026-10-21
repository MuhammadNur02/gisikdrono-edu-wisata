import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_CONCURRENT_PDF_SCANS } from '@/config/uploads';
import { publicMediaPathFor, thumbnailPathFor } from '@/lib/uploads/paths';
import { withScanSlot } from '@/lib/uploads/scan-slots';

import { finalizeUpload } from './upload-service';
import {
  createFakeAdminClient,
  type FakeAdminClient,
} from '../../../tests/fixtures/fake-admin-client';
import { cleanBookletPdf } from '../../../tests/fixtures/pdf';
import { HEAVY_FILE_TEST_TIMEOUT_MS } from '../../../tests/fixtures/timeouts';
import { BOOKLET_ID, OFFICER_05, quarantinedIn } from '../../../tests/fixtures/upload-service';
import { jpegPhoto } from '../../../tests/fixtures/uploads';

vi.setConfig({ testTimeout: HEAVY_FILE_TEST_TIMEOUT_MS });

// Security review of PR #14, F6 and F2: a gallery photo's thumbnail is written before the photo itself, so a
// failure in between is mended by a retry, and a retry that finds both files answers their data; a booklet scan
// turned away for a busy process leaves the quarantine object for the next try.

const fake = vi.hoisted(() => ({ admin: null as FakeAdminClient | null }));

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => fake.admin?.client }));

const GALLERY = { purpose: 'gallery' as const };

function admin(): FakeAdminClient {
  if (!fake.admin) throw new Error('fake admin client missing');
  return fake.admin;
}

beforeEach(() => {
  fake.admin = createFakeAdminClient();
  fake.admin.addStaff(OFFICER_05);
});

describe('finalize of a gallery photo: the photo is the commit point', () => {
  it('ends with both files and the photo’s data when the write between them fails once and the officer retries', async () => {
    const upload = quarantinedIn(admin(), await jpegPhoto(2000, 1500));
    const path = publicMediaPathFor(upload, GALLERY);
    admin().failPublicMediaWrite(2);

    await expect(finalizeUpload(OFFICER_05, upload, GALLERY)).rejects.toBeDefined();
    const retry = await finalizeUpload(OFFICER_05, upload, GALLERY);

    expect(retry).toMatchObject({ ok: true, data: { path, width: 1600, height: 1200 } });
    expect([...admin().publicMedia.keys()].sort()).toEqual([path, thumbnailPathFor(path)].sort());
  });

  it('answers the data when an earlier try already published both files', async () => {
    const upload = quarantinedIn(admin(), await jpegPhoto(2000, 1500));
    const path = publicMediaPathFor(upload, GALLERY);
    const createdAt = new Date().toISOString();
    for (const published of [path, thumbnailPathFor(path)]) {
      admin().publicMedia.set(published, { bytes: Buffer.from('earlier try'), createdAt });
    }

    await expect(finalizeUpload(OFFICER_05, upload, GALLERY)).resolves.toMatchObject({
      ok: true,
      data: { path, thumbnailPath: thumbnailPathFor(path), width: 1600, height: 1200 },
    });
  });
});

describe('finalize of a booklet PDF while the process is busy scanning', () => {
  it('turns the request away and leaves the file in quarantine for a retry', async () => {
    const upload = quarantinedIn(admin(), Buffer.from(await cleanBookletPdf()));
    const releases: (() => void)[] = [];
    const busyScans = Array.from({ length: MAX_CONCURRENT_PDF_SCANS }, () =>
      withScanSlot(() => new Promise<void>((resolve) => releases.push(resolve))),
    );
    const target = { purpose: 'booklet' as const, entityId: BOOKLET_ID };

    await expect(finalizeUpload(OFFICER_05, upload, target)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    expect(admin().quarantinedFiles()).toEqual([`rw-05/${upload.objectName}`]);

    for (const release of releases) release();
    await Promise.all(busyScans);
    await expect(finalizeUpload(OFFICER_05, upload, target)).resolves.toMatchObject({ ok: true });
  });
});
