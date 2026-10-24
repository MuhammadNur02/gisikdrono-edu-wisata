import type { Metadata } from 'next';

import { OG_SIZE } from '@/config/og';
import { siteConfig } from '@/config/site';

// docs/PRD.md FR-PUB-22: every page title reads `<page> | Edu Wisata Gisikdrono`.
export const TITLE_TEMPLATE = `%s | ${siteConfig.name}`;

// src/app/opengraph-image.tsx. Next.js drops that file's image from a page that sets an openGraph object of its
// own, so the default travels with the defaults; a page with its own opengraph-image.tsx still replaces it.
const DEFAULT_OG_IMAGE = { url: '/opengraph-image', ...OG_SIZE, alt: siteConfig.name };

const OPEN_GRAPH_DEFAULTS = {
  type: 'website',
  locale: 'id_ID',
  siteName: siteConfig.name,
  images: DEFAULT_OG_IMAGE,
} as const;

export function absoluteUrl(path: string): string {
  return new URL(path, siteConfig.url).toString();
}

export const rootMetadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: siteConfig.name, template: TITLE_TEMPLATE },
  applicationName: siteConfig.name,
  openGraph: OPEN_GRAPH_DEFAULTS,
};

export interface PageMetadataInput {
  title: string;
  description?: string;
  // Site-relative path of the page; metadataBase turns it into the absolute canonical URL.
  path: string;
}

// Next.js replaces a parent's openGraph object instead of merging it, so the defaults travel along.
export function buildPageMetadata({ title, description, path }: PageMetadataInput): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { ...OPEN_GRAPH_DEFAULTS, title, description, url: path },
  };
}

// The home page is titled by the bare site name (the template's default), so it takes no page title; its
// description is site_settings `seo.default_description` once the kelurahan has written it.
export function buildHomeMetadata(description?: string): Metadata {
  return {
    description,
    alternates: { canonical: '/' },
    openGraph: { ...OPEN_GRAPH_DEFAULTS, title: siteConfig.name, description, url: '/' },
  };
}
