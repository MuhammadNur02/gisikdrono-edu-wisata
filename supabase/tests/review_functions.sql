-- Task P4.11.01 (docs/PRD.md FR-POST-05, FR-POST-06; GUEST-05, GUEST-09): a visitor's review. It needs a visit that
-- was checked in, takes the booking's RWs and institution, waits as pending, and comes once per booking; only the server
-- sends it; a featured review is a published one; moderation needs the superadmin at AAL2.
begin;
select plan(17);
\ir helpers/rls_personas.psql
-- Since 20261026090000 validate_ticket and check_in_ticket are scan_ticket's alone (review of PR #54, M1); this suite
-- calls them as the officers, so it lends them out inside its own transaction.
grant execute on function public.validate_ticket(uuid, uuid, text, jsonb, text),
  public.check_in_ticket(uuid, uuid, integer, text, jsonb, boolean, text, text, text) to authenticated;
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures: one visit checked in, one paid and still ahead =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000e1001', 5, 'regular', 'uji-ulasan-05', 'Paket Uji Ulasan', 'per_pax', 25000,
   'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000e2051', 5, public.today_jkt() + 11, '11:17', '12:17', 'Uji ulasan 05', 200);

create function pg_temp.otp(p_phone text) returns uuid
  language sql
as $$
  insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at, verified_at, created_at)
  values ('booking_phone', p_phone, repeat('a', 64), repeat('b', 64), now() + interval '5 minutes',
          now() - interval '1 minute', now() - interval '2 minutes')
  returning id;
$$;

-- A booking held, paid by a confirmed settlement and given its ticket, whose gate opens now.
create function pg_temp.paid(p_phone text) returns uuid
  language plpgsql
as $$
declare
  held uuid;
  attempt jsonb;
  answer jsonb;
begin
  held := (internal.create_booking('00000000-0000-4000-8000-0000000e1001',
    array['00000000-0000-4000-8000-0000000e2051']::uuid[], 10,
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SMP Negeri Ulasan', 'pic_name', 'Ani Ulasan',
                       'pic_phone', p_phone, 'pic_email', 'ulasan' || right(p_phone, 4) || '@contoh.test',
                       'notes', null),
    '[]', '[]', 'pay', 'web', null, pg_temp.otp(p_phone), '{"version": "2026-10-18"}', null,
    '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000e1001', 10, '[]',
                                                       array[5]::smallint[]))) ->> 'booking_id')::uuid;
  attempt := internal.create_payment_attempt(held, null, null);
  perform internal.attach_snap_token((attempt ->> 'payment_id')::uuid, 'token-' || (attempt ->> 'order_id'),
    'https://app.sandbox.midtrans.com/snap/v4/redirection/' || (attempt ->> 'order_id'));
  answer := jsonb_build_object('order_id', attempt ->> 'order_id', 'status_code', '200',
    'gross_amount', (select b.total_amount from public.bookings b where b.id = held) || '.00',
    'signature_key', repeat('a', 128), 'transaction_status', 'settlement',
    'transaction_id', 'txn-' || (attempt ->> 'order_id'), 'payment_type', 'qris', 'currency', 'IDR',
    'fraud_status', 'accept', 'settlement_time', to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'));
  perform internal.apply_payment_event((internal.record_payment_event('webhook',
    encode(sha256(convert_to(answer::text, 'UTF8')), 'hex'), answer) ->> 'event_id')::bigint, 'webhook', answer, 'k1');
  update public.tickets_qr
  set valid_on = public.today_jkt(), valid_from = now() - interval '1 hour', valid_until = now() + interval '1 hour'
  where booking_id = held;
  return held;
end;
$$;

create temporary table visits on commit drop as
  select pg_temp.paid('+6281300004001') as visited, pg_temp.paid('+6281300004002') as ahead;
create temporary table submitted (id uuid) on commit drop;
grant select on visits to authenticated, service_role;
grant insert on submitted to service_role;
select pg_temp.act_as('admin_rw_05');
select public.check_in_ticket((select t.id from public.tickets_qr t where t.booking_id = (select visited from visits)),
                              '00000000-0000-4000-8000-0000000ee001', 10, p_raw => 'GSK.k1.visited');
reset role;

-- ===== submit_review =====
select throws_ok($$select internal.submit_review((select ahead from visits), 5, null,
                    'Kunjungan yang sangat menyenangkan.', 'Bu Ani', false)$$,
  'P0001', null, 'a visit nobody checked in into cannot be reviewed');
set local role service_role;
insert into submitted
  select public.svc_submit_review((select visited from visits), 5, '  Seru sekali  ',
                                  '  Anak-anak belajar memilah sampah.  ', ' Bu Ani ', false);
reset role;
select is((select (r.booking_id, r.rw_ids, r.rating, r.title, r.body, r.reviewer_name, r.institution_name,
                   r.is_anonymous, r.status::text, r.is_featured)::text
           from public.reviews r where r.id = (select id from submitted)),
  ((select visited from visits), '{5}'::smallint[], 5::smallint, 'Seru sekali', 'Anak-anak belajar memilah sampah.',
   'Bu Ani', 'SMP Negeri Ulasan', false, 'pending', false)::text,
  'the server sends a review: trimmed, pending, with the booking''s RWs and institution');
select is((select a.actor_role from public.audit_logs a
           where a.entity_type = 'reviews' and a.entity_id = (select id from submitted)::text and a.action = 'reviews.insert'),
  'visitor', 'and its audit row names the visitor');
select throws_ok($$select internal.submit_review((select visited from visits), 4, null,
                    'Ingin datang lagi tahun depan.', 'Pak Budi', true)$$,
  '23505', null, 'a booking is reviewed once');
select throws_ok($$select internal.submit_review((select ahead from visits) , 6, null,
                    'Kunjungan yang sangat menyenangkan.', 'Bu Ani', false)$$,
  'P0001', null, 'the visit is checked before the form');
select throws_ok($$select internal.submit_review('00000000-0000-4000-8000-0000000e9999', 5, null,
                    'Kunjungan yang sangat menyenangkan.', 'Bu Ani', false)$$,
  'P0002', null, 'a booking that does not exist is refused');

-- Only the server sends a review; the CHECKs hold the form's limits for any caller.
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select internal.submit_review((select visited from visits), 5, null, 'Bagus sekali.', 'Bu Ani',
                    false)$$, '42501', null, 'staff cannot call submit_review');
reset role;
select ok(not has_function_privilege('authenticated', 'public.svc_submit_review(uuid, integer, text, text, text, boolean)',
                                     'execute')
          and not has_function_privilege('anon', 'public.svc_submit_review(uuid, integer, text, text, text, boolean)',
                                         'execute')
          and has_function_privilege('service_role',
                                     'public.svc_submit_review(uuid, integer, text, text, text, boolean)', 'execute'),
  'svc_submit_review is the service role''s alone');
delete from public.reviews where id = (select id from submitted);
select throws_ok($$select internal.submit_review((select visited from visits), 0, null,
                    'Kunjungan yang sangat menyenangkan.', 'Bu Ani', false)$$,
  '23514', null, 'a rating is 1 to 5');
select throws_ok($$select internal.submit_review((select visited from visits), 5, null, 'Bagus.', 'Bu Ani', false)$$,
  '23514', null, 'a body has at least 10 characters');
create temporary table resubmitted on commit drop as
  select internal.submit_review((select visited from visits), 4, null, 'Ingin datang lagi tahun depan.', 'Pak Budi',
                                true) as id;
grant select on resubmitted to authenticated;

-- ===== Moderation =====
select throws_ok($$update public.reviews set is_featured = true where id = (select id from resubmitted)$$,
  '23514', null, 'a pending review cannot be featured');
select pg_temp.act_as('superadmin_aal1');
select is(pg_temp.row_count($$update public.reviews set status = 'published' where id = (select id from resubmitted)$$),
  0, 'the superadmin without the authenticator moderates nothing (reviews_aal2)');
reset role;
select pg_temp.act_as('admin_rw_05');
select is(pg_temp.row_count($$update public.reviews set status = 'published' where id = (select id from resubmitted)$$),
  0, 'nor does an RW officer');
reset role;
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.row_count($$update public.reviews set status = 'published', is_featured = true
                              where id = (select id from resubmitted)$$),
  1, 'the superadmin at AAL2 publishes and features it');
select throws_ok($$update public.reviews set status = 'rejected' where id = (select id from resubmitted)$$,
  '23514', null, 'and must take a featured review off the home page before rejecting it');
reset role;
select is((select (r.status::text, r.is_featured, r.moderated_by)::text from public.reviews r
           where r.id = (select id from resubmitted)),
  ('published', true, pg_temp.persona_id('superadmin_aal2'))::text, 'the decision records who made it');
select is((select count(*)::int from public.reviews r where r.booking_id = (select visited from visits)), 1,
  'and the booking still has one review');

select * from finish();
rollback;
