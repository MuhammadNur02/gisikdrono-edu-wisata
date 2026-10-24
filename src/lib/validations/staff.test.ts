import { describe, expect, it } from 'vitest';

import {
  cancelPromotionSchema,
  inviteStaffFormSchema,
  inviteStaffSchema,
  revokeInviteSchema,
  setStaffRoleFormSchema,
  setStaffRoleSchema,
  setStaffStatusFormSchema,
  setStaffStatusSchema,
} from './staff';

const USER_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';

function issuePaths(result: { error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.error?.issues.map((issue) => issue.path.join('.')) ?? [];
}

describe('inviteStaffSchema', () => {
  it('takes an RW admin with an RW and lower-cases the address', () => {
    const parsed = inviteStaffSchema.parse({
      email: ' Petugas.RW05@Gisikdrono.ID ',
      role: 'admin_rw',
      rwId: 5,
    });
    expect(parsed).toEqual({ email: 'petugas.rw05@gisikdrono.id', role: 'admin_rw', rwId: 5 });
  });

  it('takes a superadmin without an RW', () => {
    expect(
      inviteStaffSchema.safeParse({ email: 'a@b.id', role: 'superadmin', rwId: null }).success,
    ).toBe(true);
  });

  it('refuses an RW admin without an RW and a superadmin with one', () => {
    expect(
      issuePaths(inviteStaffSchema.safeParse({ email: 'a@b.id', role: 'admin_rw', rwId: null })),
    ).toEqual(['rwId']);
    expect(
      issuePaths(inviteStaffSchema.safeParse({ email: 'a@b.id', role: 'superadmin', rwId: 8 })),
    ).toEqual(['rwId']);
  });

  it("never invites to the role 'none', and refuses an unknown field", () => {
    expect(inviteStaffSchema.safeParse({ email: 'a@b.id', role: 'none', rwId: null }).success).toBe(
      false,
    );
    expect(
      inviteStaffSchema.safeParse({ email: 'a@b.id', role: 'admin_rw', rwId: 5, inviteCode: 'X' })
        .success,
    ).toBe(false);
  });

  it('refuses an address that is not one', () => {
    expect(
      issuePaths(inviteStaffSchema.safeParse({ email: 'petugas', role: 'admin_rw', rwId: 5 })),
    ).toEqual(['email']);
  });
});

describe('setStaffRoleSchema', () => {
  it('takes a move to another RW', () => {
    expect(setStaffRoleSchema.parse({ userId: USER_ID, role: 'admin_rw', rwId: 8 })).toEqual({
      userId: USER_ID,
      role: 'admin_rw',
      rwId: 8,
    });
  });

  it('refuses a missing RW, a bad id and an extra field', () => {
    expect(
      setStaffRoleSchema.safeParse({ userId: USER_ID, role: 'admin_rw', rwId: null }).success,
    ).toBe(false);
    expect(
      setStaffRoleSchema.safeParse({ userId: 'me', role: 'superadmin', rwId: null }).success,
    ).toBe(false);
    expect(
      setStaffRoleSchema.safeParse({ userId: USER_ID, role: 'superadmin', rwId: null, force: true })
        .success,
    ).toBe(false);
  });
});

describe('setStaffStatusSchema', () => {
  const base = { userId: USER_ID, isActive: false, reason: 'Pindah tugas ke kecamatan' };

  it('takes a reason of 3 to 300 characters, trimmed', () => {
    expect(setStaffStatusSchema.parse({ ...base, reason: '  Cuti panjang  ' }).reason).toBe(
      'Cuti panjang',
    );
  });

  it('refuses a reason too short or too long', () => {
    expect(issuePaths(setStaffStatusSchema.safeParse({ ...base, reason: 'ok' }))).toEqual([
      'reason',
    ]);
    expect(
      issuePaths(setStaffStatusSchema.safeParse({ ...base, reason: 'a'.repeat(301) })),
    ).toEqual(['reason']);
  });

  it('refuses a phone number or a link in the reason, which lands in the audit log', () => {
    expect(
      issuePaths(setStaffStatusSchema.safeParse({ ...base, reason: 'Hubungi 0812 3456 7890' })),
    ).toEqual(['reason']);
    expect(
      issuePaths(setStaffStatusSchema.safeParse({ ...base, reason: 'lihat https://x.id' })),
    ).toEqual(['reason']);
  });

  it('needs a boolean status', () => {
    expect(setStaffStatusSchema.safeParse({ ...base, isActive: 'false' }).success).toBe(false);
  });
});

describe('cancelPromotionSchema and revokeInviteSchema', () => {
  it('take one id and nothing else', () => {
    expect(cancelPromotionSchema.safeParse({ userId: USER_ID }).success).toBe(true);
    expect(cancelPromotionSchema.safeParse({ userId: USER_ID, role: 'none' }).success).toBe(false);
    expect(revokeInviteSchema.safeParse({ inviteId: USER_ID }).success).toBe(true);
    expect(revokeInviteSchema.safeParse({ inviteId: 'abc' }).success).toBe(false);
  });
});

describe('the form schemas', () => {
  it('carry the six-digit authenticator code next to the fields', () => {
    const invite = { email: 'a@b.id', role: 'admin_rw', rwId: 5 };
    expect(inviteStaffFormSchema.safeParse({ ...invite, code: '123456' }).success).toBe(true);
    expect(inviteStaffFormSchema.safeParse({ ...invite, code: '12345' }).success).toBe(false);
    const role = { userId: USER_ID, role: 'admin_rw', rwId: null, code: '123456' };
    expect(setStaffRoleFormSchema.safeParse(role).success).toBe(false);
    const status = { userId: USER_ID, isActive: true, reason: 'Kembali', code: '123456' };
    expect(setStaffStatusFormSchema.safeParse(status).success).toBe(true);
  });
});
