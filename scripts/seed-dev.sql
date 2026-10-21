-- Development seed (Task P1.8.02), run by pnpm db:seed (scripts/seed-dev.ts) inside one transaction on the local
-- stack only. Reference data every environment needs lives in supabase/migrations/0008_seed.sql.
--
-- It creates staff accounts with a DEV-ONLY password and TOTP secret. Their values live in scripts/dev-accounts.ts
-- alone; seed-dev.ts hands them over as the transaction settings dev_seed.password and dev_seed.totp_secret, so
-- neither this file nor any migration holds them. Every statement skips what is already there, so running
-- pnpm db:seed again changes nothing.

-- A database pnpm db:seed reaches on 127.0.0.1 is local. The marker keeps an application job without its Vault
-- secrets quiet here (0007_cron.sql); a database marked anything else, under any spelling, refuses the seed below.
select vault.create_secret('local', 'environment')
where not exists (select 1 from vault.secrets where name = 'environment');
select internal.require_local_database();


-- ===== Development staff accounts =====
-- Complete Auth users with a verified TOTP factor, so they reach AAL2.

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token, is_sso_user, is_anonymous)
select '00000000-0000-0000-0000-000000000000', account.id::uuid, 'authenticated', 'authenticated', account.email,
       extensions.crypt(current_setting('dev_seed.password'), extensions.gen_salt('bf')), now(),
       '{"provider": "email", "providers": ["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', '', false, false
from (values
  ('0de00000-0000-4000-8000-000000000001', 'superadmin@dev.gisikdrono.test'),
  ('0de00000-0000-4000-8000-000000000005', 'admin-rw05@dev.gisikdrono.test'),
  ('0de00000-0000-4000-8000-000000000013', 'admin-rw13@dev.gisikdrono.test'),
  ('0de00000-0000-4000-8000-000000000008', 'admin-rw08@dev.gisikdrono.test')
) as account(id, email)
on conflict do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email',
       now(), now(), now()
from auth.users u where u.email like '%@dev.gisikdrono.test'
on conflict do nothing;

insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
select gen_random_uuid(), u.id, 'DEV-ONLY authenticator', 'totp', 'verified', now(), now(),
       current_setting('dev_seed.totp_secret')
from auth.users u
where u.email like '%@dev.gisikdrono.test'
  and not exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.factor_type = 'totp');

-- The system path may give a new profile its role (profiles_guard); claims_version starts at 1.
insert into public.profiles (id, email, full_name, role, rw_id, claims_version) values
  ('0de00000-0000-4000-8000-000000000001', 'superadmin@dev.gisikdrono.test', 'Superadmin Dev', 'superadmin', null, 1),
  ('0de00000-0000-4000-8000-000000000005', 'admin-rw05@dev.gisikdrono.test', 'Admin RW 05 Dev', 'admin_rw', 5, 1),
  ('0de00000-0000-4000-8000-000000000013', 'admin-rw13@dev.gisikdrono.test', 'Admin RW 13 Dev', 'admin_rw', 13, 1),
  ('0de00000-0000-4000-8000-000000000008', 'admin-rw08@dev.gisikdrono.test', 'Admin RW 08 Dev', 'admin_rw', 8, 1)
on conflict (id) do nothing;


-- ===== Demo content (local only, never in a migration) =====
-- RW 05 and RW 13 take visits; RW 08 has a profile page only until the kelurahan sets up its packages (Task
-- P2.10.03), so it gets no session templates, vendors, products or packages here.

insert into public.session_templates (rw_id, weekday, label, start_time, end_time, capacity)
select rw, weekday, label, start_time::time, end_time::time, 40
from (values (5::smallint), (13::smallint)) as rws(rw)
cross join generate_series(2, 6) as weekday
cross join (values ('Sesi Pagi', '08:30', '10:30'), ('Sesi Siang', '13:30', '15:30')) as slot(label, start_time, end_time)
on conflict do nothing;

insert into public.umkm_vendors (id, rw_id, slug, name, description_md, is_active) values
  ('0de00000-0000-4000-8000-0000000000a5', 5, 'bank-sampah-lestari', 'Bank Sampah Lestari',
   'Pengelola bank sampah dan rumah kompos RW 05.', true),
  ('0de00000-0000-4000-8000-000000000a13', 13, 'kriya-sanggar-kampung', 'Kriya Sanggar Kampung',
   'Kerajinan tangan anggota sanggar RW 13.', true)
on conflict do nothing;

insert into public.products_umkm (rw_id, vendor_id, slug, name, category, description_md, price, unit_label,
  is_addon_eligible, status) values
  (5, '0de00000-0000-4000-8000-0000000000a5', 'pupuk-kompos-1kg', 'Pupuk Kompos 1 kg', 'compost',
   'Kompos matang dari sampah organik warga.', 15000, 'kantong', true, 'published'),
  (5, '0de00000-0000-4000-8000-0000000000a5', 'bibit-cabai', 'Bibit Cabai', 'seedling',
   'Bibit cabai rawit dalam polybag.', 5000, 'polybag', true, 'published'),
  (13, '0de00000-0000-4000-8000-000000000a13', 'gantungan-kunci-batik', 'Gantungan Kunci Batik', 'souvenir',
   'Gantungan kunci kain batik buatan anak sanggar.', 20000, 'buah', true, 'published')
on conflict do nothing;

insert into public.tour_packages (id, rw_id, category, slug, name, tagline, duration_minutes, price_per_pax, status)
values
  ('0de00000-0000-4000-8000-0000000000c5', 5, 'student', 'paket-eduwisata-ecowastreme', 'Eduwisata Ecowastreme',
   'Memilah sampah, mengompos dan budidaya maggot', 120, 35000, 'published'),
  ('0de00000-0000-4000-8000-000000000c13', 13, 'student', 'paket-eduwisata-seni-budaya', 'Eduwisata Seni Budaya',
   'Menari, membatik dan bermain dolanan', 120, 40000, 'published')
on conflict do nothing;
-- A combo is published only once it has both legs.
insert into public.tour_packages (id, category, slug, name, tagline, duration_minutes, price_per_pax, status) values
  ('0de00000-0000-4000-8000-0000000000c9', 'combo', 'paket-kombinasi-gisikdrono', 'Paket Kombinasi Gisikdrono',
   'Satu hari di dua kampung edukasi', 240, 70000, 'draft')
on conflict do nothing;
insert into public.tour_package_legs (package_id, rw_id, leg_order) values
  ('0de00000-0000-4000-8000-0000000000c9', 5, 1), ('0de00000-0000-4000-8000-0000000000c9', 13, 2)
on conflict do nothing;
update public.tour_packages set status = 'published'
where id = '0de00000-0000-4000-8000-0000000000c9' and status = 'draft';

-- The home page features what the kelurahan marks is_featured (FR-PUB-04, Task P2.4.01): here the two RW
-- packages and one product of each RW.
update public.tour_packages set is_featured = true
where id in ('0de00000-0000-4000-8000-0000000000c5', '0de00000-0000-4000-8000-000000000c13') and not is_featured;
update public.products_umkm set is_featured = true
where slug in ('pupuk-kompos-1kg', 'gantungan-kunci-batik') and not is_featured;

-- RW 05 as the development photos show it (decision of 2026-10-18): the two places named on the signs in
-- them, nothing more. RW 13 has no photos yet, so its profile, vision and points stay empty and its page leaves
-- those sections out.
update public.rw_units
set description_md = 'Rombongan yang berkunjung ke RW 05 singgah di Bank Sampah Sumber Rejeki dan Taman TOGA Sumber Saras.'
where id = 5 and description_md is null;
insert into public.activity_points (rw_id, slug, name, point_type, short_description, sort_order, status) values
  (5, 'bank-sampah-sumber-rejeki', 'Bank Sampah Sumber Rejeki', 'bank_sampah', null, 1, 'published'),
  (5, 'taman-toga-sumber-saras', 'Taman TOGA Sumber Saras', 'urban_farming',
   'Tanaman dalam pot dari botol plastik bekas, di bawah paranet.', 2, 'published')
on conflict do nothing;

-- RW 08 as the kelurahan's own site describes it (gisikdrono.semarangkota.go.id, read on 2026-10-21, not yet
-- checked by the kelurahan): the public service centre, Semar Cakep and Ketan Ronggolawe, retold in our own words,
-- with no numbers or prices.
update public.rw_units
set tagline = 'Layanan publik yang inklusif dan ruang bermain yang aman bagi anak',
    description_md = 'RW 08 adalah pusat pelayanan publik Kelurahan Gisikdrono: Kantor Kecamatan Semarang Barat, '
      || 'Polsek, dan Koramil ada di sini. Di RW ini pula lahir Semar Cakep, singkatan dari Semarang Barat Cinta '
      || 'Kelompok Rentan & Penyandang Disabilitas, layanan publik yang dirancang inklusif, lengkap dengan Rumah '
      || 'Pemberdayaan Semar Cakep.' || chr(10) || chr(10)
      || 'Lewat program Ketan Ronggolawe, balai warga RW 08 dijadikan tempat anak-anak bermain dan belajar dengan '
      || 'aman: membaca bersama, permainan tradisional, dan pendampingan relawan warga. Program ini menjadikan '
      || 'RW 08 contoh Kampung Ramah Anak di Kota Semarang.'
where id = 8 and tagline is null and description_md is null;
insert into public.activity_points (rw_id, slug, name, point_type, short_description, sort_order, status) values
  (8, 'rumah-pemberdayaan-semar-cakep', 'Rumah Pemberdayaan Semar Cakep', 'inclusion_center',
   'Layanan pemberdayaan bagi kelompok rentan dan penyandang disabilitas.', 1, 'published'),
  (8, 'ketan-ronggolawe', 'Ketan Ronggolawe', 'child_friendly_space',
   'Balai warga tempat anak bermain dan belajar, didampingi relawan warga.', 2, 'published')
on conflict do nothing;

-- Gallery photos and the hero banner need real files in public-media, so they come only from
-- pnpm db:seed --media <folder> (scripts/demo-media.ts); without it the pages show Foto menyusul.

-- Two demo articles that exercise the RichText allowlist (Task P2.4.09) and invent nothing (StyleGuide §1.3 G5):
-- the RW 05 one says only what the development photos and their signs show, the kelurahan one restates the
-- booking flow of docs/PRD.md and the payment line of docs/StyleGuide.md §9.2. pnpm db:seed --media gives the
-- RW 05 article its cover and a captioned photo (scripts/demo-media.ts).
insert into public.articles (rw_id, slug, title, excerpt, body_json, category, status, published_at) values
  (5, 'bank-sampah-dan-taman-toga-rw-05', 'Singgah di Bank Sampah Sumber Rejeki dan Taman TOGA Sumber Saras',
   'Dua tempat yang disinggahi rombongan di RW 05, seperti yang terlihat di foto kunjungan.',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Rombongan yang berkunjung ke RW 05 singgah di dua tempat: "},{"type":"text","text":"Bank Sampah Sumber Rejeki","marks":[{"type":"bold"}]},{"type":"text","text":" dan "},{"type":"text","text":"Taman TOGA Sumber Saras","marks":[{"type":"bold"}]},{"type":"text","text":". Nama keduanya tertulis di papan dan spanduk yang terlihat di foto kunjungan."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Taman TOGA Sumber Saras"}]},{"type":"paragraph","content":[{"type":"text","text":"Tanaman di Taman TOGA tumbuh dalam pot dari botol plastik bekas, di bawah paranet. Rombongan berjalan menyusuri tanaman itu, lalu berfoto bersama warga di depan papan namanya."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Bank Sampah Sumber Rejeki"}]},{"type":"paragraph","content":[{"type":"text","text":"Di depan spanduk Bank Sampah Sumber Rejeki, peserta duduk mendengarkan pemaparan dari seorang pembicara bermikrofon."}]}]}',
   'news', 'published', now()),
  (null, 'cara-memesan-kunjungan', 'Cara memesan kunjungan edukasi',
   'Langkah memesan kunjungan rombongan ke kampung-kampung edukasi Gisikdrono lewat situs ini.',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Kunjungan ke kampung-kampung edukasi Gisikdrono dipesan lewat situs ini, tanpa membuat akun."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Langkah memesan"}]},{"type":"orderedList","attrs":{"start":1},"content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Pilih paket di halaman "},{"type":"text","text":"Paket Wisata","marks":[{"type":"italic"}]},{"type":"text","text":"."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Pilih tanggal dan sesi kunjungan."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Isi data penanggung jawab rombongan, lalu verifikasi nomor WhatsApp dengan kode OTP."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Bayar lewat QRIS atau Virtual Account."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Tiket QR dikirim ke WhatsApp dan email penanggung jawab."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Saat hari kunjungan"}]},{"type":"paragraph","content":[{"type":"text","text":"Tunjukkan tiket QR kepada petugas di lokasi."}]},{"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Pembayaran hanya melalui sistem (QRIS/VA); kelurahan tidak pernah meminta transfer ke rekening pribadi."}]}]}]}',
   'announcement', 'published', now() - interval '1 day')
on conflict do nothing;

-- E-booklets need a real PDF and its pages in public-media, so the one demo booklet comes only from
-- pnpm db:seed --media <folder> (scripts/demo-booklet.ts); without it /e-booklet keeps its header alone.

-- Plan the demo sessions now rather than at the next midnight job.
select internal.run_scheduled_job('generate_visit_sessions');
