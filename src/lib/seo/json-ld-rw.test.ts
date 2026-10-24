import { describe, expect, it } from 'vitest';

import { rwAttractionJsonLd } from './json-ld';
import { sandboxEnv } from '../../../tests/fixtures/env';

// The RW pages' TouristAttraction, apart from json-ld.test.ts so each file stays within the line limit.

const site = sandboxEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');

describe('rwAttractionJsonLd', () => {
  const unit = {
    id: 5,
    label: 'RW 05',
    slug: 'rw-05-ecowastreme',
    path: '/rw-05-ecowastreme',
    name: 'RW 05 Ecowastreme',
    shortName: 'Ecowastreme',
    accentKey: 'leaf',
    iconKey: 'recycle',
    scheduleEnabled: false,
    productsHeading: null,
    themeLabel: 'Ekowisata & Lingkungan',
    tagline: 'Belajar memilah, mengompos dan menanam di kampung tanpa sampah',
    descriptionMd: null,
    visionMd: null,
    heroImage: null,
    contactPhone: null,
    contactEmail: null,
    mapLat: null,
    mapLng: null,
  } as const;

  it('describes an RW with its tagline and page, inside the kelurahan', () => {
    expect(rwAttractionJsonLd(unit)).toMatchObject({
      '@type': 'TouristAttraction',
      name: 'RW 05 Ecowastreme',
      description: unit.tagline,
      url: `${site}/rw-05-ecowastreme`,
      image: undefined,
      containedInPlace: { '@type': 'AdministrativeArea', name: 'Kelurahan Gisikdrono' },
    });
  });

  it('gives the full-size public URL of its photo', () => {
    const withPhoto = {
      ...unit,
      heroImage: {
        path: 'rw-05/gallery/a.webp',
        alt: 'Foto',
        width: 1600,
        height: 1200,
        placeholderColour: null,
      },
    };

    expect(rwAttractionJsonLd(withPhoto).image).toEqual([
      `${sandboxEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/public-media/rw-05/gallery/a.webp`,
    ]);
  });
});
