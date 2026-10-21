import { describe, expect, it } from 'vitest';

import { staffRoleLabel } from '@/lib/utils/staff-labels';

describe('staff labels', () => {
  it('names the role with the RW it works for', () => {
    expect(staffRoleLabel(5)).toBe('Admin RW 05');
    expect(staffRoleLabel(13)).toBe('Admin RW 13');
    expect(staffRoleLabel(null)).toBe('Superadmin Kelurahan');
  });
});
