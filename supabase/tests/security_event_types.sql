-- security_events.event_type after 20261018133045_upload_sanitized_event: upload_sanitized is accepted next to
-- upload_rejected, every earlier type still is, and a type outside the list is still refused. After
-- 20261020080000_auth_review_events: mfa_locked and session_revoke_failed (security review of PR #17, M1 and S1).
begin;
select plan(6);

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
