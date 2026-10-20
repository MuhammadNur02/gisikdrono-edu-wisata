-- A form of the CMS names the id of a new article, booklet or activity point itself (Task P2.9.06): their files go
-- into a folder of that row's own (src/lib/uploads/paths.ts, an entity purpose), and a booklet's PDF and pages must
-- be published before the row can be saved, because booklets.pdf_path is NOT NULL. So staff may write the id of a
-- new row; they still cannot change it afterwards, since no update grant names it, and the policies of 0005 decide
-- as before which RW the row may belong to. A fresh id per attempt is also what lets an officer start a booklet
-- again after a broken upload (docs/Security.md R20).
grant insert (id) on public.articles, public.booklets, public.activity_points to authenticated;
