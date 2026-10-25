-- security_events.event_type after 20261018133045_upload_sanitized_event: upload_sanitized is accepted next to
-- upload_rejected, every earlier type still is, and a type outside the list is still refused. After
-- 20261020080000_auth_review_events: mfa_locked and session_revoke_failed (security review of PR #17, M1 and S1). After
-- 20261025080300_gate_review_fixes: manual_lookup (review of PR #53, M1). After 20261029080400:
-- alert_self_ack_sole_superadmin (re-review of PR #58, N2).
begin;
select plan(8);

select lives_ok(
  $$insert into public.security_events (event_type, severity, entity_type, details)
    values ('alert_self_ack_sole_superadmin', 'high', 'security_alerts', '{}')$$,
  'alert_self_ack_sole_superadmin is a security event type'
);

select lives_ok(
  $$insert into public.security_events (event_type, severity, entity_type, details)
    values ('manual_lookup', 'medium', 'bookings', '{"outcome": "wrong_digits"}')$$,
  'manual_lookup is a security event type'
);

select lives_ok(
  $$insert into public.security_events (event_type, severity, entity_type, details)
    values ('mfa_locked', 'high', 'mfa_factor', '{"failures": 5}')$$,
  'mfa_locked is a security event type'
);

select lives_ok(
  $$insert into public.security_events (event_type, severity, entity_type, details)
    values ('session_revoke_failed', 'high', 'auth_session', '{"flow": "password_change"}')$$,
  'session_revoke_failed is a security event type'
);

select lives_ok(
  $$insert into public.security_events (event_type, severity, entity_type, details)
    values ('upload_sanitized', 'info', 'upload', '{"removed": "OpenAction", "kind": "destination"}')$$,
  'upload_sanitized is a security event type'
);

select lives_ok(
  $$insert into public.security_events (event_type, severity, entity_type, details)
    values ('upload_rejected', 'medium', 'upload', '{"reason": "pdf_active_content"}')$$,
  'upload_rejected still is'
);

select lives_ok(
  $$insert into public.security_events (event_type, severity, details)
    values ('notification_blocked', 'medium', '{}')$$,
  'the types 0004 added still are'
);

select throws_ok(
  $$insert into public.security_events (event_type, severity, details) values ('upload_cleaned', 'info', '{}')$$,
  '23514', null,
  'a type outside the list is refused'
);

select * from finish();
rollback;
