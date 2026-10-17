-- 0006_storage: the three buckets (docs/PRD.md §8.8, docs/Security.md §6.8, §8.4, Task P1.5.01, P1.5.02; decisions
-- of 2026-10-17 and of the security review of PR #5).
--
-- No API role holds any policy on storage.objects. Every write goes through the server:
-- - uploads-quarantine takes raw admin uploads through a five-minute signed upload URL that api/uploads/sign binds
--   to rw-XX/<uuid> after its own requireRwAccess;
-- - api/uploads/finalize, with the service role, re-encodes or scans the file into public-media and deletes the
--   original, so finalize is the only writer of public-media and nothing reaches the public site with its EXIF,
--   GPS position or active PDF content intact (UPL-02, UPL-05);
-- - documents holds tickets, invoices, certificates, proofs and exports, reached only through the signed URLs that
--   createDocumentSignedUrl mints after the server's own authorisation.
-- public-media is a public bucket, so the site and anyone else download its files by URL without a policy; with no
-- SELECT policy nobody can list it, so a draft's files cannot be found by browsing the bucket.
--
-- Supabase allows one size limit per bucket. The quarantine takes the largest upload, a 50 MB booklet PDF;
-- api/uploads/sign holds images to 10 MB. public-media keeps only what finalize writes: WebP images and PDFs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('uploads-quarantine', 'uploads-quarantine', false, 50 * 1024 * 1024,
   array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('public-media', 'public-media', true, 50 * 1024 * 1024, array['image/webp', 'application/pdf']),
  -- PDFs, photographed payment proofs and the CSV or XLSX exports.
  ('documents', 'documents', false, 20 * 1024 * 1024,
   array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/csv',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
