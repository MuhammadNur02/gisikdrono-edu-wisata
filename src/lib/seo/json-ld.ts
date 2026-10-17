import type {
  AggregateRating,
  Article,
  BreadcrumbList,
  DigitalDocument,
  Event,
  GovernmentOrganization,
  ImageGallery,
  Offer,
  PostalAddress,
  Product,
  Review,
  Thing,
  TouristAttraction,
  WebSite,
} from 'schema-dts';

import { siteConfig } from '@/config/site';
import { absoluteUrl } from '@/lib/seo/metadata';

// Typed schema.org builders (docs/PRD.md NFR-03). They take plain DTO fields and return nodes without
// @context; serializeJsonLd adds it once, so a page can put several nodes in one @graph.

type Node<T> = Exclude<T, string>;
export type JsonLdNode = Node<Thing>;

const SCHEMA_CONTEXT = 'https://schema.org';
const PRICE_CURRENCY = 'IDR';
const PDF_MEDIA_TYPE = 'application/pdf';
// reviews.rating is a 1-5 star score (docs/PRD.md §8.4).
const RATING_SCALE = { bestRating: 5, worstRating: 1 } as const;

const ORGANIZATION_ID = absoluteUrl('/#organisasi');
const WEBSITE_ID = absoluteUrl('/#situs');
const organizationRef = { '@id': ORGANIZATION_ID } as const;

const officeAddress: Node<PostalAddress> = {
  '@type': 'PostalAddress',
  addressLocality: siteConfig.locality.city,
  addressRegion: siteConfig.locality.province,
  addressCountry: siteConfig.locality.countryCode,
};

export function governmentOrganizationJsonLd(): Node<GovernmentOrganization> {
  return {
    '@type': 'GovernmentOrganization',
    '@id': ORGANIZATION_ID,
    name: siteConfig.ownerName,
    url: siteConfig.url,
    address: officeAddress,
  };
}

export function webSiteJsonLd(): Node<WebSite> {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: siteConfig.name,
    url: siteConfig.url,
    inLanguage: 'id',
    publisher: organizationRef,
  };
}

export interface TouristAttractionInput {
  name: string;
  description?: string;
  path: string;
  imageUrls?: readonly string[];
}

export function touristAttractionJsonLd(input: TouristAttractionInput): Node<TouristAttraction> {
  return {
    '@type': 'TouristAttraction',
    name: input.name,
    description: input.description,
    url: absoluteUrl(input.path),
    image: input.imageUrls ? [...input.imageUrls] : undefined,
    address: officeAddress,
    // Both RWs are neighbourhoods of the kelurahan, which is the place a visitor searches for.
    containedInPlace: { '@type': 'AdministrativeArea', name: siteConfig.ownerName },
  };
}

export interface EventInput {
  name: string;
  description?: string;
  path: string;
  // ISO 8601 with the +07:00 offset, so the time stays Semarang time.
  startDate: string;
  endDate?: string;
  locationName: string;
}

export function eventJsonLd(input: EventInput): Node<Event> {
  return {
    '@type': 'Event',
    name: input.name,
    description: input.description,
    url: absoluteUrl(input.path),
    startDate: input.startDate,
    endDate: input.endDate,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: input.locationName, address: officeAddress },
    organizer: organizationRef,
  };
}

export interface OfferInput {
  // Integer rupiah (CLAUDE.md §7.1).
  priceIdr: number;
  path: string;
  isAvailable: boolean;
}

export function offerJsonLd(input: OfferInput): Node<Offer> {
  return {
    '@type': 'Offer',
    price: String(input.priceIdr),
    priceCurrency: PRICE_CURRENCY,
    url: absoluteUrl(input.path),
    availability: input.isAvailable ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
  };
}

export interface ProductInput {
  name: string;
  description?: string;
  path: string;
  imageUrls?: readonly string[];
  // The UMKM vendor's name for products, absent for tour packages.
  brandName?: string;
  offer: OfferInput;
}

export function productJsonLd(input: ProductInput): Node<Product> {
  return {
    '@type': 'Product',
    name: input.name,
    description: input.description,
    url: absoluteUrl(input.path),
    image: input.imageUrls ? [...input.imageUrls] : undefined,
    brand: input.brandName ? { '@type': 'Brand', name: input.brandName } : undefined,
    offers: offerJsonLd(input.offer),
  };
}

export interface ArticleInput {
  headline: string;
  description?: string;
  path: string;
  imageUrl?: string;
  datePublished: string;
  dateModified?: string;
}

export function articleJsonLd(input: ArticleInput): Node<Article> {
  return {
    '@type': 'Article',
    headline: input.headline,
    description: input.description,
    url: absoluteUrl(input.path),
    image: input.imageUrl,
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
    inLanguage: 'id',
    author: organizationRef,
    publisher: organizationRef,
  };
}

export interface ReviewInput {
  rating: number;
  body: string;
  // Institution and first name only (docs/PRD.md FR-PUB-05); "Pengunjung" for anonymous reviews.
  authorName: string;
  datePublished: string;
}

export function reviewJsonLd(input: ReviewInput): Node<Review> {
  return {
    '@type': 'Review',
    reviewBody: input.body,
    datePublished: input.datePublished,
    author: { '@type': 'Person', name: input.authorName },
    reviewRating: { '@type': 'Rating', ratingValue: input.rating, ...RATING_SCALE },
  };
}

export interface AggregateRatingInput {
  averageRating: number;
  reviewCount: number;
}

export function aggregateRatingJsonLd(input: AggregateRatingInput): Node<AggregateRating> {
  return {
    '@type': 'AggregateRating',
    ratingValue: input.averageRating,
    reviewCount: input.reviewCount,
    ...RATING_SCALE,
  };
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export function breadcrumbListJsonLd(items: readonly BreadcrumbItem[]): Node<BreadcrumbList> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export interface ImageGalleryInput {
  name: string;
  path: string;
  images: readonly { url: string; caption: string }[];
}

export function imageGalleryJsonLd(input: ImageGalleryInput): Node<ImageGallery> {
  return {
    '@type': 'ImageGallery',
    name: input.name,
    url: absoluteUrl(input.path),
    associatedMedia: input.images.map((image) => ({
      '@type': 'ImageObject',
      contentUrl: image.url,
      caption: image.caption,
    })),
  };
}

export interface DigitalDocumentInput {
  name: string;
  description?: string;
  path: string;
  // The public download route, never the storage object (docs/PRD.md FR-PUB-07).
  downloadPath: string;
}

export function digitalDocumentJsonLd(input: DigitalDocumentInput): Node<DigitalDocument> {
  return {
    '@type': 'DigitalDocument',
    name: input.name,
    description: input.description,
    url: absoluteUrl(input.path),
    // A DigitalDocument has no file URL of its own; the PDF is its encoding.
    encoding: {
      '@type': 'MediaObject',
      contentUrl: absoluteUrl(input.downloadPath),
      encodingFormat: PDF_MEDIA_TYPE,
    },
    publisher: organizationRef,
  };
}

// Array.isArray does not narrow a readonly array, so the union needs its own guard.
function isNodeList(data: JsonLdNode | readonly JsonLdNode[]): data is readonly JsonLdNode[] {
  return Array.isArray(data);
}

// JSON.stringify leaves `<` alone, so a CMS value holding `</script>` could close the tag early.
// Its JSON unicode escape is the same character to a parser and never ends an HTML element.
export function serializeJsonLd(data: JsonLdNode | readonly JsonLdNode[]): string {
  const document = isNodeList(data)
    ? { '@context': SCHEMA_CONTEXT, '@graph': data }
    : { '@context': SCHEMA_CONTEXT, ...data };
  return JSON.stringify(document).replace(/</g, '\\u003c');
}
