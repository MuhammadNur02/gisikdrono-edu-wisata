# Runbook: the site is flooded (DoS)

Owner: Dev on call; any superadmin may do steps 1–2. Source of truth: `docs/Security.md` §8.3 (RL-01…RL-07), §11.4.

Signs: the site is slow or answers 429/503, Vercel usage jumps, busy `rate_limit_buckets` keys or many `turnstile_failed` events, a flood of OTP requests or bookings, the uptime monitor alerts.

## 1. Challenge every visitor (first 5 minutes)

Vercel → the project → **Firewall** → **Attack Challenge Mode** → **Enable**. Every visitor now passes a browser challenge first; bots and scripts stop. Webhooks still arrive: Vercel lets verified traffic to the project through, and Midtrans retries a notification it could not deliver, so nothing is lost (check step 5).

## 2. Tighten our own limits

`/dashboard/settings` (superadmin) → **Profil pembatasan permintaan** → **Ketat (saat ada serangan)** → **Simpan pengaturan**. If the dashboard does not load, in Supabase **SQL Editor**:

```sql
update public.site_settings set value = '"strict"', updated_at = now() where key = 'rate_limit_profile';
```

## 3. See where it comes from and block it

```sql
-- which limiters are busiest, last 30 minutes (keys are '<limiter>:<keyed hash>', never a raw IP)
select split_part(key, ':', 1) as limiter, count(*) as keys, sum(count) as hits
from public.rate_limit_buckets where window_start > now() - interval '30 minutes'
group by 1 order by hits desc;
-- the busiest single keys: one IP or one phone hammering a limiter
select key, sum(count) as hits from public.rate_limit_buckets
where window_start > now() - interval '30 minutes' group by key order by hits desc limit 20;
-- failed Turnstile checks and logins, by keyed IP hash
select event_type, ip_hash, count(*) from public.security_events
where occurred_at > now() - interval '30 minutes' and event_type in ('turnstile_failed', 'login_failed')
group by 1, 2 order by 3 desc limit 20;
```

Vercel → **Observability** (or **Logs**) → filter by path and look at the top client IPs and ASNs. Then Vercel → **Firewall → Configure → New rule**:

- **Deny** for the attacking IP ranges or ASN;
- or **Challenge** for path `/pesan/*` and `/reservasi/*` only, when the attack aims at booking and the rest of the site should stay open (`docs/Security.md` §8.3, *should*).

## 4. Switch off the expensive parts

- Booking flood: `/dashboard/settings` → **Mode pemeliharaan** (closes the booking form, keeps the site up).
- OTP flood: the global OTP breaker (500 a day) already falls back to interactive Turnstile and email OTP; turn WhatsApp off in `/dashboard/settings` only if Meta warns about cost.
- Exports and guest PDFs: no switch exists yet; their own limits (10 exports/h per user, PDF 10/h per booking, 30/h per IP) hold.

The gate scanner keeps working: its limits are per signed-in officer, not per IP, so an anonymous flood never locks it.

## 5. Stand down

1. When the graphs are flat for an hour: disable Attack Challenge Mode, set the profile back to **Normal**, untick **Mode pemeliharaan**. Keep the Firewall deny rules for a week, then remove them.
2. Check nothing was lost during the attack:

   ```sql
   select job, last_success_at, last_error_code from public.job_heartbeats order by job;
   select count(*) from public.payments where status = 'pending' and created_at < now() - interval '1 hour';
   ```

   Pending payments older than their hold: `docs/runbooks/payment-discrepancy.md`.
3. Write down start, end, source, the rules used, and what was slow; add a Firewall rule template to this page if a new one was needed.
