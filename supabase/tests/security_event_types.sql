-- security_events.event_type after 20261018133045_upload_sanitized_event: upload_sanitized is accepted next to
-- upload_rejected, every earlier type still is, and a type outside the list is still refused.
begin;
select plan(4);

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
