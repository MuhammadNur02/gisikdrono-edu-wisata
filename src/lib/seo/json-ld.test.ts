import { describe, expect, it } from 'vitest';

import {
  aggregateRatingJsonLd,
  articleJsonLd,
  breadcrumbListJsonLd,
  digitalDocumentJsonLd,
  eventJsonLd,
  governmentOrganizationJsonLd,
  imageGalleryJsonLd,
  offerJsonLd,
  productJsonLd,
  reviewJsonLd,
  rwAttractionJsonLd,
  serializeJsonLd,
  touristAttractionJsonLd,
  webSiteJsonLd,
} from './json-ld';
import { sandboxEnv } from '../../../tests/fixtures/env';

const site = sandboxEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');

describe('organisation and website', () => {
  it('describes the kelurahan as a government organisation in Kota Semarang', () => {
    expect(governmentOrganizationJsonLd()).toEqual({
      '@type': 'GovernmentOrganization',
      '@id': `${site}/#organisasi`,
      name: 'Kelurahan Gisikdrono',
      url: sandboxEnv.NEXT_PUBLIC_SITE_URL,
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Kota Semarang',
        addressRegion: 'Jawa Tengah',
        addressCountry: 'ID',
      },
    });
  });

  it('names the kelurahan as publisher of the website', () => {
    expect(webSiteJsonLd()).toMatchObject({
      '@type': 'WebSite',
      name: 'Edu Wisata Gisikdrono',
      inLanguage: 'id',
      publisher: { '@id': `${site}/#organisasi` },
    });
  });
});

describe('places and events', () => {
  it('places an RW inside the kelurahan', () => {
    const attraction = touristAttractionJsonLd({
      name: 'RW 05 Ecowastreme',
      path: '/rw-05-ecowastreme',
    });
    expect(attraction).toMatchObject({
      '@type': 'TouristAttraction',
      url: `${site}/rw-05-ecowastreme`,
      containedInPlace: { '@type': 'AdministrativeArea', name: 'Kelurahan Gisikdrono' },
    });
    expect(attraction.image).toBeUndefined();
  });

  it('marks a performance as an on-site event organised by the kelurahan', () => {
    expect(
      eventJsonLd({
        name: 'Pentas tari',
        path: '/rw-08-kampung-seni-budaya/jadwal',
        startDate: '2026-10-18T09:00:00+07:00',
        locationName: 'Panggung RW 08',
      }),
    ).toMatchObject({
      '@type': 'Event',
      startDate: '2026-10-18T09:00:00+07:00',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@type': 'Place', name: 'Panggung RW 08' },
      organizer: { '@id': `${site}/#organisasi` },
    });
  });
});

describe('products and offers', () => {
  it('prices an offer in whole rupiah', () => {
    expect(offerJsonLd({ priceIdr: 25000, path: '/produk/kompos', isAvailable: false })).toEqual({
      '@type': 'Offer',
      price: '25000',
      priceCurrency: 'IDR',
      url: `${site}/produk/kompos`,
      availability: 'https://schema.org/SoldOut',
    });
  });

  it('names the UMKM as brand only when there is one', () => {
    const offer = { priceIdr: 15000, path: '/produk/kompos', isAvailable: true };
    const product = productJsonLd({
      name: 'Kompos',
      path: '/produk/kompos',
      brandName: 'UMKM Contoh',
      offer,
    });
    expect(product.brand).toEqual({ '@type': 'Brand', name: 'UMKM Contoh' });
    expect(product.offers).toMatchObject({ availability: 'https://schema.org/InStock' });
    expect(productJsonLd({ name: 'Paket', path: '/paket-wisata/x', offer }).brand).toBeUndefined();
  });
});

describe('articles, reviews and documents', () => {
  it('falls back to the publication date when an article was never edited', () => {
    expect(
      articleJsonLd({ headline: 'Kabar', path: '/artikel/kabar', datePublished: '2026-10-01' }),
    ).toMatchObject({ dateModified: '2026-10-01', publisher: { '@id': `${site}/#organisasi` } });
  });

  it('scores reviews and their aggregate on a 1 to 5 scale', () => {
    expect(
      reviewJsonLd({
        rating: 4,
        body: 'Seru',
        authorName: 'Pengunjung',
        datePublished: '2026-10-01',
      }).reviewRating,
    ).toEqual({ '@type': 'Rating', ratingValue: 4, bestRating: 5, worstRating: 1 });
    expect(aggregateRatingJsonLd({ averageRating: 4.5, reviewCount: 2 })).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 4.5,
      reviewCount: 2,
      bestRating: 5,
      worstRating: 1,
    });
  });

  it('points a booklet at its download route as a PDF', () => {
    expect(
      digitalDocumentJsonLd({
        name: 'E-booklet RW 05',
        path: '/e-booklet/rw-05',
        downloadPath: '/api/documents/booklet/abc',
      }),
    ).toMatchObject({
      encoding: {
        '@type': 'MediaObject',
        contentUrl: `${site}/api/documents/booklet/abc`,
        encodingFormat: 'application/pdf',
      },
    });
  });
});

describe('lists', () => {
  it('numbers breadcrumbs from 1 with absolute URLs', () => {
    expect(
      breadcrumbListJsonLd([
        { name: 'Beranda', path: '/' },
        { name: 'Paket wisata', path: '/paket-wisata' },
      ]).itemListElement,
    ).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Beranda', item: `${site}/` },
      { '@type': 'ListItem', position: 2, name: 'Paket wisata', item: `${site}/paket-wisata` },
    ]);
  });

  it('keeps the caption with every gallery image', () => {
    expect(
      imageGalleryJsonLd({
        name: 'Galeri',
        path: '/galeri',
        images: [{ url: 'https://example.test/a.webp', caption: 'Bank Sampah RW 05' }],
      }).associatedMedia,
    ).toEqual([
      {
        '@type': 'ImageObject',
        contentUrl: 'https://example.test/a.webp',
        caption: 'Bank Sampah RW 05',
      },
    ]);
  });
});

describe('serializeJsonLd', () => {
  it('adds the schema.org context to a single node', () => {
    expect(JSON.parse(serializeJsonLd(webSiteJsonLd()))).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
    });
  });

  it('puts several nodes into one graph', () => {
    const parsed: unknown = JSON.parse(
      serializeJsonLd([governmentOrganizationJsonLd(), webSiteJsonLd()]),
    );
    expect(parsed).toMatchObject({
      '@context': 'https://schema.org',
      '@graph': [{ '@type': 'GovernmentOrganization' }, { '@type': 'WebSite' }],
    });
  });

  it('never lets CMS text close the script tag, yet parses back to the same text', () => {
    const output = serializeJsonLd(
      articleJsonLd({
        headline: 'Judul </script><script>alert(1)</script>',
        path: '/artikel/x',
        datePublished: '2026-10-01',
      }),
    );
    expect(output).not.toContain('<');
    expect(JSON.parse(output)).toMatchObject({
      headline: 'Judul </script><script>alert(1)</script>',
    });
  });
});

describe('rwAttractionJsonLd', () => {
  const unit = {
    id: 5,
    code: 'RW05',
    slug: 'rw-05-ecowastreme',
    name: 'RW 05 Ecowastreme',
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
