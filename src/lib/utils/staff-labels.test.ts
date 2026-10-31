import { describe, expect, it } from 'vitest';

import { staffRoleLabel } from '@/lib/utils/staff-labels';

describe('staff labels', () => {
  it('names the role with the RW it works for', () => {
    expect(staffRoleLabel('admin_rw', 5)).toBe('Admin RW 05');
    expect(staffRoleLabel('admin_rw', 13)).toBe('Admin RW 13');
    expect(staffRoleLabel('superadmin', null)).toBe('Superadmin Kelurahan');
  });

  it('names the Koperasi Merah Putih admin, who works for no RW (docs/PRD.md §13.1 A30)', () => {
    expect(staffRoleLabel('admin_kopdes', null)).toBe('Admin Kopdes');
  });
});
