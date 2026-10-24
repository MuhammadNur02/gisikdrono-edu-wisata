# Runbook: a staff account is taken over

Owner: a superadmin who is not the affected person, with the Dev on call. Source of truth: `docs/Security.md` §5.6 (AUTH-07, AZ-09, AZ-10), §11.4.

Signs: a staff member reports a login or TOTP prompt they did not make, a `security_alerts` row for failed MFA or sign-ins from new places, content or check-ins nobody owns, contact reveals at odd hours, a lost or stolen phone with the authenticator app.

## 1. Lock the account (within 15 minutes)

Find the account in Supabase **SQL Editor** of the project:

```sql
select p.id, p.email, p.role, p.rw_id, p.is_active from public.profiles p where p.email = '<email>';
```

Then, all three at once (the user's id from above):

```sql
update auth.users set banned_until = 'infinity' where id = '<user id>';  -- no new sign-in or token refresh
delete from auth.sessions where user_id = '<user id>';                    -- refresh tokens gone
delete from auth.mfa_factors where user_id = '<user id>';                 -- the stolen TOTP secret is useless
```

An access token already issued keeps working until it expires (JWT lifetime 900 s), so the account is fully out within 15 minutes. If that is too long (an attacker is exporting right now), also turn on **Mode pemeliharaan** (`docs/runbooks/breach.md`, contain step 1).

## 2. Record the deactivation properly

Once `/dashboard/users` exists (Task P4.8), a superadmin with a fresh TOTP opens the account there and deactivates it, which calls `set_staff_status(user, false, reason)`: role back to `none`, sessions and factors deleted, a `staff_disabled` security event, an audit row. Until then, note in the incident record who ran step 1 and when; `set_staff_status` cannot be run from the SQL Editor, because it needs a signed-in superadmin.

If the taken-over account is the only active superadmin, do step 1 only and tell the Lurah: the kelurahan has no superadmin until a new one is invited (`docs/Security.md` §5.1).

## 3. Find what the attacker did

```sql
-- every write made as this account
select occurred_at, action, entity_type, entity_id, before, after
from public.audit_logs where actor_id = '<user id>' and occurred_at > '<suspected start>' order by occurred_at;
-- security-relevant events: reveals, exports, check-ins, uploads, failed MFA
select occurred_at, event_type, severity, entity_type, entity_id, details
from public.security_events where actor_id = '<user id>' and occurred_at > '<suspected start>' order by occurred_at;
-- scans and check-ins
select scanned_at, phase, result, source, ticket_id, attendee_count
from public.ticket_scans where scanned_by = '<user id>' and scanned_at > '<suspected start>' order by scanned_at;
select id, kind, row_count, created_at, downloaded_at from public.exports where requested_by = '<user id>';
```

Supabase **Logs → Auth** (filter by the email) shows the IPs and user agents of the sign-ins.

## 4. Undo

- Content edits and deletions: `docs/runbooks/defacement.md`, step 2.
- A check-in the officer did not make: `undo_check_in` from the dashboard by another admin of that RW (once Task P4.4 ships), with the reason "account takeover".
- Any `pii_revealed` or export: personal data may have left; run `docs/runbooks/breach.md` from "preserve".
- Rotate every secret the person could see (vendor consoles, Bitwarden items shared with them): `docs/runbooks/rotate-keys.md`.

## 5. Give the person access again

1. Only after their device is clean (new phone or a reset authenticator app) and their email password is changed with 2FA on.
2. Lift the ban: `update auth.users set banned_until = null where id = '<user id>';`
3. They enrol a new TOTP factor at the next sign-in (`/mfa/enroll`), which `mfa_required` forces. If their role was set back to `none` (step 2), a superadmin gives it back with a new invite (`staff_invites`, new `invite_code`).
4. Close the incident with `docs/Security.md` §11.4's post-mortem rule.
