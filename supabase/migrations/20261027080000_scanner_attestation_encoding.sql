-- Re-review of PR #54, L(b) (docs/Security.md §9.2): the attestation's message was built with concat_ws, which drops a
-- NULL field and so shifts the fields after it. It is now spelled out: every field in its fixed order, as text, an
-- empty string when absent, joined by '|', exactly as src/lib/scanner/attest.ts joins them. For the values scan_ticket
-- passes, none of which is NULL, the message and so every attestation stay as they were.

create or replace function internal.scanner_attestation(
  p_officer uuid, p_ticket_id uuid, p_attempt_id uuid, p_mode text, p_source text, p_expires_at bigint
) returns text
  language sql stable
  set search_path = ''
as $$
  select encode(extensions.hmac(
           convert_to(coalesce(p_officer::text, '') || '|' || coalesce(p_ticket_id::text, '') || '|'
                      || coalesce(p_attempt_id::text, '') || '|' || coalesce(p_mode, '') || '|'
                      || coalesce(p_source, '') || '|' || coalesce(p_expires_at::text, ''), 'UTF8'),
           internal.scanner_attestation_key(), 'sha256'), 'hex');
$$;
