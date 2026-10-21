import { describe, expect, it } from 'vitest';

import type { RwUnitSummary } from '@/types/rw-unit';

import { HOME_RW_SECTION_ID, isCurrentNavItem, publicNavFor } from './nav';

function unit(
  id: number,
  slug: string,
  shortName: string,
  scheduleEnabled: boolean,
): RwUnitSummary {
  const label = `RW ${String(id).padStart(2, '0')}`;
  return {
    id,
    label,
    accentKey: 'leaf',
    name: `${label} ${shortName}`,
    shortName,
    slug,
    path: `/${slug}`,
    iconKey: 'recycle',
    scheduleEnabled,
  };
}

const UNITS = [
  unit(5, 'rw-05-ecowastreme', 'Ecowastreme', false),
  unit(13, 'rw-13-kampung-budaya-seni', 'Kampung Budaya & Seni', true),
  unit(8, 'rw-08-inklusif-ramah-anak', 'Kampung Inklusif & Ramah Anak', false),
];

describe('publicNavFor', () => {
  // Decision of 2026-10-22: seven links with the RW names did not fit the 1280 px header.
  it('gives the desktop header five links, the RWs behind one link to the home page section', () => {
    const { headerItems } = publicNavFor(UNITS);
    expect(headerItems.map((item) => [item.label, item.href])).toEqual([
      ['Kampung Wisata', `/#${HOME_RW_SECTION_ID}`],
      ['Paket wisata', '/paket-wisata'],
      ['Produk UMKM', '/produk'],
      ['Galeri', '/galeri'],
      ['Peta & kontak', '/peta-kontak'],
    ]);
    expect(headerItems[0]?.currentOn).toEqual([
      '/rw-05-ecowastreme',
      '/rw-13-kampung-budaya-seni',
      '/rw-08-inklusif-ramah-anak',
    ]);
  });

  it('keeps a direct link to every RW, and the schedule of the RW that runs one, in the menu groups', () => {
    const [kampung] = publicNavFor(UNITS).groups;
    expect(kampung?.items.map((item) => item.href)).toEqual([
      '/rw-05-ecowastreme',
      '/rw-13-kampung-budaya-seni',
      '/rw-08-inklusif-ramah-anak',
      '/rw-13-kampung-budaya-seni/jadwal',
    ]);
    expect(kampung?.items[1]?.rw).toEqual({
      label: 'RW 13',
      shortName: 'Kampung Budaya & Seni',
      accentKey: 'leaf',
    });
  });
});

describe('isCurrentNavItem', () => {
  const [kampung, packages] = publicNavFor(UNITS).headerItems;

  it('marks the RW section link on every RW page and the pages below them', () => {
    if (!kampung) throw new Error('no Kampung Wisata link');
    expect(isCurrentNavItem(kampung, '/rw-05-ecowastreme')).toBe(true);
    expect(isCurrentNavItem(kampung, '/rw-13-kampung-budaya-seni/jadwal')).toBe(true);
    expect(isCurrentNavItem(kampung, '/')).toBe(false);
    expect(isCurrentNavItem(kampung, '/paket-wisata')).toBe(false);
  });

  it('marks any other link on its own page and below', () => {
    if (!packages) throw new Error('no Paket wisata link');
    expect(isCurrentNavItem(packages, '/paket-wisata/paket-eduwisata-ecowastreme')).toBe(true);
    expect(isCurrentNavItem(packages, '/produk')).toBe(false);
  });
});
