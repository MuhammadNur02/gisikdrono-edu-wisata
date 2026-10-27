-- Independent review of PR #85, L-b (20261104180000_reveal_caps_apart.sql; docs/Security.md §6.6): a superadmin's bank
-- account reveals, which are pii_revealed events too, no longer spend the daily cap of 50 contact and participant
-- reveals; that cap counts the events of bookings alone, and still stops the 51st of those.
begin;
select plan(3);
\ir helpers/rls_personas.psql

-- The claims of the superadmin persona, then back to postgres, so internal.record_pii_reveal sees who reveals.
select pg_temp.act_as('superadmin_aal2');
reset role;

insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
select 'pii_revealed', 'info', pg_temp.persona_id('superadmin_aal2'), 5, 'rw_units', '5', '{"count": "bank_account"}'
from generate_series(1, 50);

select lives_ok($$select internal.record_pii_reveal('00000000-0000-4000-8000-0000000f7001', 5::smallint, '{}')$$,
  'fifty bank reveals today leave the contact budget untouched');
select is((select count(*)::int from public.security_events e
           where e.event_type = 'pii_revealed' and e.entity_type = 'bookings'
             and e.actor_id = pg_temp.persona_id('superadmin_aal2')), 1,
  'and the contact reveal is counted as the first of its kind');

insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
select 'pii_revealed', 'info', pg_temp.persona_id('superadmin_aal2'), 5, 'bookings',
       '00000000-0000-4000-8000-0000000f7001', '{}'
from generate_series(1, 49);
select throws_ok($$select internal.record_pii_reveal('00000000-0000-4000-8000-0000000f7001', 5::smallint, '{}')$$,
  'P0001', null, 'while the fifty-first contact reveal of the day is still refused');

select * from finish();
rollback;
