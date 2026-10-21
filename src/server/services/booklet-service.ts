import 'server-only';

import type { Tables } from '@/db/types';
import { copy } from '@/lib/copy/id';
import { AppError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { bookletCoverPath, bookletPagesFolder, bookletPdfPath } from '@/lib/uploads/paths';
import type { SaveBookletValues } from '@/lib/validations/booklet';
import { toContentOwner } from '@/server/auth/content-owner';
import type { StaffContext } from '@/server/auth/guards';
import { rowOrNotFound, slugConflictOr } from '@/server/services/content-errors';
import { removeFilesOrLog } from '@/server/services/content-files';
import { readPublishedBookletFiles, removeBookletFiles } from '@/server/services/upload-service';
import type { BookletAdmin } from '@/types/cms';
import type { ContentOwner } from '@/types/content';

// Booklets through the session client, so the booklets policies (created_by = auth.uid() on insert, delete for the
// superadmin alone) and the AAL2 policy decide (0005). Every write names the owner as well as the id. Storage is read
// and emptied through upload-service.ts, the module that holds the service role.

const COLUMNS =
  'id, rw_id, kind, slug, title, description, pdf_path, cover_path, page_count, download_count, status, published_at';

type BookletRow = Pick<
  Tables<'booklets'>,
  | 'id'
  | 'rw_id'
  | 'kind'
  | 'slug'
  | 'title'
  | 'description'
  | 'pdf_path'
  | 'cover_path'
  | 'page_count'
  | 'download_count'
  | 'status'
  | 'published_at'
>;

function ownerOfRow(rwId: number | null): ContentOwner {
  const owner = toContentOwner(rwId);
  if (owner === undefined) throw new Error('booklet of an unknown RW');
  return owner;
}

function toBookletAdmin(row: BookletRow): BookletAdmin {
  return {
    id: row.id,
    owner: ownerOfRow(row.rw_id),
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    description: row.description,
    pdfPath: row.pdf_path,
    coverPath: row.cover_path,
    pageCount: row.page_count,
    downloadCount: row.download_count,
    status: row.status,
  };
}

function describedBy(values: SaveBookletValues) {
  return {
    kind: values.kind,
    slug: values.slug,
    title: values.title,
    description: values.description,
    status: values.status,
  };
}

// /e-booklet lists the newest first by published_at, so it is the moment a booklet first went live and stays so.
function publishedAtFor(
  status: SaveBookletValues['status'],
  current: string | null,
): string | null {
  if (current !== null || status !== 'published') return current;
  return new Date().toISOString();
}

export async function listBookletsForStaff(owner: ContentOwner | 'all'): Promise<BookletAdmin[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('booklets').select(COLUMNS);
  if (owner === null) query = query.is('rw_id', null);
  else if (owner !== 'all') query = query.eq('rw_id', owner);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(toBookletAdmin);
}

async function readBookletRow(id: string): Promise<BookletRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('booklets')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// The owner the database holds for a booklet this staff member can see, for the guard; undefined when RLS hides it.
export async function readBookletOwner(id: string): Promise<ContentOwner | undefined> {
  const row = await readBookletRow(id);
  return row ? ownerOfRow(row.rw_id) : undefined;
}

// The PDF must be the one uploadBooklet published for this owner and id; its pages and size are what Storage holds.
async function publishedFilesOf(ctx: StaffContext, owner: ContentOwner, values: SaveBookletValues) {
  if (values.pdfPath !== bookletPdfPath(owner, values.id)) {
    throw new AppError('VALIDATION', copy.cms.validation.booklet);
  }
  const files = await readPublishedBookletFiles(ctx, owner, values.id);
  if (!files || files.pageCount === 0)
    throw new AppError('VALIDATION', copy.cms.validation.booklet);
  return files;
}

export async function createBooklet(
  ctx: StaffContext,
  owner: ContentOwner,
  values: SaveBookletValues,
): Promise<BookletAdmin> {
  const files = await publishedFilesOf(ctx, owner, values);
  // Every column is named here; the id is the form's, the owner the action's, the files' paths follow from both.
  const row = {
    id: values.id,
    rw_id: owner,
    created_by: ctx.userId,
    pdf_path: values.pdfPath,
    cover_path: bookletCoverPath(owner, values.id),
    page_images_prefix: bookletPagesFolder(owner, values.id),
    page_count: files.pageCount,
    file_size_bytes: files.fileSizeBytes,
    published_at: publishedAtFor(values.status, null),
    ...describedBy(values),
  };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('booklets').insert(row).select(COLUMNS).single();
  if (error) throw slugConflictOr(error);
  return toBookletAdmin(data);
}

// A booklet keeps the PDF it was saved with: finalize never writes over a published file (docs/Security.md §8.4).
export async function updateBooklet(
  owner: ContentOwner,
  values: SaveBookletValues,
): Promise<BookletAdmin> {
  const current = rowOrNotFound(await readBookletRow(values.id));
  if (values.pdfPath !== current.pdf_path) {
    throw new AppError('VALIDATION', copy.cms.validation.bookletFixed);
  }
  const columns = {
    ...describedBy(values),
    published_at: publishedAtFor(values.status, current.published_at),
  };
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('booklets').update(columns).eq('id', values.id);
  query = owner === null ? query.is('rw_id', null) : query.eq('rw_id', owner);
  const { data, error } = await query.select(COLUMNS).maybeSingle();
  if (error) throw slugConflictOr(error);
  return toBookletAdmin(rowOrNotFound(data));
}

// The booklet takes its PDF and pages along (content-files.ts says in which order).
export async function removeBooklet(
  ctx: StaffContext,
  owner: ContentOwner,
  id: string,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('booklets').delete().eq('id', id);
  query = owner === null ? query.is('rw_id', null) : query.eq('rw_id', owner);
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw error;
  rowOrNotFound(data);
  return removeFilesOrLog('booklet_files', id, () => removeBookletFiles(ctx, owner, id));
}
