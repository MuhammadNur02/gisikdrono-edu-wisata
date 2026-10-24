# Runbook: the public site shows content nobody approved

Owner: superadmin with the Dev on call. Source of truth: `docs/Security.md` §11.4.

Signs: a visitor or staff member reports an article, banner, package, product, photo or RW profile that the kelurahan did not write; images that are not ours on `/galeri`; links to strange sites.

## 1. Hide it now (within 15 minutes)

1. Open the item in the dashboard and take it off the site: `/dashboard/articles`, `/dashboard/packages`, `/dashboard/products`, `/dashboard/galleries`, `/dashboard/booklets`, `/dashboard/schedules`, `/dashboard/activity-points`, `/dashboard/settings/hero-banners`, `/dashboard/pages` (RW profile) → the row's **Aksi baris** menu → archive or unpublish. Saving from the dashboard also refreshes the cached public page.
2. If many items changed or the dashboard itself is suspect, turn on **Mode pemeliharaan** (`/dashboard/settings`, or the SQL in `docs/runbooks/breach.md`, contain step 1).
3. Treat the account that made the change as taken over: find it in step 2 and run `docs/runbooks/account-takeover.md`, step 1.

## 2. Find who changed what

Articles, hero banners, packages, products, UMKM vendors, RW profiles, reviews and site settings are audited row by row:

```sql
select occurred_at, actor_id, actor_role, action, entity_type, entity_id, before, after
from public.audit_logs
where entity_type in ('articles', 'hero_banners', 'tour_packages', 'products_umkm', 'umkm_vendors', 'rw_units',
                      'reviews', 'site_settings')
  and occurred_at > now() - interval '7 days'
order by occurred_at desc;
```

Galleries, booklets, schedules and activity points are not in the audit trail. Their `updated_at` column says when a row changed, and the `owner` of a new file in step 4 says which staff account uploaded it. Refused or cleaned-up uploads are security events:

```sql
select occurred_at, actor_id, event_type, severity, details from public.security_events
where event_type in ('upload_rejected', 'upload_sanitized') and occurred_at > now() - interval '7 days'
order by occurred_at desc;
```

## 3. Put the right content back

- The audit row's `before` holds the previous values of the audited columns: copy them back through the dashboard form of that item and save (the save revalidates the public page).
- A column the audit trail does not keep (for example a long article body), or an unaudited table: restore the latest good backup into **staging** (Supabase daily backup, or the weekly encrypted dump of `.github/workflows/backup.yml`; the drill procedure is Task P5.5.04), read the row there, and re-enter it through the production dashboard. Never restore a backup over production for a content fix.
- After any fix made in SQL instead of the dashboard, refresh the caches: Vercel → project → **Settings → Data Cache → Purge Everything**, then reload the page to check.

## 4. Remove files that are not ours

```sql
select name, created_at, owner from storage.objects
where bucket_id = 'public-media' and created_at > now() - interval '7 days'
order by created_at desc;
```

Compare with what staff uploaded; delete the strangers in Supabase **Storage → public-media → the `rw-XX` or `kelurahan` folder**. Rows that still point at a deleted file show a broken image, so fix those rows first (step 3).

## 5. Close

Turn **Mode pemeliharaan** off, check `/`, the RW pages, `/galeri` and `/artikel` on a phone, and write the post-mortem (how the account or upload got in, what stops it next time).
