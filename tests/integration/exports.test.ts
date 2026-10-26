import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { POST } from '@/app/api/export/[kind]/route';

import {
  lastAuditId,
  removeSignInTraces,
  signInDevAccount,
  userIdOf,
  type ApiClient,
} from './helpers/staff-session';
import { runSql } from '../../scripts/local-stack';

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

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => {
    if (!current.session) throw new Error('no staff session for this request');
    return Promise.resolve(current.session);
  },
}));

function exportRequest(kind: string): Request {
  return new Request(`${SITE}/api/export/${kind}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SITE },
    body: JSON.stringify({
      format: 'csv',
      from: '2026-10-01',
      to: '2026-10-31',
      reason: 'Rekap bulanan untuk rapat RW',
    }),
  });
}

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

afterAll(async () => {
  current.session = null;
  await removeSignInTraces(auditIdBefore);
});

describe('an export asked for by an RW admin', () => {
  it('is refused with 403 for visits, finance and audit, and leaves no export behind', async () => {
    const before = await exportsBy(adminId);
    for (const kind of REFUSED_KINDS) {
      const response = await POST(exportRequest(kind), { params: Promise.resolve({ kind }) });
      expect(response.status).toBe(FORBIDDEN);
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error: { code: 'FORBIDDEN' },
      });
    }
    expect(await exportsBy(adminId)).toBe(before);
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
