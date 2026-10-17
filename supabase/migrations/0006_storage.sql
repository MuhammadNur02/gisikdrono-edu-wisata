-- 0006_storage: the three buckets and who may touch their objects (docs/PRD.md §8.8, docs/Security.md §6.8,
-- §8.4, Task P1.5.01, P1.5.02).
--
-- uploads-quarantine takes raw admin uploads through a five-minute signed upload URL that the server binds to
-- rw-XX/<uuid> (api/uploads/sign); api/uploads/finalize reads it with the service role, re-encodes or scans the
-- file into public-media and deletes the original. No API role therefore holds any policy on it. public-media
-- is the public site's: anyone reads, and staff at AAL2 write under their own prefix only. documents holds
-- tickets, invoices, certificates, proofs and exports, and is reached only through signed URLs the server
-- mints after its own authorisation, so it has no policy for anon or authenticated either (decision of
-- 2026-10-17, which follows docs/Security.md §6.8 and §8.4 where PRD §8.8 and Task P1.5 disagreed).
--
-- Supabase allows one size limit per bucket. The quarantine takes the largest upload, a 50 MB booklet PDF;
-- api/uploads/sign holds images to 10 MB. public-media keeps only what finalize writes: WebP images and PDFs.


-- ===== Buckets (Task P1.5.01) =====

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('uploads-quarantine', 'uploads-quarantine', false, 50 * 1024 * 1024,
   array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('public-media', 'public-media', true, 50 * 1024 * 1024, array['image/webp', 'application/pdf']),
  -- Documents are written by the server alone: PDFs, proof photos and CSV or XLSX exports.
  ('documents', 'documents', false, 20 * 1024 * 1024, null)
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;


-- ===== public-media policies (Task P1.5.02, UPL-04) =====

-- Whether the signed-in staff member may write this object name: an RW admin under their RW's prefix
-- (rw-05/…, rw-08/…), the superadmin anywhere, kelurahan/… included.
create function public.storage_owner_prefix_ok(p_name text) returns boolean
  language sql stable
  set search_path = ''
as $$
  select public.is_superadmin()
      or (public.is_admin_rw() and split_part(p_name, '/', 1) = 'rw-' || lpad(public.app_rw_id()::text, 2, '0'));
$$;
revoke execute on function public.storage_owner_prefix_ok(text) from public, anon, authenticated, service_role;
grant execute on function public.storage_owner_prefix_ok(text) to authenticated;

-- Writes need AAL2, like every staff command on the tables (review of 0005, H1). An update is checked
-- before and after, so an object cannot be moved out of its prefix into another RW's.
create policy public_media_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'public-media');
create policy public_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'public-media' and (select public.aal2()) and public.storage_owner_prefix_ok(name));
create policy public_media_update on storage.objects for update to authenticated
  using (bucket_id = 'public-media' and (select public.aal2()) and public.storage_owner_prefix_ok(name))
  with check (bucket_id = 'public-media' and (select public.aal2()) and public.storage_owner_prefix_ok(name));
create policy public_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'public-media' and (select public.aal2()) and public.storage_owner_prefix_ok(name));

-- uploads-quarantine and documents: no policy for anon or authenticated, on purpose.
