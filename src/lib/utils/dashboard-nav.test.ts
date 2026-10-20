import { describe, expect, it } from 'vitest';

import { dashboardNavFor, nestedHrefs } from '@/lib/utils/dashboard-nav';

const titles = (groups: ReturnType<typeof dashboardNavFor>) => groups.map((group) => group.title);
const labels = (groups: ReturnType<typeof dashboardNavFor>) =>
  groups.flatMap((group) => group.items.map((item) => item.label));

describe('dashboardNavFor', () => {
  it('gives the superadmin every group of docs/StyleGuide.md §6.2', () => {
    expect(titles(dashboardNavFor('superadmin', null))).toEqual([
      'Ringkasan',
      'Operasional',
      'Konten',
      'Katalog',
      'Moderasi',
      'Keuangan',
      'Administrasi',
    ]);
    expect(labels(dashboardNavFor('superadmin', null))).toContain('Jadwal Pertunjukan');
  });

  it('gives an RW officer the four RW groups, and leaves out the empty ones', () => {
    const rw05 = dashboardNavFor('admin_rw', 5);

    expect(titles(rw05)).toEqual(['Ringkasan', 'Operasional', 'Konten', 'Katalog']);
    expect(labels(rw05)).not.toContain('Pengguna');
    expect(labels(rw05)).not.toContain('Ulasan');
  });

  it('shows the performance schedule to RW 08 only', () => {
    expect(labels(dashboardNavFor('admin_rw', 5))).not.toContain('Jadwal Pertunjukan');
    expect(labels(dashboardNavFor('admin_rw', 8))).toContain('Jadwal Pertunjukan');
  });
});

describe('nestedHrefs', () => {
  const all = [
    '/dashboard',
    '/dashboard/settings',
    '/dashboard/settings/hero-banners',
    '/dashboard/sessions',
  ];

  it('lists the items below an item, never a look-alike prefix', () => {
    expect(nestedHrefs('/dashboard/settings', all)).toEqual(['/dashboard/settings/hero-banners']);
    expect(nestedHrefs('/dashboard/sessions', all)).toEqual([]);
  });
});
