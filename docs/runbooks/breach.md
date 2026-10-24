# Runbook: suspected personal-data breach (UU PDP No. 27/2022)

Owner: Dev on call runs the technical steps; the Pejabat Pelindungan Data (DPO, `site_settings.privacy.dpo_name`) and the Lurah own the notifications. Source of truth: `docs/Security.md` §7.6 (PDP-01…PDP-03), §11.4.

A breach is suspected when personal data (PIC name, phone, email, institution, participant names) may have been read, copied, changed or destroyed by someone not allowed to: an unexplained export, a staff account used by someone else, a leaked service-role key, a public page or log showing a phone number.

**The clock.** UU PDP Article 46: written notice to the data subjects and to the authority **within 3 × 24 hours** of learning of the breach. Write down the moment you learned of it (T0) as the first line of the incident note; every deadline below counts from T0.

## T0 to T0 + 4 h: contain

Do all that apply; each one is safe to do on a guess.

1. **Close the site to bookings**: `/dashboard/settings` (superadmin) → tick **Mode pemeliharaan** → **Simpan pengaturan**. If the dashboard itself is suspect, in Supabase **SQL Editor**:

   ```sql
   update public.site_settings set value = 'true', updated_at = now() where key = 'maintenance_mode';
   ```

2. **Slow down attackers**: Vercel → project → **Firewall** → **Attack Challenge Mode** → enable (`docs/runbooks/dos.md`).
3. **Lock suspect staff accounts**: `docs/runbooks/account-takeover.md`, steps 1–2.
4. **Sign every staff member out** when the source is unknown:

   ```sql
   delete from auth.sessions;
   ```

5. **Rotate the keys** that could reach the data: `SUPABASE_SERVICE_ROLE_KEY` first (`docs/runbooks/rotate-keys.md`), then any other key in the incident note.
6. **Void guest links** if bookings were reachable through them (rotate `BOOKING_LINK_SECRET`).

## T0 + 4 h: preserve

Before anything is cleaned up, keep the evidence.

1. Supabase → **Database → Backups**: note the latest backup time (or create a PITR restore point if the add-on is on). Do not restore over production.
2. Export the logs of the window to the incident folder in the kelurahan drive: Supabase **Logs → API** and **Logs → Auth**, Vercel **Logs** (filter the window, download).
3. Export the security tables:

   ```sql
   select * from public.audit_logs where occurred_at > '<window start>' order by occurred_at;
   select * from public.security_events where occurred_at > '<window start>' order by occurred_at;
   select id, kind, requested_by, rw_id, row_count, created_at, downloaded_at from public.exports
   where created_at > '<window start>';
   ```

   Save the results as CSV (SQL Editor → **Export → CSV**). They contain ids, never PII.

## T0 + 24 h: assess and tell the kelurahan

1. Scope: which bookings and how many people. Reveals and exports are audited, so start there:

   ```sql
   -- contact reveals (rpc_reveal_booking_contact) per booking and per staff member
   select entity_id as booking_id, actor_id, count(*) from public.security_events
   where occurred_at > '<window start>' and event_type = 'pii_revealed'
   group by entity_id, actor_id;
   -- participant lists read (rpc_get_participants)
   select entity_id as booking_id, actor_id, count(*) from public.audit_logs
   where occurred_at > '<window start>' and action = 'participants.read'
   group by entity_id, actor_id;
   -- exports: each one is a file of many bookings
   select id, kind, requested_by, rw_id, filters, row_count, downloaded_at from public.exports
   where created_at > '<window start>';
   ```

   `select distinct action from public.audit_logs where occurred_at > '<window start>';` shows whatever else was recorded in the window.
2. Brief the Lurah and the DPO in writing before T0 + 24 h: what happened, what data, how many people, what is contained, what is still open.

## Before T0 + 72 h: notify

1. **Data subjects**: one message per affected booking to its verified channel. WhatsApp template `gsk_security_alert_v1` (text in `docs/notifications.md`) and an email with the same content. The message says, in Indonesian: what happened, which of their data, what we did, what they should do (watch for messages pretending to be the kelurahan, never share an OTP), and the DPO contact (`privacy.dpo_email`).
2. **Authority**: a written letter signed by the Lurah to the authority named by UU PDP (until it is formed, Kementerian Komunikasi dan Digital, via Diskominfo Kota Semarang). Contents: what happened and when, the categories of data and number of people, the consequences, the steps taken, the contact person.
3. Keep copies of every notice and its send time in the incident folder.

## Recover

1. Fix the cause; run `pnpm db:test` and the Playwright security smoke on staging.
2. Rotate anything not yet rotated; re-invite locked staff with MFA (`docs/runbooks/account-takeover.md`, step 5).
3. `/dashboard/settings` → untick **Mode pemeliharaan**; Vercel Firewall → disable Attack Challenge Mode.
4. Post-mortem within 5 working days; the yearly tabletop (`docs/Security.md` §13.2) rehearses this page.
