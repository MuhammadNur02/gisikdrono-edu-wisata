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

  it('gives an RW officer the RW groups, and leaves out the empty ones', () => {
    const rw05 = dashboardNavFor('admin_rw', { scheduleEnabled: false });

    expect(titles(rw05)).toEqual(['Ringkasan', 'Operasional', 'Konten', 'Katalog', 'Keuangan']);
    expect(labels(rw05)).not.toContain('Pengguna');
    expect(labels(rw05)).not.toContain('Ulasan');
  });

  it('gives an RW officer their own recap and no other finance page (docs/PRD.md §13.1 A26)', () => {
    const finance = dashboardNavFor('admin_rw', null).find((group) => group.title === 'Keuangan');
    expect(finance?.items.map((item) => item.label)).toEqual(['Rekap']);
  });

  it('shows the performance schedule only to an officer whose RW runs one', () => {
    expect(labels(dashboardNavFor('admin_rw', { scheduleEnabled: false }))).not.toContain(
      'Jadwal Pertunjukan',
    );
    expect(labels(dashboardNavFor('admin_rw', { scheduleEnabled: true }))).toContain(
      'Jadwal Pertunjukan',
    );
    expect(labels(dashboardNavFor('admin_rw', null))).not.toContain('Jadwal Pertunjukan');
  });

  // docs/PRD.md §13.1 A30: the Koperasi Merah Putih's admin runs UMKM only.
  it('gives the Kopdes admin the overview and the UMKM catalogue, nothing of the edu-wisata side', () => {
    const kopdes = dashboardNavFor('admin_kopdes', null);
    expect(titles(kopdes)).toEqual(['Ringkasan', 'Katalog']);
    expect(kopdes.flatMap((group) => group.items.map((item) => [item.label, item.href]))).toEqual([
      ['Dasbor', '/dashboard'],
      ['Produk UMKM', '/dashboard/products'],
      ['Penjual UMKM', '/dashboard/products?penjual=buka'],
      ['Pengaturan Katalog', '/dashboard/settings'],
    ]);
  });

  it('keeps the Kopdes items out of the menus of the other roles', () => {
    for (const role of ['superadmin', 'admin_rw'] as const) {
      expect(labels(dashboardNavFor(role, null))).not.toContain('Penjual UMKM');
      expect(labels(dashboardNavFor(role, null))).not.toContain('Pengaturan Katalog');
    }
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
