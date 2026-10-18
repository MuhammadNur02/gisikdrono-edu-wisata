-- upload_sanitized: api/uploads/finalize removed something harmless from a file instead of refusing it, and says
-- so (docs/Security.md §8.4, decision of 2026-10-18). The first case is a booklet PDF whose /OpenAction only
-- opens a page (a destination array or a /GoTo action), as LibreOffice and InDesign exports often carry: the
-- re-serialised copy leaves it out and the event records what went. Every other active content is still refused
-- as upload_rejected.

-- The type list of 0004 with this one value more; forward-only, so 0004 stays as it was applied.
alter table public.security_events drop constraint security_events_event_type_check;
alter table public.security_events add constraint security_events_event_type_check check (event_type in (
  'webhook_signature_invalid','webhook_amount_mismatch','status_disagreement','login_failed','login_locked',
  'mfa_failed','mfa_enrolled','scanner_invalid_signature','scanner_lockout','rate_limited','turnstile_failed',
  'upload_rejected','role_changed','staff_disabled','key_rotated','export_downloaded','pii_revealed',
  'manual_checkin','manual_backfill','undo_check_in','cron_failed','notification_dead','price_changed',
  'session_changed_with_bookings','quota_pressure','mfa_reset','notification_blocked','upload_sanitized'));
