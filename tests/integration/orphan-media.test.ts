import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';

import { PUBLIC_MEDIA_BUCKET } from '@/config/uploads';
import type { Database } from '@/db/types';
import { purgeMarkedFiles } from '@/server/services/storage-purge';

import { localStack, runSql, sqlText } from '../../scripts/local-stack';

// The hourly purge against the real Storage and database (Task P2.9.11, docs/Security.md R34): a photo finalize
// published that no row has shown for a day goes, while a photo a gallery row shows and a photo uploaded an hour ago
// stay. The ages are set in storage.objects, since Storage itself stamps every upload with the current time.

const GALLERY_ROW_ID = randomUUID();
const photoPath = () => `rw-05/gallery/${randomUUID()}.webp`;
const PHOTOS = {
  unusedForADay: photoPath(),
  shownByARow: photoPath(),
  justUploaded: photoPath(),
} as const;
const WEBP_BYTES = Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ', 'latin1');

const adminClient = createClient<Database>(localStack().apiUrl, localStack().serviceRoleKey, {
  auth: { persistSession: false },
});
const media = adminClient.storage.from(PUBLIC_MEDIA_BUCKET);

async function uploadPhotos(): Promise<void> {
  for (const path of Object.values(PHOTOS)) {
    const { error } = await media.upload(path, WEBP_BYTES, { contentType: 'image/webp' });
    if (error) throw error;
  }
}

async function exists(path: string): Promise<boolean> {
  const slash = path.lastIndexOf('/');
  const { data, error } = await media.list(path.slice(0, slash), { search: path.slice(slash + 1) });
  if (error) throw error;
  return data.some((entry) => entry.name === path.slice(slash + 1));
}

afterAll(async () => {
  await runSql(`delete from public.galleries where id = ${sqlText(GALLERY_ROW_ID)}`);
  await media.remove(Object.values(PHOTOS));
});

describe('api/jobs/purge-storage and unused public-media files', () => {
  it('removes a day-old photo no row shows and keeps the shown and the fresh one', async () => {
    await uploadPhotos();
    await runSql(`insert into public.galleries (id, rw_id, category, media_type, storage_path, caption, alt_text, status)
      values (${sqlText(GALLERY_ROW_ID)}, 5, 'activity', 'image', ${sqlText(PHOTOS.shownByARow)}, 'Uji', 'Uji',
        'published')`);
    await runSql(`update storage.objects set created_at = now() - interval '25 hours'
      where bucket_id = ${sqlText(PUBLIC_MEDIA_BUCKET)}
        and name in (${sqlText(PHOTOS.unusedForADay)}, ${sqlText(PHOTOS.shownByARow)})`);

    const report = await purgeMarkedFiles(adminClient);

    expect(report.failed).toBe(0);
    expect(await exists(PHOTOS.unusedForADay)).toBe(false);
    expect(await exists(PHOTOS.shownByARow)).toBe(true);
    expect(await exists(PHOTOS.justUploaded)).toBe(true);
  });
});
