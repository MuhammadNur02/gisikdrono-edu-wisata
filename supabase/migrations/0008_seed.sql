-- 0008_seed: reference data every environment needs (docs/PRD.md §8.6, assumption A4, Task P1.8.01; decisions of
-- 2026-10-17). Demo content and development accounts live in supabase/seed.sql, which runs on a developer's
-- database only.
--
-- The kelurahan has not confirmed every value yet (Task P0.4.05). Where a value is unknown the seed writes a
-- placeholder that cannot pass for the real thing, and internal.placeholder_site_settings lists them: production's
-- /api/health answers 503 while any is left (Task P3.11.07) and the go-live checklist requires it to be empty.
-- Existing rows are kept, so a value someone already corrected is never overwritten.


-- ===== RWs =====

insert into public.rw_units (id, code, slug, name, theme_label, tagline, sort_order) values
  (5, 'RW05', 'rw-05-ecowastreme', 'RW 05 Ecowastreme', 'Ekowisata & Lingkungan',
   'Belajar memilah, mengompos dan menanam di kampung tanpa sampah', 1),
  (8, 'RW08', 'rw-08-kampung-seni-budaya', 'RW 08 Kampung Seni Budaya', 'Seni & Budaya',
   'Menari, bermain dolanan dan berkarya di sanggar kampung', 2)
on conflict (id) do nothing;


-- ===== Settings (docs/PRD.md §8.6) =====

insert into public.site_settings (key, value, is_public, description) values
  ('booking_enabled', 'true', true, 'Wizard pemesanan dibuka'),
  ('whatsapp_enabled', 'true', false, 'Kanal WhatsApp dipakai worker outbox'),
  ('email_enabled', 'true', false, 'Kanal email dipakai worker outbox'),
  ('maintenance_mode', 'false', true, 'Pemberitahuan pemeliharaan; pemesanan ditutup'),
  ('rate_limit_profile', '"normal"', false, 'normal atau strict'),
  ('checkin.grace_before_minutes', '60', false, 'Menit sebelum sesi tiket boleh dipindai'),
  ('checkin.grace_after_minutes', '120', false, 'Menit sesudah sesi tiket masih boleh dipindai'),
  ('booking.hold_minutes_individual', '120', false, 'Lama tahan kuota pemesan perorangan'),
  ('booking.hold_hours_institution', '24', false, 'Lama tahan kuota pemesan lembaga'),
  ('booking.quotation_valid_days', '14', false, 'Masa berlaku surat penawaran'),
  ('booking.min_lead_hours', '12', true, 'Jarak minimal pemesanan sebelum kunjungan'),
  ('booking.max_advance_days', '180', true, 'Jarak maksimal pemesanan ke depan'),
  ('booking.max_pax', '500', true, 'Jumlah peserta maksimal per pemesanan'),
  ('pricing.min_price_per_pax', '5000', false, 'Harga minimal per peserta'),
  ('pii_retention_months', '24', false, 'Lama data kontak pemesan disimpan'),
  ('finance.expected_payout_account_masked', '"BCA ****1234"', false, 'Rekening pencairan Midtrans yang diharapkan'),
  ('contact.whatsapp_number', '"+620000000000"', true, 'Nomor WhatsApp kontak publik'),
  ('contact.email', '"kontak@example.invalid"', true, 'Email kontak publik'),
  ('kelurahan.address', '"Kelurahan Gisikdrono, Kecamatan Semarang Barat, Kota Semarang, Jawa Tengah"', true,
   'Alamat kantor kelurahan'),
  ('kelurahan.signatory_name', '"[Nama Lurah Gisikdrono]"', false, 'Nama penanda tangan dokumen'),
  ('kelurahan.signatory_title', '"Lurah Gisikdrono"', false, 'Jabatan penanda tangan dokumen'),
  ('certificate.template_version', '1', false, 'Versi tata letak sertifikat'),
  ('seo.default_description',
   '"Edu Wisata Kelurahan Gisikdrono, Semarang Barat: wisata edukasi tanpa sampah di RW 05 Ecowastreme dan seni budaya di RW 08 Kampung Seni Budaya."',
   true, 'Deskripsi meta bawaan')
on conflict (key) do nothing;

-- The settings still holding a seeded placeholder: an example.invalid address, an all-zero phone number, fill-in
-- text in brackets, or the example payout account of docs/PRD.md §8.6.
create function internal.placeholder_site_settings() returns setof text
  language sql stable security definer
  set search_path = ''
as $$
  select s.key from public.site_settings s
  where s.value #>> '{}' ~* 'example\.invalid'
     or s.value #>> '{}' ~ '^\+620+$'
     or s.value #>> '{}' ~ '^\[.*\]$'
     or s.value #>> '{}' = 'BCA ****1234'
  order by s.key;
$$;

-- What production's /api/health reads (Task P3.11.07).
create function public.svc_placeholder_site_settings() returns setof text
  language sql stable security definer
  set search_path = ''
as $$ select * from internal.placeholder_site_settings(); $$;


-- ===== Revenue-share defaults (assumption A4) =====
-- A package splits 20 % to the kelurahan and 80 % to its RW's treasury; an add-on 90 % to the product's vendor
-- (vendor_id NULL) and 10 % to its RW's treasury; a combo, whose default rule has no RW, 20 % to the kelurahan and
-- 40 % to each RW's treasury.

with seeded_rules as (
  insert into public.revenue_share_rules (scope, rw_id, name)
  select scope::public.revenue_rule_scope, rw_id, name
  from (values
    ('package_default', 5::smallint, 'Bawaan paket RW 05'),
    ('package_default', 8::smallint, 'Bawaan paket RW 08'),
    ('addon_default', 5::smallint, 'Bawaan produk tambahan RW 05'),
    ('addon_default', 8::smallint, 'Bawaan produk tambahan RW 08'),
    ('package_default', null::smallint, 'Bawaan paket kombinasi')
  ) as rule(scope, rw_id, name)
  where not exists (select 1 from public.revenue_share_rules r where r.scope::text = rule.scope
                    and r.rw_id is not distinct from rule.rw_id and r.package_id is null and r.product_id is null)
  returning id, scope, rw_id
)
insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct)
select r.id, line.beneficiary::public.revenue_beneficiary, line.rw_id, line.pct
from seeded_rules r
join (values
  ('package_default', 5::smallint, 'kelurahan', null::smallint, 20.00),
  ('package_default', 5::smallint, 'rw_treasury', 5::smallint, 80.00),
  ('package_default', 8::smallint, 'kelurahan', null::smallint, 20.00),
  ('package_default', 8::smallint, 'rw_treasury', 8::smallint, 80.00),
  ('addon_default', 5::smallint, 'umkm_vendor', null::smallint, 90.00),
  ('addon_default', 5::smallint, 'rw_treasury', 5::smallint, 10.00),
  ('addon_default', 8::smallint, 'umkm_vendor', null::smallint, 90.00),
  ('addon_default', 8::smallint, 'rw_treasury', 8::smallint, 10.00),
  ('package_default', null::smallint, 'kelurahan', null::smallint, 20.00),
  ('package_default', null::smallint, 'rw_treasury', 5::smallint, 40.00),
  ('package_default', null::smallint, 'rw_treasury', 8::smallint, 40.00)
) as line(scope, rule_rw_id, beneficiary, rw_id, pct)
  on line.scope = r.scope::text and line.rule_rw_id is not distinct from r.rw_id;


-- ===== Development seed guard (Task P1.8.02) =====
-- supabase/seed.sql creates staff accounts whose password and TOTP secret are written in the repository. It calls
-- this first, so it stops before writing anything on a database whose Vault secret environment says it is online.
create function internal.require_development_database() returns void
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if internal.environment() in ('staging', 'production') then
    raise exception 'supabase/seed.sql never runs on the % database: it creates development accounts with known passwords',
      internal.environment() using errcode = '42501';
  end if;
end;
$$;

revoke execute on function internal.placeholder_site_settings(), internal.require_development_database()
  from public, anon, authenticated, service_role;
revoke execute on function public.svc_placeholder_site_settings() from public, anon, authenticated;
grant execute on function public.svc_placeholder_site_settings() to service_role;
