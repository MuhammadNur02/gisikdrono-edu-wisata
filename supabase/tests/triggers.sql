-- The guard triggers, each tried the way a careless or hostile writer would (Task P1.9.03; docs/Security.md REC-03,
-- REC-04, WH-12, AZ-04, AZ-15, AUTH-08). Runs as postgres, the owner, unless a check acts as an API role, so a
-- trigger is the only thing standing between each write and the table.
begin;
select plan(39);
\ir helpers/rls_personas.psql

-- Whether a statement goes through, or the SQLSTATE that stopped it. Each try runs in its own subtransaction.
create function pg_temp.outcome(p_statement text) returns text
  language plpgsql
as $$
begin
  execute p_statement;
  return 'allowed';
exception when others then
  return sqlstate;
end;
$$;

-- ===== Fixtures =====
create temp table audit_start as select coalesce(max(id), 0) as id from public.audit_logs;
insert into public.tour_packages (id, rw_id, category, slug, name, tagline, duration_minutes, price_per_pax, status)
values ('00000000-0000-4000-9000-000000000301', 5, 'student', 'uji-pemicu-paket', 'Paket Uji Pemicu', 'Uji', 120, 25000,
        'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-9000-000000000311', 5, public.today_jkt() + 40, '05:13', '06:00', 'Uji Pemicu', 10),
  ('00000000-0000-4000-9000-000000000312', 5, public.today_jkt() + 41, '05:13', '06:00', 'Uji Kosong', 10);
select set_config('app.in_rpc', '1', true);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount, amount_paid,
  consent_version, consented_at, paid_at)
values
  ('00000000-0000-4000-9000-000000000321', 'GSK-TR1GGR01', 'quoted', '00000000-0000-4000-9000-000000000301', '{}',
   '{5}', 'school', 'Bu Sari', '+6281234560321', 'sari@example.test', 4, public.today_jkt() + 40,
   public.today_jkt() + 40, 100000, 100000, 0, 'v1', now(), null),
  ('00000000-0000-4000-9000-000000000322', 'GSK-TR1GGR02', 'paid', '00000000-0000-4000-9000-000000000301', '{}',
   '{5}', 'school', 'Pak Dodi', '+6281234560322', 'dodi@example.test', 4, public.today_jkt() + 40,
   public.today_jkt() + 40, 100000, 100000, 100000, 'v1', now(), now());
insert into public.booking_legs (id, booking_id, rw_id, visit_session_id, leg_order, pax_count, status, quota_reserved_at)
values
  ('00000000-0000-4000-9000-000000000331', '00000000-0000-4000-9000-000000000321', 5,
   '00000000-0000-4000-9000-000000000311', 1, 4, 'unreserved', null),
  ('00000000-0000-4000-9000-000000000332', '00000000-0000-4000-9000-000000000322', 5,
   '00000000-0000-4000-9000-000000000311', 1, 4, 'reserved', now());
select internal.reserve_session_quota('00000000-0000-4000-9000-000000000311', 4);
insert into public.payments (id, booking_id, attempt_no, provider, order_id, gross_amount, status, method) values
  ('00000000-0000-4000-9000-000000000341', '00000000-0000-4000-9000-000000000322', 1, 'midtrans', 'GSK-TR1GGR02-01',
   100000, 'settled', 'qris');
select set_config('app.in_rpc', '', true);

-- One row in every log, so each refusal below is the trigger's and not an empty table's.
insert into public.booking_events (booking_id, to_status, actor_type)
values ('00000000-0000-4000-9000-000000000321', 'quoted', 'visitor');
insert into public.payment_events (order_id, source, event_hash, payload)
values ('GSK-TR1GGR02-01', 'webhook', 'uji-pemicu-event', '{"transaction_status": "settlement"}');
insert into public.webhook_rejections (provider, reason, received_at) values ('resend', 'schema_invalid', '2001-02-03 04:05:06+00');
insert into public.ticket_scans (attempt_id, rw_id, scanned_by, phase, result)
values ('00000000-0000-4000-9000-000000000351', 5, '00000000-0000-4000-8000-00000000f005', 'validate', 'not_found');
insert into public.revenue_share_entries (booking_id, entry_type, line_ref, rule_version, beneficiary, beneficiary_key,
  rw_id, base_amount, pct, amount)
values ('00000000-0000-4000-9000-000000000322', 'settlement', 'package', '{"lines": 1}', 'rw_treasury', 'rw:5', 5,
        100000, 100, 100000);
insert into public.security_events (event_type, entity_id) values ('rate_limited', 'uji-pemicu');
-- A price change is what writes package_price_history.
update public.tour_packages set price_per_pax = 30000 where id = '00000000-0000-4000-9000-000000000301';
insert into public.login_attempts (success, reason, attempted_at) values (false, 'bad_password', '2001-02-03 04:05:06+00');
-- Adjustments are written by their RPCs (20261101080200); the fixture stands in for one.
select set_config('app.in_rpc', '1', true);
insert into public.payment_adjustments (id, booking_id, type, amount, reason, evidence_path, proposed_by)
values ('00000000-0000-4000-9000-000000000361', '00000000-0000-4000-9000-000000000322', 'write_off', 1000,
        'selisih pembulatan', 'bookings/uji/bukti.jpg', '00000000-0000-4000-8000-00000000f001');
select set_config('app.in_rpc', '', true);

-- ===== Append-only logs =====
select is(
  array(
    select log_table || ':' || pg_temp.outcome(change) from (values
      ('booking_events', $$update public.booking_events set reason = 'diubah' where booking_id = '00000000-0000-4000-9000-000000000321'$$),
      ('payment_events', $$update public.payment_events set payload = '{}' where event_hash = 'uji-pemicu-event'$$),
      ('webhook_rejections', $$update public.webhook_rejections set reason = 'rate_limited' where received_at = '2001-02-03 04:05:06+00'$$),
      ('package_price_history', $$update public.package_price_history set new_price_per_pax = 1 where package_id = '00000000-0000-4000-9000-000000000301'$$),
      ('ticket_scans', $$update public.ticket_scans set result = 'ok' where attempt_id = '00000000-0000-4000-9000-000000000351'$$),
      ('revenue_share_entries', $$update public.revenue_share_entries set amount = 1 where booking_id = '00000000-0000-4000-9000-000000000322'$$),
      ('security_events', $$update public.security_events set severity = 'critical' where entity_id = 'uji-pemicu'$$),
      ('audit_logs', $$update public.audit_logs set action = 'diubah' where id > (select id from audit_start)$$),
      ('login_attempts', $$update public.login_attempts set success = true where attempted_at = '2001-02-03 04:05:06+00'$$),
      ('payment_adjustments', $$update public.payment_adjustments set amount = 900000 where id = '00000000-0000-4000-9000-000000000361'$$)
    ) as attempt(log_table, change)
    order by 1
  ),
  array['audit_logs:42501', 'booking_events:42501', 'login_attempts:42501', 'package_price_history:42501',
        'payment_adjustments:42501', 'payment_events:42501', 'revenue_share_entries:42501', 'security_events:42501',
        'ticket_scans:42501', 'webhook_rejections:42501'],
  'no row of a log or the ledger is ever edited'
);
select is(
  array(
    select log_table || ':' || pg_temp.outcome(format('delete from public.%I', log_table))
    from unnest(array['booking_events', 'payment_events', 'webhook_rejections', 'package_price_history', 'ticket_scans',
                      'revenue_share_entries', 'security_events', 'audit_logs', 'login_attempts',
                      'payment_adjustments']) as log_table
    order by 1
  ),
  array['audit_logs:42501', 'booking_events:42501', 'login_attempts:42501', 'package_price_history:42501',
        'payment_adjustments:42501', 'payment_events:42501', 'revenue_share_entries:42501', 'security_events:42501',
        'ticket_scans:42501', 'webhook_rejections:42501'],
  'nor deleted'
);
select is(
  array(
    select log_table || ':' || exists (
      select 1 from pg_trigger t
      where t.tgrelid = format('public.%I', log_table)::regclass and not t.tgisinternal
        and t.tgtype & 32 <> 0 and t.tgtype & 2 <> 0 and t.tgfoid = 'internal.append_only'::regproc)
    from unnest(array['booking_events', 'payment_events', 'webhook_rejections', 'package_price_history', 'ticket_scans',
                      'revenue_share_entries', 'security_events', 'audit_logs', 'login_attempts',
                      'payment_adjustments']) as log_table
    order by 1
  ),
  array['audit_logs:true', 'booking_events:true', 'login_attempts:true', 'package_price_history:true',
        'payment_adjustments:true', 'payment_events:true', 'revenue_share_entries:true', 'security_events:true',
        'ticket_scans:true', 'webhook_rejections:true'],
  'nor truncated: TRUNCATE skips row triggers, so each log has a statement trigger of its own'
);
select is(
  pg_temp.outcome('truncate public.audit_logs'),
  '42501',
  'and that trigger refuses it'
);
select is(
  pg_temp.outcome($$select set_config('app.purge', 'on', true);
                    delete from public.webhook_rejections where received_at = '2001-02-03 04:05:06+00'$$),
  'allowed',
  'only a retention run, with app.purge on, may prune a log'
);
select set_config('app.purge', '', true);

-- ===== Settled money stays as it was paid =====
select throws_ok(
  $$update public.payments set gross_amount = 1 where id = '00000000-0000-4000-9000-000000000341'$$,
  '42501', 'gross_amount, order_id, provider, booking_id and attempt_no never change',
  'what a payment charged never changes'
);
select throws_ok(
  $$update public.payments set method = 'virtual_account' where id = '00000000-0000-4000-9000-000000000341'$$,
  'P0001', 'a payment Midtrans settled only changes its status and refunded amount',
  'a settled payment keeps every other column'
);
select lives_ok(
  $$update public.payments set refunded_amount = 25000 where id = '00000000-0000-4000-9000-000000000341'$$,
  'but may record a refund'
);
select throws_ok(
  $$delete from public.payments where id = '00000000-0000-4000-9000-000000000341'$$,
  '42501', 'payments are never deleted', 'and is never deleted'
);
select throws_ok(
  $$update public.bookings set total_amount = 1 where id = '00000000-0000-4000-9000-000000000322'$$,
  'P0001', 'the money on a paid booking changes only through an approved adjustment',
  'a paid booking keeps its money'
);
select throws_ok(
  $$update public.bookings set booking_code = 'GSK-TR1GGR99' where id = '00000000-0000-4000-9000-000000000321'$$,
  '42501', 'rw_ids, package_id, booking_code, created_at, consent_version and guardian_consented_at never change',
  'and every booking keeps its identity'
);
select throws_ok(
  $$update public.bookings set status = 'cancelled' where id = '00000000-0000-4000-9000-000000000321'$$,
  '42501', 'bookings.status is written only by the transition functions',
  'a status moves only inside a transition function, even along an allowed transition'
);

-- ===== Tickets =====
select throws_ok(
  $$insert into public.tickets_qr (booking_id, booking_leg_id, rw_id, visit_session_id, ticket_code, valid_on, valid_from,
      valid_until, pax_count, key_id)
    values ('00000000-0000-4000-9000-000000000321', '00000000-0000-4000-9000-000000000331', 5,
            '00000000-0000-4000-9000-000000000311', 'GSK-TR1GGR01-05', public.today_jkt() + 40, now(),
            now() + interval '41 days', 4, 'k1')$$,
  'P0001', 'a ticket is issued only for a paid booking with a settled payment',
  'tickets_require_paid_booking refuses a ticket for an unpaid booking'
);
select lives_ok(
  $$insert into public.tickets_qr (id, booking_id, booking_leg_id, rw_id, visit_session_id, ticket_code, valid_on,
      valid_from, valid_until, pax_count, key_id)
    values ('00000000-0000-4000-9000-000000000371', '00000000-0000-4000-9000-000000000322',
            '00000000-0000-4000-9000-000000000332', 5, '00000000-0000-4000-9000-000000000311', 'GSK-TR1GGR02-05',
            public.today_jkt() + 40, now(), now() + interval '41 days', 4, 'k1')$$,
  'and issues one for a paid booking with a settled payment'
);
select set_config('app.in_rpc', '1', true);
update public.tickets_qr set status = 'used', checked_in_at = now() where id = '00000000-0000-4000-9000-000000000371';
select throws_ok(
  $$update public.tickets_qr set status = 'issued' where id = '00000000-0000-4000-9000-000000000371'$$,
  'P0001', 'a ticket that was used, revoked or expired is not issued again',
  'tickets_no_revive: a used ticket is not issued again, even inside a transition function'
);
select lives_ok(
  $$select set_config('app.undo_check_in', '1', true);
    update public.tickets_qr set status = 'issued', checked_in_at = null where id = '00000000-0000-4000-9000-000000000371';
    select set_config('app.undo_check_in', '', true)$$,
  'except by undo_check_in'
);
update public.tickets_qr set status = 'revoked', revoked_at = now() where id = '00000000-0000-4000-9000-000000000371';
select throws_ok(
  $$select set_config('app.undo_check_in', '1', true);
    update public.tickets_qr set status = 'issued' where id = '00000000-0000-4000-9000-000000000371'$$,
  'P0001', 'a ticket that was used, revoked or expired is not issued again',
  'and never a revoked one'
);
select set_config('app.undo_check_in', '', true);
select throws_ok(
  $$update public.tickets_qr set ticket_code = 'GSK-TR1GGR02-08' where id = '00000000-0000-4000-9000-000000000371'$$,
  '42501', 'ticket_code, booking_id, booking_leg_id and rw_id never change',
  'a ticket keeps its code and its booking'
);
select set_config('app.in_rpc', '', true);

-- ===== profiles_guard =====
select pg_temp.act_as('admin_rw_05');
select throws_ok(
  $$update public.profiles set role = 'superadmin' where id = '00000000-0000-4000-8000-00000000f005'$$,
  '42501', null, 'an RW admin cannot make themselves superadmin'
);
select throws_ok(
  $$update public.profiles set rw_id = 8 where id = '00000000-0000-4000-8000-00000000f005'$$,
  '42501', null, 'nor move to another RW'
);
reset role;
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
set local role service_role;
select throws_ok(
  $$update public.profiles set role = 'superadmin', rw_id = null where id = '00000000-0000-4000-8000-00000000f005'$$,
  '42501', 'role, rw_id, is_active, mfa_required and email change only through set_staff_role / set_staff_status',
  'the service role cannot change a role without app.privileged_rpc'
);
select throws_ok(
  $$update public.profiles set is_active = false where id = '00000000-0000-4000-8000-00000000f008'$$,
  '42501', 'role, rw_id, is_active, mfa_required and email change only through set_staff_role / set_staff_status',
  'nor deactivate anyone'
);
select throws_ok(
  $$insert into public.profiles (id, email, full_name, role) values
      ('00000000-0000-4000-8000-00000000f000', 'baru@example.test', 'Baru', 'superadmin')$$,
  '42501', null, 'nor create a profile that already has a role'
);
reset role;
select throws_ok(
  $$update public.profiles set claims_version = claims_version - 1 where id = '00000000-0000-4000-8000-00000000f005'$$,
  '42501', 'claims_version never goes back', 'and claims_version never goes back, even for the owner'
);

-- ===== visit_sessions_guard =====
select throws_ok(
  $$delete from public.visit_sessions where id = '00000000-0000-4000-9000-000000000311'$$,
  'P0001', 'a session with bookings cannot be deleted', 'a session with bookings is never deleted'
);
select throws_ok(
  $$update public.visit_sessions set status = 'cancelled' where id = '00000000-0000-4000-9000-000000000311'$$,
  'P0001', 'a session with bookings cannot be cancelled; move or contact the bookings first', 'nor cancelled'
);
select throws_ok(
  $$update public.visit_sessions set session_date = session_date + 1 where id = '00000000-0000-4000-9000-000000000311'$$,
  'P0001', 'a session with bookings keeps its RW, date and times', 'nor moved'
);
select throws_ok(
  $$update public.visit_sessions set capacity = 3 where id = '00000000-0000-4000-9000-000000000311'$$,
  'P0001', 'capacity cannot go below the seats already reserved (4)', 'nor shrunk below its reserved seats'
);
update public.visit_sessions set capacity = 12 where id = '00000000-0000-4000-9000-000000000311';
select is(
  (select details ->> 'capacity_after' from public.security_events
   where event_type = 'session_changed_with_bookings' and entity_id = '00000000-0000-4000-9000-000000000311'),
  '12',
  'a change it allows under bookings is reported for the superadmin to see'
);
select lives_ok(
  $$delete from public.visit_sessions where id = '00000000-0000-4000-9000-000000000312'$$,
  'a session nobody booked may still be deleted'
);

-- ===== tour_packages_price_floor (pricing.min_price_per_pax = 5000) =====
select throws_ok(
  $$insert into public.tour_packages (rw_id, category, slug, name, duration_minutes, price_per_pax)
    values (5, 'student', 'uji-pemicu-murah', 'Murah', 60, 4999)$$,
  '23514', 'a price per visitor may not go below IDR 5000', 'a new package below the floor is refused'
);
select throws_ok(
  $$update public.tour_packages set price_per_pax = 1 where id = '00000000-0000-4000-9000-000000000301'$$,
  '23514', 'a price per visitor may not go below IDR 5000', 'and so is a price cut below it'
);
select throws_ok(
  $$update public.tour_packages set pricing_basis = 'flat_group', flat_price = 99999, max_pax = 20
    where id = '00000000-0000-4000-9000-000000000301'$$,
  '23514', 'a group price for up to 20 visitors may not go below IDR 100000',
  'a flat group price covers the floor for its largest group'
);
select throws_ok(
  $$insert into public.tour_package_price_tiers (package_id, min_pax, price_per_pax)
    values ('00000000-0000-4000-9000-000000000301', 30, 4000)$$,
  '23514', 'a price per visitor may not go below IDR 5000', 'a volume tier meets the same floor'
);
select lives_ok(
  $$update public.tour_packages set price_per_pax = 5000 where id = '00000000-0000-4000-9000-000000000301'$$,
  'the floor itself is a valid price'
);

-- ===== log_audit keeps contact details out =====
update public.bookings set pic_phone = '+6289900000321' where id = '00000000-0000-4000-9000-000000000321';
update public.profiles set phone = '+6289900000005' where id = '00000000-0000-4000-8000-00000000f005';
update public.rw_units set contact_phone = '+6289900000055' where id = 5;
insert into public.umkm_vendors (id, rw_id, slug, name, phone, is_active)
values ('00000000-0000-4000-9000-000000000381', 5, 'uji-pemicu-vendor', 'Vendor Uji', '+6289900000381', true);
insert into public.site_settings (key, value, is_public) values ('contact.whatsapp_number', '"+6289900000999"', true)
on conflict (key) do update set value = excluded.value;
select is(
  (select count(distinct entity_type)::int from public.audit_logs
   where id > (select id from audit_start)
     and entity_type in ('bookings', 'profiles', 'rw_units', 'umkm_vendors', 'site_settings')),
  5,
  'each contact change above is audited'
);
select is(
  (select count(*)::int from public.audit_logs
   where id > (select id from audit_start) and concat(before::text, after::text, metadata::text) like '%+62%'),
  0,
  'yet no audit row written in this suite holds a +62 number'
);

-- ===== The service role names its actor =====
-- A service-role request carries the service key's claims, which name no user.
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
set local role service_role;
select throws_ok(
  $$insert into public.umkm_vendors (rw_id, slug, name, is_active) values (5, 'uji-pemicu-tanpa-aktor', 'Tanpa Aktor', true)$$,
  '42501', 'audit: a service action must name its actor (set app.actor_id)',
  'a service-role write to an audited table without app.actor_id is refused'
);
select set_config('app.actor_id', '00000000-0000-4000-8000-00000000f005', true);
select lives_ok(
  $$insert into public.umkm_vendors (rw_id, slug, name, is_active) values (5, 'uji-pemicu-dengan-aktor', 'Dengan Aktor', true)$$,
  'naming the staff member it acts for lets it through'
);
select set_config('app.actor_id', '', true);
reset role;

select * from finish();
rollback;
