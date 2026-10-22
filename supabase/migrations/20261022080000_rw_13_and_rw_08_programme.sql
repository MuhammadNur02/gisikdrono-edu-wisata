-- RW 13 and RW 08's new programme (decision of 2026-10-21, Task P2.10.03). The arts programme the site has called
-- "RW 08 Kampung Seni Budaya" runs in RW 13, Jl. Jatisari, so RW 13 takes over its name, colour, schedule and
-- tagline. RW 08 stays in the edu-tourism programme as "Kampung Inklusif & Ramah Anak": the public service centre
-- with Semar Cakep and the child-friendly Ketan Ronggolawe. It starts as a profile page; its packages come later
-- through the CMS, priced by the kelurahan.

-- What still ties an RW to the programme it runs, kind by kind (independent review of PR #23, 1). Changing an RW's
-- programme is stopped by every row that would quietly start to mean something else:
-- - what a visitor booked or paid: bookings, legs, tickets, payments, ledger entries and payouts;
-- - what a visitor can still book or buy: published packages and the RW's legs of published combos, active session
--   templates, sessions from today on, products and vendors;
-- - the performance schedule;
-- - who may still edit the RW: its admins and their open invitations.
-- What only describes the RW (photos, articles, booklets, activity points, the profile text and the files under the
-- RW's folder) is reported but does not stop the change, because the new programme rewrites it in the CMS.
create function internal.rw_programme_ties(p_rw_id smallint)
  returns table (kind text, row_count bigint, is_blocking boolean)
  language sql stable
  set search_path = ''
as $$
  select tie.kind, tie.row_count, tie.is_blocking
  from (values
    ('bookings', (select count(*) from public.bookings b where p_rw_id = any (b.rw_ids)), true),
    ('booking legs', (select count(*) from public.booking_legs l where l.rw_id = p_rw_id), true),
    ('tickets', (select count(*) from public.tickets_qr t where t.rw_id = p_rw_id), true),
    ('payments', (select count(*) from public.payments p join public.bookings b on b.id = p.booking_id
                  where p_rw_id = any (b.rw_ids)), true),
    ('ledger entries', (select count(*) from public.revenue_share_entries e
                        where e.rw_id = p_rw_id or e.beneficiary_key = 'rw:' || p_rw_id), true),
    ('payout batches', (select count(*) from public.payout_batches b where b.beneficiary_key = 'rw:' || p_rw_id), true),
    ('published packages', (select count(*) from public.tour_packages t
                            where t.rw_id = p_rw_id and t.status = 'published'), true),
    ('legs of published combos', (select count(*) from public.tour_package_legs l
                                  join public.tour_packages t on t.id = l.package_id
                                  where l.rw_id = p_rw_id and t.rw_id is null and t.status = 'published'), true),
    ('active session templates', (select count(*) from public.session_templates t
                                  where t.rw_id = p_rw_id and t.is_active), true),
    ('sessions from today', (select count(*) from public.visit_sessions v
                             where v.rw_id = p_rw_id and v.session_date >= public.today_jkt()), true),
    ('products', (select count(*) from public.products_umkm p where p.rw_id = p_rw_id), true),
    ('vendors', (select count(*) from public.umkm_vendors v where v.rw_id = p_rw_id), true),
    ('performance schedules', (select count(*) from public.performance_schedules p where p.rw_id = p_rw_id), true),
    ('RW admins', (select count(*) from public.profiles p where p.rw_id = p_rw_id and p.role = 'admin_rw'), true),
    ('open admin invitations', (select count(*) from public.staff_invites i
                                where i.rw_id = p_rw_id and i.role = 'admin_rw' and i.accepted_at is null
                                  and i.revoked_at is null and i.expires_at > now()), true),
    ('gallery items', (select count(*) from public.galleries g where g.rw_id = p_rw_id), false),
    ('articles', (select count(*) from public.articles a where a.rw_id = p_rw_id), false),
    ('booklets', (select count(*) from public.booklets b where b.rw_id = p_rw_id), false),
    ('activity points', (select count(*) from public.activity_points a where a.rw_id = p_rw_id), false),
    ('profile text or photo', (select count(*) from public.rw_units u where u.id = p_rw_id
                               and (u.description_md is not null or u.vision_md is not null
                                    or u.hero_image_path is not null)), false),
    ('stored files', (select count(*) from storage.objects o
                      where o.name like internal.media_owner(p_rw_id) || '/%'), false)
  ) as tie (kind, row_count, is_blocking)
  where tie.row_count > 0;
$$;
revoke execute on function internal.rw_programme_ties(smallint) from public, anon, authenticated;

-- Stops when any blocking tie is left, naming each; reports the others as notices.
create function internal.require_rw_programme_change(p_rw_id smallint) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  blocking text;
  tie record;
begin
  select string_agg(t.kind || ' (' || t.row_count || ')', ', ' order by t.kind) into blocking
  from internal.rw_programme_ties(p_rw_id) t where t.is_blocking;
  if blocking is not null then
    raise exception 'RW % still has rows of the programme it runs: %', p_rw_id, blocking
      using errcode = 'P0001', hint = 'STATE_INVALID',
            detail = 'Move or close them by hand before the RW takes on another programme (Task P2.10.03).';
  end if;
  for tie in
    select t.kind, t.row_count from internal.rw_programme_ties(p_rw_id) t where not t.is_blocking order by t.kind
  loop
    raise notice 'RW % keeps % % of the programme it runs; rewrite them in the CMS', p_rw_id, tie.row_count, tie.kind;
  end loop;
end;
$$;
revoke execute on function internal.require_rw_programme_change(smallint) from public, anon, authenticated;

-- The arts programme is all RW 8 holds so far. No environment has such rows today (staging was never migrated and
-- production does not exist yet); a development database seeded before this change does, and is rebuilt with
-- pnpm db:reset.
select internal.require_rw_programme_change(8::smallint);

-- Whether an RW has the current default revenue-share rules for packages and add-ons it needs before it may go
-- online (docs/PRD.md §11.2: there is no global fallback). set_rw_unit_status and this migration ask the same thing.
create function internal.has_current_default_rules(p_rw_id smallint) returns boolean
  language sql stable
  set search_path = ''
as $$
  select not exists (
    select 1 from unnest(array['package_default', 'addon_default']::public.revenue_rule_scope[]) as needed(scope)
    where not exists (
      select 1 from public.revenue_share_rules r
      where r.scope = needed.scope and r.rw_id = p_rw_id and r.is_active
        and r.effective_from <= public.today_jkt()
        and (r.effective_to is null or r.effective_to >= public.today_jkt()))
  );
$$;
revoke execute on function internal.has_current_default_rules(smallint) from public, anon, authenticated;

-- The body of 20261021120000 with the rule check moved into internal.has_current_default_rules; create or replace
-- keeps the owner and the grants.
create or replace function public.set_rw_unit_status(p_rw_id smallint, p_is_active boolean) returns void
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if not public.is_superadmin() then
    raise exception 'only the superadmin takes an RW online or offline' using errcode = '42501';
  end if;
  if not internal.has_fresh_totp() then
    raise exception 'confirm with a fresh authenticator code first' using errcode = '42501';
  end if;
  if p_is_active is null then
    raise exception 'say whether the RW goes online or offline' using errcode = '22023';
  end if;
  perform 1 from public.rw_units u where u.id = p_rw_id for update;
  if not found then
    raise exception 'no RW %', p_rw_id using errcode = 'P0002';
  end if;

  if p_is_active and not internal.has_current_default_rules(p_rw_id) then
    raise exception 'RW % needs its default revenue-share rules for packages and add-ons first', p_rw_id
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  update public.rw_units set is_active = p_is_active where id = p_rw_id;
  perform internal.log_audit(case when p_is_active then 'rw_unit.activated' else 'rw_unit.deactivated' end,
    'rw_units', p_rw_id::text, '{}');
end;
$$;

-- RW 13 starts offline like every new RW, gets the default rules every RW needs before it may go online
-- (set_rw_unit_status), and then goes online. The tagline and the product heading are the arts programme's from
-- 0008_seed and 20261021130000.
insert into public.rw_units (id, code, slug, name, short_name, theme_label, tagline, accent_key, icon_key,
  schedule_enabled, products_heading, is_active, sort_order)
values (13, 'RW13', 'rw-13-kampung-budaya-seni', 'RW 13 Kampung Budaya & Seni', 'Kampung Budaya & Seni',
  'Seni & Budaya', 'Menari, bermain dolanan dan berkarya di sanggar kampung', 'terracotta', 'drama',
  true, 'Suvenir dan produk UMKM', false, 2)
on conflict (id) do nothing;

-- Assumption A4, as for RW 05 and RW 08 in 0008_seed: a package pays 20 % to the kelurahan and 80 % to the RW's
-- treasury, an add-on 90 % to the product's vendor and 10 % to the RW's treasury.
with seeded_rules as (
  insert into public.revenue_share_rules (scope, rw_id, name)
  select scope::public.revenue_rule_scope, 13, name
  from (values
    ('package_default', 'Bawaan paket RW 13'),
    ('addon_default', 'Bawaan produk tambahan RW 13')
  ) as rule(scope, name)
  where not exists (select 1 from public.revenue_share_rules r where r.scope::text = rule.scope
                    and r.rw_id = 13 and r.package_id is null and r.product_id is null)
  returning id, scope
)
insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct)
select r.id, line.beneficiary::public.revenue_beneficiary, line.rw_id, line.pct
from seeded_rules r
join (values
  ('package_default', 'kelurahan', null::smallint, 20.00),
  ('package_default', 'rw_treasury', 13::smallint, 80.00),
  ('addon_default', 'umkm_vendor', null::smallint, 90.00),
  ('addon_default', 'rw_treasury', 13::smallint, 10.00)
) as line(scope, beneficiary, rw_id, pct)
  on line.scope = r.scope::text;

-- An RW 13 that already existed is kept as it was (on conflict do nothing), so it must be this one. It goes online as
-- set_rw_unit_status would let it: only with its rules in force.
do $$
begin
  if (select u.slug from public.rw_units u where u.id = 13) is distinct from 'rw-13-kampung-budaya-seni' then
    raise exception 'RW 13 exists already with another slug; check it by hand (Task P2.10.03)';
  end if;
  if not internal.has_current_default_rules(13::smallint) then
    raise exception 'RW 13 has no current default revenue-share rules, so it stays offline (Task P2.10.03)';
  end if;
end;
$$;
update public.rw_units set is_active = true where id = 13 and not is_active;

-- RW 08's new identity. The arts tagline and product heading move to RW 13 above, so RW 08 shows none until the
-- kelurahan writes its own (go-live checklist, Appendix C #22). Its location, contacts and treasury belong to the RW
-- itself and stay; so do its default revenue-share rules, which pay RW 08's own treasury.
update public.rw_units
set slug = 'rw-08-inklusif-ramah-anak',
    name = 'RW 08 Kampung Inklusif & Ramah Anak',
    short_name = 'Kampung Inklusif & Ramah Anak',
    theme_label = 'Inklusif & Ramah Anak',
    tagline = case when tagline = 'Menari, bermain dolanan dan berkarya di sanggar kampung' then null else tagline end,
    accent_key = 'mulberry',
    icon_key = 'heart_handshake',
    schedule_enabled = false,
    products_heading = null
where id = 8;

-- The order of the menu, the home page and every list of RWs: 05, 13, 08.
update public.rw_units set sort_order = 1 where id = 5;
update public.rw_units set sort_order = 2 where id = 13;
update public.rw_units set sort_order = 3 where id = 8;

-- The default meta description named the old pair. A description someone has already rewritten stays theirs.
update public.site_settings
set value = to_jsonb('Wisata edukasi di Kelurahan Gisikdrono, Semarang Barat: kampung tanpa sampah di RW 05, seni '
                     || 'budaya di RW 13, dan kampung inklusif ramah anak di RW 08.')
where key = 'seo.default_description'
  and value = to_jsonb('Edu Wisata Kelurahan Gisikdrono, Semarang Barat: wisata edukasi tanpa sampah di RW 05 '
                       || 'Ecowastreme dan seni budaya di RW 08 Kampung Seni Budaya.');

-- Not changed here: the combo default rule of 0008_seed (rw_id NULL) still pays 40 % to the treasuries of RW 05 and
-- RW 08. Nothing allocates revenue yet; Task P3.9.04 replaces that rule with the equal split over the RWs of a
-- booking's legs before allocation exists (Task P3.9.01).
