-- Demo content (Task P1.8.02), written by pnpm db:seed on the local stack (scripts/seed-dev.ts runs it right after
-- scripts/seed-dev.sql, in the same transaction) and, behind the explicit seed_demo input of
-- .github/workflows/staging-db.yml, on the Free-plan staging project, so the kelurahan sees a site with content
-- (docs/runbooks/staging-setup.md, part D). It writes no staff account, no Auth row and no Vault secret, and holds
-- no personal data: every name below is a place, a programme or an invented demo business. The schema has no is_demo
-- column; what is invented is marked DATA CONTOH here, and the RW texts name their source. Every statement skips
-- what is already there, so running it again changes nothing.

-- Refuses every database but a local or a staging one, read through the same allow-list as the jobs (0007_cron.sql):
-- production, an unmarked database and an unrecognised marker all stop here before anything is written.
do $$
begin
  if internal.environment() is distinct from 'local' and internal.environment() is distinct from 'staging' then
    raise exception 'demo content goes to a local or staging database only; this one is marked %',
      coalesce(internal.environment(), 'nothing') using errcode = '42501';
  end if;
end;
$$;

-- ===== Demo content (local and staging only, never in a migration) =====
-- RW 05 and RW 13 take visits; RW 08 has a profile page only until the kelurahan sets up its packages (Task
-- P2.10.03), so it gets no session templates, vendors, products or packages here.
--
-- Two kinds of content follow. The session templates, vendors, products and packages are DATA CONTOH, BUKAN DATA
-- KELURAHAN: invented names, times, capacities and prices that let the booking flow be built locally until the
-- kelurahan gives its own (docs/content/konten-situs-kelurahan.md, "Data contoh"; decision of 2026-10-22). The RW
-- profiles and activity points further down come from the kelurahan's own site and are marked by their source.

-- DATA CONTOH: sessions, times and capacity are invented.
insert into public.session_templates (rw_id, weekday, label, start_time, end_time, capacity)
select rw, weekday, label, start_time::time, end_time::time, 40
from (values (5::smallint), (13::smallint)) as rws(rw)
cross join generate_series(2, 6) as weekday
cross join (values ('Sesi Pagi', '08:30', '10:30'), ('Sesi Siang', '13:30', '15:30')) as slot(label, start_time, end_time)
on conflict do nothing;

-- DATA CONTOH: the vendors, products and prices are invented. The kelurahan's own products wait for a price, a
-- vendor and an RW (docs/content/konten-situs-kelurahan.md, "Produk UMKM").
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

-- DATA CONTOH: packages, durations and prices are invented.
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

-- The RW profiles and activity points as the kelurahan's own site describes them (gisikdrono.semarangkota.go.id
-- /zero-wastreme, /seni-budaya and /potensi, read on 2026-10-21 and 2026-10-22, not yet checked by the kelurahan),
-- retold in our own words with no numbers, prices or times; docs/content/konten-situs-kelurahan.md lists each fact
-- with its page. The awards and the guests of past study visits wait for the kelurahan's permission (request 12).

-- RW 05. A database seeded before this text holds the line the development photos gave; only that line is replaced,
-- so a profile someone wrote stays.
update public.rw_units
set description_md = 'RW 05 dulu menghadapi sampah rumah tangga yang banyak, tercampur, dan langsung dibuang ke TPA. '
      || 'Warga lalu mengelolanya dari sumbernya: sampah anorganik dipilah dan ditabung di bank sampah, sedangkan '
      || 'sampah organik diolah menjadi pakan maggot dan dikubur dengan sistem teba modern. Kini kampung ini menjadi '
      || 'tujuan wisata edukasi lingkungan di Kota Semarang, digerakkan ibu-ibu PKK, pengurus RT/RW, dan kader '
      || 'wilayah.' || chr(10) || chr(10)
      || 'Kebun TOGA dan tanaman pangan warga diolah menjadi minuman herbal untuk tamu, seperti senikir, wedang '
      || 'rosuwuh, suwun, dan kombucha buah lokal. Ibu-ibu PKK membuat tas dan pakaian dari kain perca serta miniatur '
      || 'mainan dari logam bekas.'
where id = 5
  and (description_md is null
       or description_md = 'Rombongan yang berkunjung ke RW 05 singgah di Bank Sampah Sumber Rejeki dan Taman TOGA Sumber Saras.');
insert into public.activity_points (rw_id, slug, name, point_type, short_description, sort_order, status) values
  (5, 'bank-sampah-sumber-rejeki', 'Bank Sampah Sumber Rejeki', 'bank_sampah',
   'Belajar memilah sampah dan menabung sampah yang masih bernilai.', 1, 'published'),
  (5, 'taman-toga-sumber-saras', 'Taman TOGA Sumber Saras', 'urban_farming',
   'Tanaman dalam pot dari botol plastik bekas, di bawah paranet.', 2, 'published'),
  (5, 'komposter-dan-eco-enzyme', 'Komposter dan Eco-Enzyme', 'composter',
   'Pelatihan membuat komposter dan eco-enzyme.', 3, 'published'),
  (5, 'budidaya-maggot', 'Budidaya Maggot', 'maggot', 'Sampah organik diolah menjadi pakan maggot.', 4, 'published'),
  (5, 'sistem-teba-modern', 'Sistem Teba Modern', 'other',
   'Sampah organik dikubur di lubang yang dikelola.', 5, 'published'),
  (5, 'kreasi-daur-ulang-pkk', 'Kreasi Daur Ulang PKK', 'pkk_craft',
   'Ibu-ibu PKK membuat tas dan pakaian dari kain perca, kerajinan dari plastik bekas, dan miniatur mainan dari '
   || 'logam bekas.', 6, 'published')
on conflict do nothing;
-- The Bank Sampah point was first written without a description.
update public.activity_points
set short_description = 'Belajar memilah sampah dan menabung sampah yang masih bernilai.'
where slug = 'bank-sampah-sumber-rejeki' and short_description is null;

-- RW 13. /seni-budaya names the dances and games but gives no times, so no performance schedule is written.
update public.rw_units
set description_md = 'Kampung Budaya & Seni di Jl. Jatisari, RW 13, diresmikan Wali Kota Semarang pada 26 Juni 2020. '
      || 'Warganya memegang semangat nguri-nguri budaya: tradisi Jawa dirawat dalam kegiatan sehari-hari. Di sini '
      || 'warga mementaskan Tari Golek, Tari Semarangan, dan Tari Jatilan, menghidupkan dolanan seperti gobak sodor, '
      || 'egrang, bentik, dan dakon, dan mendidik anak-anak kampung di sekolah seni.' || chr(10) || chr(10)
      || 'Kampung ini menjadi rumah Kelompok Seni Kartika Sari, binaan Disbudpar Kota Semarang, yang pernah tampil di '
      || 'puncak Dugderan, Pawai Ogoh-ogoh, dan penyambutan kapal pesiar di Pelabuhan Tanjung Emas. RW 13 juga '
      || 'dikenal sebagai Kampung Pancasila dan menjadi Pilot Project Nasional Kampung Siaga Tangguh Bencana Kebakaran.'
where id = 13 and description_md is null;
insert into public.activity_points (rw_id, slug, name, point_type, short_description, sort_order, status) values
  (13, 'pentas-tari-tradisional', 'Pentas Tari Tradisional', 'stage',
   'Pementasan Tari Golek, Tari Semarangan, dan Tari Jatilan.', 1, 'published'),
  (13, 'dolanan-anak', 'Dolanan Anak', 'dolanan_area',
   'Permainan tradisional bersama: gobak sodor, egrang, bentik, dan dakon.', 2, 'published'),
  (13, 'sekolah-seni-anak', 'Sekolah Seni Anak', 'sanggar',
   'Tempat anak-anak kampung belajar mencintai dan melestarikan keseniannya.', 3, 'published'),
  (13, 'upacara-serah-tampi-lurah', 'Upacara Serah Tampi Lurah', 'other',
   'Upacara adat turun-temurun untuk penyambutan atau pergantian lurah; dapat disaksikan bila waktunya bertepatan.',
   4, 'published'),
  (13, 'mural-dan-spot-foto', 'Mural dan Spot Foto', 'other',
   'Mural dan spot foto bernuansa Jawa di sepanjang jalan kampung.', 5, 'published'),
  (13, 'kampung-siaga-bencana-kebakaran', 'Kampung Siaga Tangguh Bencana Kebakaran', 'other',
   'Pilot Project Nasional: latihan rutin, alat pemadam api ringan, dan relawan pemadam warga yang terlatih.', 6,
   'published')
on conflict do nothing;

-- RW 08: the public service centre, Semar Cakep and Ketan Ronggolawe (/potensi).
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
-- pnpm db:seed --media <folder> (scripts/demo-media.ts) and --official-media <folder>
-- (scripts/official-media.ts); without them the pages show Foto menyusul.

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
