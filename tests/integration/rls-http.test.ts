import { createHmac, randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/db/types';

import {
  accessTokenOf,
  anonClient,
  claimsOf,
  lastAuditId,
  removeSignInTraces,
  signInDevAccount,
  signInWithPassword,
  userIdOf,
} from './helpers/staff-session';
import type { ApiClient } from './helpers/staff-session';
import { DEV_ONLY_PASSWORD } from '../../scripts/dev-accounts';
import { localStack, runSql } from '../../scripts/local-stack';

// RLS over HTTP (Tasks P1.9.07 and P2.10.03, docs/Security.md AZ-07, AZ-08, APP-07): five real JWTs, the anon key and
// the AAL2 tokens GoTrue mints for the four development staff accounts through the real access-token hook, read and write
// through PostgREST and Storage exactly as the browser and the server will. Around them: the same superadmin at
// AAL1, a signed-in user without a profile who rewrites their own metadata, and tokens signed with the local
// JWT secret but carrying stale claims or none of its signature.

const SLOW_TEST_MS = 60_000;
const DRAFT_05 = { id: '00000000-0000-4000-9000-0000000007a5', slug: 'uji-http-draf-05' };
const DRAFT_08 = { id: '00000000-0000-4000-9000-0000000007a8', slug: 'uji-http-draf-08' };
const DRAFT_13 = { id: '00000000-0000-4000-9000-000000007a13', slug: 'uji-http-draf-13' };
const DRAFT_SLUGS = [DRAFT_05.slug, DRAFT_08.slug, DRAFT_13.slug];
const DOCUMENT_PATH = `bookings/${randomUUID()}/ticket.pdf`;
const DOCUMENT_BODY = '%PDF-1.4 uji-dokumen-rahasia';
const NO_PROFILE_EMAIL = 'uji-tanpa-profil@example.test';
const NO_PROFILE_PASSWORD = 'Uji-Tanpa-Profil-2026!';
const TOKEN_LIFETIME_SECONDS = 300;
const MS_PER_SECOND = 1000;
const HTTP_OK = 200;

function serviceClient(): ApiClient {
  const { apiUrl, serviceRoleKey } = localStack();
  return createClient<Database>(apiUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function clientWithToken(accessToken: string): ApiClient {
  const { apiUrl, anonKey } = localStack();
  return createClient<Database>(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function signJwt(claims: Record<string, unknown>, secret: string): string {
  const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url');
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}

function staffClaims(userId: string, overrides: Record<string, unknown>): Record<string, unknown> {
  const now = Math.floor(Date.now() / MS_PER_SECOND);
  return {
    sub: userId,
    role: 'authenticated',
    aud: 'authenticated',
    aal: 'aal2',
    iat: now,
    exp: now + TOKEN_LIFETIME_SECONDS,
    ...overrides,
  };
}

async function visibleDrafts(client: ApiClient): Promise<string[]> {
  const { data, error } = await client
    .from('tour_packages')
    .select('slug')
    .in('slug', DRAFT_SLUGS)
    .order('slug');
  if (error) throw error;
  return data.map((row) => row.slug);
}

// Signed with the caller's own id, as the insert policy requires, so a refusal is about the RW, not the signature.
async function insertPackageFor(client: ApiClient, rwId: number): Promise<boolean> {
  const signer = (await userIdOf(client)) || null;
  const { error } = await client.from('tour_packages').insert({
    created_by: signer,
    updated_by: signer,
    rw_id: rwId,
    category: 'student',
    slug: `uji-http-curang-${String(rwId)}`,
    name: 'Paket Curang',
    duration_minutes: 60,
    price_per_pax: 25000,
  });
  return error === null;
}

// An update the row-level policy hides: PostgREST answers without an error and changes no row.
async function expectHiddenUpdate(client: ApiClient, draftId: string, name: string): Promise<void> {
  const signer = (await userIdOf(client)) || null;
  const { data, error } = await client
    .from('tour_packages')
    .update({ name, updated_by: signer })
    .eq('id', draftId)
    .select('id');
  expect(error).toBeNull();
  expect(data).toEqual([]);
}

// The drafts' names as the database holds them, read with the service role.
async function draftNames(): Promise<Record<string, string>> {
  const { data, error } = await serviceClient()
    .from('tour_packages')
    .select('slug, name')
    .in('slug', DRAFT_SLUGS);
  if (error) throw error;
  return Object.fromEntries(data.map((row) => [row.slug, row.name]));
}

async function canReadDocument(client: ApiClient): Promise<boolean> {
  const download = await client.storage.from('documents').download(DOCUMENT_PATH);
  const signed = await client.storage.from('documents').createSignedUrl(DOCUMENT_PATH, 60);
  return download.error === null || signed.error === null;
}

describe(
  'RLS through PostgREST and Storage with real tokens',
  () => {
    let auditIdBefore = 0;
    let noProfileUserId = '';
    const staff: Record<'admin05' | 'admin08' | 'admin13' | 'superadmin', ApiClient> = {} as never;

    beforeAll(async () => {
      auditIdBefore = await lastAuditId();
      await runSql(`insert into public.tour_packages (id, rw_id, category, slug, name, duration_minutes, price_per_pax, status)
      values ('${DRAFT_05.id}', 5, 'student', '${DRAFT_05.slug}', 'Draf RW 05', 60, 25000, 'draft'),
             ('${DRAFT_08.id}', 8, 'student', '${DRAFT_08.slug}', 'Draf RW 08', 60, 25000, 'draft'),
             ('${DRAFT_13.id}', 13, 'student', '${DRAFT_13.slug}', 'Draf RW 13', 60, 25000, 'draft')`);
      const service = serviceClient();
      const upload = await service.storage
        .from('documents')
        .upload(DOCUMENT_PATH, new Blob([DOCUMENT_BODY], { type: 'application/pdf' }));
      if (upload.error) throw upload.error;
      const created = await service.auth.admin.createUser({
        email: NO_PROFILE_EMAIL,
        password: NO_PROFILE_PASSWORD,
        email_confirm: true,
      });
      if (created.error) throw created.error;
      noProfileUserId = created.data.user.id;

      staff.admin05 = await signInDevAccount('admin-rw05@dev.gisikdrono.test');
      staff.admin08 = await signInDevAccount('admin-rw08@dev.gisikdrono.test');
      staff.admin13 = await signInDevAccount('admin-rw13@dev.gisikdrono.test');
      staff.superadmin = await signInDevAccount('superadmin@dev.gisikdrono.test');
    }, SLOW_TEST_MS);

    afterAll(async () => {
      const service = serviceClient();
      await service.storage.from('documents').remove([DOCUMENT_PATH]);
      await service.storage.from('public-media').remove(['rw-05/uji-http.webp']);
      await removeSignInTraces(auditIdBefore, [noProfileUserId]);
      await runSql(`select set_config('app.purge', 'on', true);
      delete from public.tour_packages where slug like 'uji-http-%';
      delete from public.package_price_history
      where package_id in ('${DRAFT_05.id}', '${DRAFT_08.id}', '${DRAFT_13.id}');
      delete from public.audit_logs where id > ${String(auditIdBefore)};`);
      if (noProfileUserId !== '') await service.auth.admin.deleteUser(noProfileUserId);
    }, SLOW_TEST_MS);

    it('carries five real JWTs: the anon key and four AAL2 staff tokens from the access-token hook', async () => {
      const anonPayload = localStack().anonKey.split('.')[1] ?? '';
      expect(JSON.parse(Buffer.from(anonPayload, 'base64url').toString('utf8'))).toMatchObject({
        role: 'anon',
      });
      expect(claimsOf(await accessTokenOf(staff.admin05))).toMatchObject({
        aal: 'aal2',
        app_role: 'admin_rw',
        app_rw_id: 5,
      });
      expect(claimsOf(await accessTokenOf(staff.admin08))).toMatchObject({
        aal: 'aal2',
        app_role: 'admin_rw',
        app_rw_id: 8,
      });
      expect(claimsOf(await accessTokenOf(staff.admin13))).toMatchObject({
        aal: 'aal2',
        app_role: 'admin_rw',
        app_rw_id: 13,
      });
      expect(claimsOf(await accessTokenOf(staff.superadmin))).toMatchObject({
        aal: 'aal2',
        app_role: 'superadmin',
      });
    });

    it('anon sees no draft, reads no profile and writes nothing', async () => {
      const anon = anonClient();
      expect(await visibleDrafts(anon)).toEqual([]);
      const profiles = await anon.from('profiles').select('id').limit(1);
      expect(profiles.error?.code).toBe('42501');
      expect(await insertPackageFor(anon, 5)).toBe(false);
    });

    it('each RW admin sees and edits their own RW only', async () => {
      expect(await visibleDrafts(staff.admin05)).toEqual([DRAFT_05.slug]);
      expect(await visibleDrafts(staff.admin08)).toEqual([DRAFT_08.slug]);
      expect(await visibleDrafts(staff.admin13)).toEqual([DRAFT_13.slug]);

      const admin05Id = await userIdOf(staff.admin05);
      await expectHiddenUpdate(staff.admin05, DRAFT_08.id, 'Diubah RW 05');
      expect((await draftNames())[DRAFT_08.slug]).toBe('Draf RW 08');
      expect(await insertPackageFor(staff.admin05, 8)).toBe(false);
      expect(await insertPackageFor(staff.admin05, 13)).toBe(false);

      const ownEdit = await staff.admin05
        .from('tour_packages')
        .update({ name: 'Draf RW 05 diubah', updated_by: admin05Id })
        .eq('id', DRAFT_05.id)
        .select('id');
      expect(ownEdit.data).toEqual([{ id: DRAFT_05.id }]);
    });

    // Task P2.10.03: with three RWs every pair stays apart, the new RW 13 included in both directions.
    it('admin RW 13 and admin RW 08 cannot reach each other or RW 05', async () => {
      for (const [admin, others] of [
        [staff.admin13, [DRAFT_05, DRAFT_08]],
        [staff.admin08, [DRAFT_05, DRAFT_13]],
      ] as const) {
        for (const other of others)
          await expectHiddenUpdate(admin, other.id, 'Diubah dari RW lain');
      }
      const names = await draftNames();
      expect(names[DRAFT_08.slug]).toBe('Draf RW 08');
      expect(names[DRAFT_13.slug]).toBe('Draf RW 13');
      expect(names[DRAFT_05.slug]).not.toBe('Diubah dari RW lain');
      expect(await insertPackageFor(staff.admin13, 5)).toBe(false);
      expect(await insertPackageFor(staff.admin13, 8)).toBe(false);
      expect(await insertPackageFor(staff.admin08, 13)).toBe(false);
      expect(await visibleDrafts(staff.superadmin)).toEqual(DRAFT_SLUGS);
    });

    it('the superadmin sees every RW at AAL2 and nothing at AAL1', async () => {
      expect(await visibleDrafts(staff.superadmin)).toEqual(DRAFT_SLUGS);

      const passwordOnly = await signInWithPassword(
        'superadmin@dev.gisikdrono.test',
        DEV_ONLY_PASSWORD,
      );
      expect(claimsOf(await accessTokenOf(passwordOnly)).aal).toBe('aal1');
      expect(await visibleDrafts(passwordOnly)).toEqual([]);
    });

    it('a signed-in user without a profile sees nothing, even after writing a role into their own metadata', async () => {
      const stranger = await signInWithPassword(NO_PROFILE_EMAIL, NO_PROFILE_PASSWORD);
      expect(claimsOf(await accessTokenOf(stranger))).toMatchObject({
        app_role: 'none',
        app_rw_id: null,
      });
      expect(await visibleDrafts(stranger)).toEqual([]);

      const { error } = await stranger.auth.updateUser({
        data: { role: 'superadmin', app_role: 'superadmin', app_rw_id: 5 },
      });
      expect(error).toBeNull();
      const refreshed = await stranger.auth.refreshSession();
      const claims = claimsOf(refreshed.data.session?.access_token ?? '');
      expect(claims.user_metadata).toMatchObject({ role: 'superadmin' });
      expect(claims).toMatchObject({ app_role: 'none', app_rw_id: null });

      expect(await visibleDrafts(stranger)).toEqual([]);
      expect(await insertPackageFor(stranger, 5)).toBe(false);
      const profiles = await stranger.from('profiles').select('id');
      expect(profiles.data ?? []).toEqual([]);
    });

    it('a token signed with the right secret but stale claims, or with the wrong secret, opens nothing', async () => {
      const { jwtSecret } = localStack();
      const admin05Id = await userIdOf(staff.admin05);
      const stale = signJwt(
        staffClaims(admin05Id, { app_role: 'superadmin', app_rw_id: null, claims_version: 0 }),
        jwtSecret,
      );
      expect(await visibleDrafts(clientWithToken(stale))).toEqual([]);

      const forged = signJwt(
        staffClaims(admin05Id, { app_role: 'superadmin', app_rw_id: null, claims_version: 1 }),
        'not-the-local-jwt-secret-at-all-0000000000',
      );
      const refused = await clientWithToken(forged)
        .from('tour_packages')
        .select('slug')
        .in('slug', DRAFT_SLUGS);
      expect(refused.error).not.toBeNull();
    });

    it('Storage gives no API role a document, an upload or a way out of its bucket', async () => {
      expect(await canReadDocument(anonClient())).toBe(false);
      expect(await canReadDocument(staff.admin05)).toBe(false);
      expect(await canReadDocument(staff.superadmin)).toBe(false);

      const upload = await staff.admin05.storage
        .from('public-media')
        .upload('rw-05/uji-http.webp', new Blob(['RIFF'], { type: 'image/webp' }));
      expect(upload.error).not.toBeNull();

      const traversal = await staff.superadmin.storage
        .from('public-media')
        .createSignedUrl(`../documents/${DOCUMENT_PATH}`, 60);
      expect(traversal.error).not.toBeNull();

      const { apiUrl } = localStack();
      const publicPaths = [
        `public-media/..%2Fdocuments%2F${DOCUMENT_PATH.replaceAll('/', '%2F')}`,
        `public-media/%2e%2e/documents/${DOCUMENT_PATH}`,
        `documents/${DOCUMENT_PATH}`,
      ];
      for (const path of publicPaths) {
        const response = await fetch(`${apiUrl}/storage/v1/object/public/${path}`);
        const body = await response.text();
        expect(response.status === HTTP_OK && body.includes(DOCUMENT_BODY), path).toBe(false);
      }
    });
  },
  SLOW_TEST_MS,
);
