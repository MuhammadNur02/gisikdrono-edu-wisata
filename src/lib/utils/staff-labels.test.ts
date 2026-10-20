import { describe, expect, it } from 'vitest';

import { staffRoleLabel, staffRwId } from '@/lib/utils/staff-labels';

describe('staff labels', () => {
  it('names the role with the RW it works for', () => {
    expect(staffRoleLabel(staffRwId(5))).toBe('Admin RW 05');
    expect(staffRoleLabel(staffRwId(null))).toBe('Superadmin Kelurahan');
  });

  it('knows only the RWs of the config', () => {
    expect(staffRwId(7)).toBeNull();
  });
});
