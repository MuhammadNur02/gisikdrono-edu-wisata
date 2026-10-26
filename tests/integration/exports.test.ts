import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { POST } from '@/app/api/export/[kind]/route';
import type { Database } from '@/db/types';

import {
  lastAuditId,
  removeSignInTraces,
  signInDevAccount,
  userIdOf,
  type ApiClient,
} from './helpers/staff-session';
import { localStack, runSql } from '../../scripts/local-stack';

// POST /api/export/[kind] for an RW admin (Task P5.1.02; docs/Security.md §7.5, DATA-06, STAFF-02): the route answers
// 403 for every kind but attendance before it reads the body, with a real AAL2 session of the development RW 05
// admin standing in for the cookie session, and rpc_create_export refuses the same in the database when the session
// goes to it directly. Neither leaves an exports row.

const ADMIN_RW05 = 'admin-rw05@dev.gisikdrono.test';
const SITE = 'http://localhost:3000';
const FORBIDDEN = 403;
const REFUSED_KINDS = ['visits', 'finance', 'audit'] as const;

// The signed-in client the route's createSupabaseServerClient hands out, set once the account has signed in.
const current = vi.hoisted(() => ({ session: null as ApiClient | null }));

// The route's module graph reaches the service-role client, whose React taint call needs Next's runtime; the
// suites hand it the local stack's client instead, as every other suite here does.
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () =>
    createClient<Database>(localStack().apiUrl, localStack().serviceRoleKey, {
      auth: { persistSession: false },
    }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => {
    if (!current.session) throw new Error('no staff session for this request');
    return Promise.resolve(current.session);
  },
}));

// A body exportRequestSchema takes, unless one is given.
const VALID_BODY = {
  format: 'csv',
  from: '2026-10-01',
  to: '2026-10-31',
  purpose: 'Rekap bulanan untuk rapat RW',
};

function exportRequest(kind: string, body: unknown = VALID_BODY): Request {
  return new Request(`${SITE}/api/export/${kind}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SITE },
    body: JSON.stringify(body),
  });
}

const postExport = (kind: string, body?: unknown) =>
  POST(exportRequest(kind, body), { params: Promise.resolve({ kind }) });

async function exportsBy(userId: string): Promise<number> {
  const rows = z
    .array(z.object({ count: z.coerce.number() }))
    .parse(await runSql(`select count(*) from public.exports where requested_by = '${userId}'`));
  return rows[0]?.count ?? -1;
}

let auditIdBefore = 0;
let adminId = '';

beforeAll(async () => {
  auditIdBefore = await lastAuditId();
  current.session = await signInDevAccount(ADMIN_RW05);
  adminId = await userIdOf(current.session);
});

// The attendance export of the positive control: its file in the documents bucket, then its row.
afterAll(async () => {
  current.session = null;
  const files = z.array(z.object({ path: z.string() })).parse(
    await runSql(`select storage_path as path from public.exports
      where requested_by = '${adminId}' and storage_path is not null and created_at > now() - interval '1 hour'`),
  );
  if (files.length > 0) {
    await createClient<Database>(localStack().apiUrl, localStack().serviceRoleKey, {
      auth: { persistSession: false },
    })
      .storage.from('documents')
      .remove(files.map((file) => file.path));
  }
  await runSql(`select set_config('app.purge', 'on', true);
    delete from public.exports where requested_by = '${adminId}' and created_at > now() - interval '1 hour';`);
  await removeSignInTraces(auditIdBefore);
});

describe('an export asked for by an RW admin', () => {
  it('is refused with 403 for visits, finance and audit, and leaves no export behind', async () => {
    const before = await exportsBy(adminId);
    for (const kind of REFUSED_KINDS) {
      const response = await postExport(kind);
      expect(response.status).toBe(FORBIDDEN);
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error: { code: 'FORBIDDEN' },
      });
    }
    expect(await exportsBy(adminId)).toBe(before);
  });

  it('is refused before its body is read, so a broken body gets the same 403', async () => {
    const response = await postExport('visits', { format: 'csv', unexpected: true });
    expect(response.status).toBe(FORBIDDEN);
  });

  // The positive control (review of PR #84, L-4): the same session exports its own RW's attendance.
  it('goes through for attendance, the one kind an RW admin exports', async () => {
    const response = await postExport('attendance');
    expect(response.status).not.toBe(FORBIDDEN);
    expect(response.status).toBe(200);
  });

  it('is refused by rpc_create_export too when the session calls it directly', async () => {
    const session = current.session;
    if (!session) throw new Error('signed out');
    const before = await exportsBy(adminId);
    for (const kind of REFUSED_KINDS) {
      const { error } = await session.rpc('rpc_create_export', {
        p_kind: kind,
        p_format: 'csv',
        p_filters: { from: '2026-10-01', to: '2026-10-31' },
        p_reason: 'Rekap bulanan untuk rapat RW',
      });
      expect(error?.code).toBe('42501');
    }
    expect(await exportsBy(adminId)).toBe(before);
  });
});
