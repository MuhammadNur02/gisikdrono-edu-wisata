-- Lows of the review of PR #83 (docs/Security.md §5.1, §5.6; docs/PRD.md §8 profiles):
--   L-1  A new profile is inactive unless its writer says otherwise. Every path that makes a profile already says so
--        (internal.handle_new_auth_user writes is_active = false, accept_staff_invite sets it true together with the
--        role), and profiles_active_implies_became_staff (20261104140000) refuses an active profile that never
--        became staff, so the old default of true could only ever produce a refused insert.
--
-- Notes on 20261104140000, which stays as merged:
--   I-1  release_unused_profile takes the profile row before it decides, the lock claim_staff_invite and
--        accept_staff_invite take first, so an acceptance and a delete of the same account are serialised. That is
--        not a promise of no deadlock: a superadmin's demotion or deactivation fires revoke_invites_of_fallen_inviter
--        (20261103131100), whose cascade over staff_invites can lock rows in another order than a concurrent
--        delete. Postgres detects such a cycle and aborts one side with 40P01, and nothing is left half-written.
--   I-2  In release_unused_profile, the branch `exists (... p.role <> 'none')` is defence in depth: since
--        profiles_role_implies_became_staff a profile with a role has became_staff_at, so internal.is_never_staff
--        is already false for it and the branch is unreachable. It stays in case a later migration loosens that
--        check.

alter table public.profiles alter column is_active set default false;
