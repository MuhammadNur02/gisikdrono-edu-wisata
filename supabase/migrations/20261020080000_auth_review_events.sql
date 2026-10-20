-- Two security events from the security review of PR #17 (docs/Security.md §5.4, §5.5, §11.1):
--   mfa_locked             the MFA verification hook of 20261020080100 locked an account after too many wrong TOTP
--                          codes in its window (M1);
--   session_revoke_failed  a global sign-out Supabase Auth could not finish, after a password change or `Keluar`, so
--                          other devices may still be signed in (S1).

-- The type list of 20261018133045_upload_sanitized_event with these two more; forward-only, so it stays as applied.
alter table public.security_events drop constraint security_events_event_type_check;
alter table public.security_events add constraint security_events_event_type_check check (event_type in (
  'webhook_signature_invalid','webhook_amount_mismatch','status_disagreement','login_failed','login_locked',
  'mfa_failed','mfa_enrolled','scanner_invalid_signature','scanner_lockout','rate_limited','turnstile_failed',
  'upload_rejected','role_changed','staff_disabled','key_rotated','export_downloaded','pii_revealed',
  'manual_checkin','manual_backfill','undo_check_in','cron_failed','notification_dead','price_changed',
  'session_changed_with_bookings','quota_pressure','mfa_reset','notification_blocked','upload_sanitized',
  'mfa_locked','session_revoke_failed'));
