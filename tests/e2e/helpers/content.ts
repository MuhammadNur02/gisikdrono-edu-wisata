import { z } from 'zod';

import { localStack, runSql, sqlText } from '../../../scripts/local-stack';

const PUBLIC_MEDIA_BUCKET = 'public-media';

const removedBooklet = z.object({ id: z.uuid(), folder: z.string() });

// The public address of a public-media file, as the public site links it.
export function publicMediaUrl(path: string): string {
  return `${localStack().apiUrl}/storage/v1/object/public/${PUBLIC_MEDIA_BUCKET}/${path}`;
}

async function storageCall(path: string, init: RequestInit): Promise<Response> {
  const { apiUrl, serviceRoleKey } = localStack();
  return fetch(`${apiUrl}/storage/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
  });
}

async function removeBookletFiles(folder: string): Promise<void> {
  const listing = await storageCall(`object/list/${PUBLIC_MEDIA_BUCKET}`, {
    method: 'POST',
    body: JSON.stringify({ prefix: folder, limit: 200 }),
  });
  const pages = z.array(z.object({ name: z.string() })).parse(await listing.json());
  const bookletFolder = folder.replace(/\/pages$/, '');
  const prefixes = [
    `${bookletFolder}/booklet.pdf`,
    ...pages.map((page) => `${folder}/${page.name}`),
  ];
  await storageCall(`object/${PUBLIC_MEDIA_BUCKET}`, {
    method: 'DELETE',
    body: JSON.stringify({ prefixes }),
  });
}

// Whatever booklets a test left behind, rows and files: the rows through SQL, the files through the Storage API,
// since Supabase refuses a delete from storage.objects.
export async function removeBookletsTitled(titlePrefix: string): Promise<void> {
  const rows = z.array(removedBooklet).parse(
    await runSql(`delete from public.booklets where title like ${sqlText(`${titlePrefix}%`)}
      returning id, page_images_prefix as folder`),
  );
  for (const row of rows) await removeBookletFiles(row.folder);
}

export async function readBookletPdfPath(title: string): Promise<string> {
  const rows = z
    .array(z.object({ pdf_path: z.string() }))
    .parse(await runSql(`select pdf_path from public.booklets where title = ${sqlText(title)}`));
  const [row] = rows;
  if (!row) throw new Error(`no booklet titled ${title}`);
  return row.pdf_path;
}

// Articles a test saved; their folders hold no photos, since the tests upload none.
export async function removeArticlesTitled(titlePrefix: string): Promise<void> {
  await runSql(`delete from public.articles where title like ${sqlText(`${titlePrefix}%`)}`);
}
